"""Background indexing.

New content is picked up by `_id` (every collection has an index on it and
ObjectIds grow over time), so no changes to the Node API are needed. On first
start the checkpoint begins `index_days` ago, which backfills recent content.
Once a night, indexed items are compared with their source documents: edited
ones are re-indexed, deleted ones removed.
"""
import logging
import threading
from datetime import datetime, timedelta, timezone

from bson import ObjectId

from .items import SOURCES
from .store import binary_to_vector

log = logging.getLogger(__name__)


def _now():
    return datetime.now(timezone.utc)


class SyncWorker:
    def __init__(self, settings, store, index, indexer_factory):
        self.settings = settings
        self.store = store
        self.index = index
        self._indexer_factory = indexer_factory
        self.indexer = None
        self.status = 'starting'
        self._stop = threading.Event()
        self._thread = None

    @property
    def model_name(self):
        return self.indexer.model if self.indexer else None

    def load_index(self):
        """Loads stored vectors into memory so search works before the models load."""
        cutoff = _now() - timedelta(days=self.settings.index_days)
        count = 0
        for doc in self.store.item_vectors_since(cutoff):
            self.index.upsert(doc['item_id'], binary_to_vector(doc['vector']), doc['item_type'],
                              doc.get('author_id'), doc['created_at'])
            count += 1
        return count

    def ensure_indexer(self):
        if self.indexer is None:
            self.status = 'loading_models'
            self.indexer = self._indexer_factory()
            self.status = 'ready'
        return self.indexer

    def sync_new(self):
        """Indexes documents created since the last checkpoint. Returns how many were read."""
        indexer = self.ensure_indexer()
        cutoff = _now() - timedelta(days=self.settings.index_days)
        start = ObjectId.from_datetime(cutoff)
        processed = 0
        for name, (extract, projection, _) in SOURCES.items():
            key = f'sync:{name}'
            checkpoint = self.store.get_state(key) or start
            docs = list(self.store.db[name].find({'_id': {'$gt': checkpoint}}, projection)
                        .sort('_id', 1).limit(self.settings.sync_batch))
            if not docs:
                continue
            # A new _id can still carry an old createdAt (imported or back-dated data).
            contents = [extract(doc, self.settings) for doc in docs]
            indexer.index_contents([c for c in contents if c and c.created_at >= cutoff])
            self.store.set_state(key, docs[-1]['_id'])
            processed += len(docs)
        return processed

    def reconcile(self):
        """Re-indexes edited items and removes deleted ones. Returns (removed, reindexed)."""
        indexer = self.ensure_indexer()
        cutoff = _now() - timedelta(days=self.settings.index_days)
        removed = reindexed = 0
        for name, (extract, projection, item_types) in SOURCES.items():
            cursor = self.store.item_vectors.find(
                {'item_type': {'$in': list(item_types)}, 'created_at': {'$gte': cutoff}},
                {'item_id': 1, 'content_hash': 1})
            batch = []
            for doc in cursor:
                batch.append(doc)
                if len(batch) >= 500:
                    r, x = self._reconcile_batch(indexer, name, extract, projection, batch)
                    removed, reindexed, batch = removed + r, reindexed + x, []
            if batch:
                r, x = self._reconcile_batch(indexer, name, extract, projection, batch)
                removed, reindexed = removed + r, reindexed + x
        self.index.prune(cutoff)
        self.store.set_state('reconcile:last', _now().date().isoformat())
        log.info('Reconcile: %d removed, %d re-indexed', removed, reindexed)
        return removed, reindexed

    def _reconcile_batch(self, indexer, name, extract, projection, batch):
        ids = [doc['item_id'] for doc in batch]
        sources = {doc['_id']: doc for doc in self.store.db[name].find({'_id': {'$in': ids}}, projection)}
        gone, changed = [], []
        for doc in batch:
            source = sources.get(doc['item_id'])
            content = extract(source, self.settings) if source else None
            if content is None:
                gone.append(doc['item_id'])
            elif content.content_hash != doc.get('content_hash'):
                changed.append(content)
        if gone:
            self.store.delete_item_vectors(gone)
            for item_id in gone:
                self.index.remove(item_id)
        return len(gone), indexer.index_contents(changed) if changed else 0

    def maybe_reconcile(self):
        now = _now()
        if now.hour == self.settings.reconcile_hour_utc and self.store.get_state('reconcile:last') != now.date().isoformat():
            self.reconcile()

    def run_forever(self):
        try:
            log.info('Loaded %d vectors into the search index', self.load_index())
        except Exception:
            log.exception('Could not load stored vectors')
        while not self._stop.is_set():
            try:
                self.ensure_indexer()
            except Exception as err:  # e.g. PyTorch missing or model download failed
                self.status = f'model_error: {err}'
                log.exception('Could not load the models; search keeps working, indexing paused')
                self._stop.wait(300)
                continue
            processed = 0
            try:
                processed = self.sync_new()
                self.maybe_reconcile()
            except Exception:
                log.exception('Sync failed')
            self._stop.wait(0.5 if processed else self.settings.sync_interval_s)

    def start(self):
        self._thread = threading.Thread(target=self.run_forever, name='ai-sync', daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=10)
