"""User taste vectors: a recency-weighted average of the content a user engaged
with. Negative feedback (hide, not interested, skip) pushes the vector away."""
import threading
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import numpy as np

from .encoders import normalize
from .store import binary_to_vector

# Same signal strengths as src/feed/profile.js (EVENT_WEIGHTS).
EVENT_WEIGHTS = {
    'impression': 0, 'view': 0.2, 'dwell': 0.3, 'complete': 1.5,
    'like': 2, 'comment': 3, 'share': 4, 'repost': 4, 'save': 3, 'click': 2, 'follow': 0,
    'skip': -0.5, 'hide': -4, 'not_interested': -5,
}
HALF_LIFE_DAYS = 14


def event_weight(event):
    """Mirrors interactionWeight in src/feed/events.js."""
    kind = event.get('event')
    if kind in ('dwell', 'view'):
        base = EVENT_WEIGHTS['dwell'] * min((event.get('dwell_ms') or 0) / 10000, 3) if kind == 'dwell' \
            else EVENT_WEIGHTS['view']
        completion = event.get('completion_pct')
        weight = base + (completion / 100 if completion is not None else 0)
    else:
        weight = EVENT_WEIGHTS.get(kind, 0)
    return -weight if event.get('undo') else weight


def _as_utc(value):
    if not isinstance(value, datetime):
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def recency(when, now):
    when = _as_utc(when)
    if when is None:
        return 1.0
    return 2 ** (-max(0.0, (now - when).total_seconds() / 86400) / HALF_LIFE_DAYS)


class UserVectors:
    def __init__(self, settings, store, index):
        self.settings = settings
        self.store = store
        self.index = index
        self._cache = {}
        self._lock = threading.Lock()

    def _item_weights(self, user_id):
        now = datetime.now(timezone.utc)
        since = now - timedelta(days=self.settings.user_history_days)
        weights = defaultdict(float)

        for event in self.store.events.find(
                {'user_id': user_id, 'createdAt': {'$gte': since}},
                {'item_id': 1, 'event': 1, 'undo': 1, 'dwell_ms': 1, 'completion_pct': 1, 'createdAt': 1}
        ).sort('createdAt', -1).limit(3000):
            weight = event_weight(event)
            if weight:
                weights[str(event['item_id'])] += weight * recency(event.get('createdAt'), now)

        # Activity from before feed events existed. Items already covered by an
        # event are skipped so nothing is counted twice.
        db = self.store.db
        history = [
            (db['savedposts'].find({'user_id': user_id, 'createdAt': {'$gte': since}}, {'post_id': 1, 'createdAt': 1})
             .limit(300), 'post_id', 'createdAt', lambda doc: EVENT_WEIGHTS['save']),
            (db['postviews'].find({'user_id': user_id, 'updatedAt': {'$gte': since}},
                                  {'post_id': 1, 'completed': 1, 'updatedAt': 1}).limit(500),
             'post_id', 'updatedAt', lambda doc: EVENT_WEIGHTS['complete'] if doc.get('completed') else EVENT_WEIGHTS['view']),
            (db['tweetlikes'].find({'user': user_id, 'createdAt': {'$gte': since}}, {'tweet': 1, 'createdAt': 1})
             .limit(300), 'tweet', 'createdAt', lambda doc: EVENT_WEIGHTS['like']),
            (db['tweetreposts'].find({'user': user_id, 'createdAt': {'$gte': since}}, {'tweet': 1, 'createdAt': 1})
             .limit(200), 'tweet', 'createdAt', lambda doc: EVENT_WEIGHTS['repost']),
            # Post likes are an array on the post with no timestamp; the post's age stands in.
            (db['posts'].find({'likes': user_id, 'createdAt': {'$gte': since}}, {'_id': 1, 'createdAt': 1})
             .limit(300), '_id', 'createdAt', lambda doc: EVENT_WEIGHTS['like']),
        ]
        from_events = set(weights)
        for cursor, id_field, time_field, weigh in history:
            for doc in cursor:
                item_id = str(doc.get(id_field))
                if item_id not in from_events:
                    weights[item_id] += weigh(doc) * recency(doc.get(time_field), now)
        return weights

    def build(self, user_id):
        """Rebuilds and stores the user's vector. Returns (vector or None, items used)."""
        weights = {item: w for item, w in self._item_weights(user_id).items() if w}
        vectors = {item: self.index.get(item) for item in weights}
        missing = [item for item, vector in vectors.items() if vector is None]
        if missing:  # older than the in-memory window, but still stored
            vectors.update(self.store.load_item_vectors(missing))

        total = None
        used = 0
        for item, weight in weights.items():
            vector = vectors.get(item)
            if vector is None or (self.index.dim and len(vector) != self.index.dim):
                continue
            total = vector * weight if total is None else total + vector * weight
            used += 1

        taste = None
        if total is not None and float(np.linalg.norm(total)) > 1e-6:
            taste = normalize(total)
        self.store.save_user_vector(user_id, taste, used)
        with self._lock:
            self._cache[str(user_id)] = (taste, time.time())
        return taste, used

    def get(self, user_id):
        key = str(user_id)
        ttl = self.settings.user_vector_ttl_s
        with self._lock:
            cached = self._cache.get(key)
        if cached and time.time() - cached[1] < ttl:
            return cached[0]
        stored = self.store.get_user_vector(user_id)
        updated = _as_utc(stored.get('updated_at')) if stored else None
        if stored and updated and (datetime.now(timezone.utc) - updated).total_seconds() < ttl:
            taste = binary_to_vector(stored['vector']) if stored.get('vector') else None
            with self._lock:
                self._cache[key] = (taste, updated.timestamp())
            return taste
        return self.build(user_id)[0]
