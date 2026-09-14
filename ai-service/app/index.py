"""In-memory vector index.

Exact cosine search over normalised vectors with per-item metadata for
filtering (type, author, age). At 512 floats per item, 200k items take about
400 MB; beyond a few hundred thousand, swap this class for FAISS/HNSW or a
vector database behind the same methods.
"""
import threading
from datetime import datetime

import numpy as np

TYPE_CODES = {'post': 1, 'reel': 2, 'tweet': 3, 'ad': 4, 'promote_reel': 5}
TYPE_NAMES = {code: name for name, code in TYPE_CODES.items()}


class VectorIndex:
    def __init__(self, dim=None, capacity=1024):
        self.dim = dim
        self._lock = threading.RLock()
        self._capacity = capacity
        self._rows = {}           # item_id -> row
        self._ids = []            # row -> item_id (None when free)
        self._free = []
        self._author_codes = {}
        self._vectors = None
        self._active = np.zeros(capacity, bool)
        self._types = np.zeros(capacity, np.int8)
        self._authors = np.full(capacity, -1, np.int32)
        self._created = np.zeros(capacity, np.float64)
        if dim:
            self._vectors = np.zeros((capacity, dim), np.float32)

    def __len__(self):
        return len(self._rows)

    def _grow(self):
        new = self._capacity * 2
        self._vectors = np.vstack([self._vectors, np.zeros((new - self._capacity, self.dim), np.float32)])
        self._active = np.concatenate([self._active, np.zeros(new - self._capacity, bool)])
        self._types = np.concatenate([self._types, np.zeros(new - self._capacity, np.int8)])
        self._authors = np.concatenate([self._authors, np.full(new - self._capacity, -1, np.int32)])
        self._created = np.concatenate([self._created, np.zeros(new - self._capacity, np.float64)])
        self._capacity = new

    def upsert(self, item_id, vector, item_type, author_id, created_at):
        item_id = str(item_id)
        vector = np.asarray(vector, dtype=np.float32)
        with self._lock:
            if self._vectors is None:
                self.dim = vector.shape[0]
                self._vectors = np.zeros((self._capacity, self.dim), np.float32)
            if vector.shape[0] != self.dim:
                raise ValueError(f'vector has {vector.shape[0]} dims, index has {self.dim}')
            row = self._rows.get(item_id)
            if row is None:
                if self._free:
                    row = self._free.pop()
                    self._ids[row] = item_id
                else:
                    row = len(self._ids)
                    if row >= self._capacity:
                        self._grow()
                    self._ids.append(item_id)
                self._rows[item_id] = row
            author = str(author_id or '')
            code = self._author_codes.setdefault(author, len(self._author_codes))
            self._vectors[row] = vector
            self._active[row] = True
            self._types[row] = TYPE_CODES.get(item_type, 0)
            self._authors[row] = code
            self._created[row] = created_at.timestamp() if isinstance(created_at, datetime) else float(created_at or 0)

    def remove(self, item_id):
        with self._lock:
            row = self._rows.pop(str(item_id), None)
            if row is None:
                return False
            self._active[row] = False
            self._ids[row] = None
            self._free.append(row)
            return True

    def get(self, item_id):
        with self._lock:
            row = self._rows.get(str(item_id))
            return None if row is None else self._vectors[row].copy()

    def item_type(self, item_id):
        with self._lock:
            row = self._rows.get(str(item_id))
            return None if row is None else TYPE_NAMES.get(int(self._types[row]))

    def prune(self, older_than):
        """Drops items created before `older_than` (a datetime)."""
        cutoff = older_than.timestamp()
        with self._lock:
            stale = [item for item, row in self._rows.items() if self._created[row] < cutoff]
            for item in stale:
                self.remove(item)
            return len(stale)

    def search(self, query, k, types=None, since=None, exclude_authors=(), exclude_ids=()):
        """Returns [(item_id, item_type, score)], best first."""
        query = np.asarray(query, dtype=np.float32)
        with self._lock:
            n = len(self._ids)
            if not n or self._vectors is None or k <= 0:
                return []
            mask = self._active[:n].copy()
            if types:
                mask &= np.isin(self._types[:n], [TYPE_CODES[t] for t in types if t in TYPE_CODES])
            if since is not None:
                mask &= self._created[:n] >= since.timestamp()
            codes = [self._author_codes[a] for a in map(str, exclude_authors) if a in self._author_codes]
            if codes:
                mask &= ~np.isin(self._authors[:n], codes)
            for item in exclude_ids:
                row = self._rows.get(str(item))
                if row is not None:
                    mask[row] = False
            rows = np.flatnonzero(mask)
            if not rows.size:
                return []
            scores = self._vectors[rows] @ query
            take = min(k, rows.size)
            top = np.argpartition(-scores, take - 1)[:take]
            top = top[np.argsort(-scores[top])]
            return [(self._ids[rows[i]], TYPE_NAMES.get(int(self._types[rows[i]])), float(scores[i])) for i in top]
