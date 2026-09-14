"""MongoDB access. The service reads bSmart's existing collections and only
writes to its own: feeditemvectors, feeduservectors and aiservicestate."""
from datetime import datetime, timezone

import numpy as np
from bson import Binary, ObjectId
from pymongo import MongoClient, UpdateOne


def to_object_id(value):
    if isinstance(value, ObjectId):
        return value
    text = str(value or '')
    return ObjectId(text) if ObjectId.is_valid(text) and len(text) == 24 else None


def vector_to_binary(vector):
    return Binary(np.asarray(vector, dtype=np.float32).tobytes())


def binary_to_vector(data):
    return np.frombuffer(bytes(data), dtype=np.float32).copy()


class Store:
    def __init__(self, settings, client=None):
        self.client = client or MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=5000, tz_aware=True)
        self.db = self.client.get_default_database(default=settings.mongo_db or 'b_smart')
        self.item_vectors = self.db['feeditemvectors']
        self.user_vectors = self.db['feeduservectors']
        self.state = self.db['aiservicestate']
        self.events = self.db['feedevents']

    def ensure_indexes(self):
        self.item_vectors.create_index('item_id', unique=True)
        self.item_vectors.create_index([('created_at', -1)])
        self.user_vectors.create_index('user_id', unique=True)

    # ── bookkeeping ───────────────────────────────────────────────────────
    def get_state(self, key):
        doc = self.state.find_one({'_id': key})
        return doc.get('value') if doc else None

    def set_state(self, key, value):
        self.state.update_one({'_id': key}, {'$set': {'value': value, 'updated_at': datetime.now(timezone.utc)}},
                              upsert=True)

    # ── item vectors ──────────────────────────────────────────────────────
    def save_item_vectors(self, rows, model):
        """rows: [(ItemContent, vector, tags, topics)]"""
        now = datetime.now(timezone.utc)
        ops = [UpdateOne({'item_id': content.item_id}, {'$set': {
            'item_type': content.item_type,
            'author_id': content.author_id,
            'created_at': content.created_at,
            'vector': vector_to_binary(vector),
            'dim': int(len(vector)),
            'tags': tags,
            'topics': topics,
            'has_text': bool(content.text),
            'has_media': bool(content.image_urls or content.video_urls),
            'content_hash': content.content_hash,
            'model': model,
            'indexed_at': now,
        }}, upsert=True) for content, vector, tags, topics in rows]
        if ops:
            self.item_vectors.bulk_write(ops, ordered=False)

    def delete_item_vectors(self, item_ids):
        ids = [i for i in map(to_object_id, item_ids) if i]
        if ids:
            self.item_vectors.delete_many({'item_id': {'$in': ids}})

    def item_vectors_since(self, since, projection=None):
        return self.item_vectors.find({'created_at': {'$gte': since}},
                                      projection or {'item_id': 1, 'item_type': 1, 'author_id': 1,
                                                     'created_at': 1, 'vector': 1})

    def load_item_vectors(self, item_ids):
        ids = [i for i in map(to_object_id, item_ids) if i]
        if not ids:
            return {}
        cursor = self.item_vectors.find({'item_id': {'$in': ids}}, {'item_id': 1, 'vector': 1})
        return {str(doc['item_id']): binary_to_vector(doc['vector']) for doc in cursor}

    # ── user vectors ──────────────────────────────────────────────────────
    def save_user_vector(self, user_id, vector, item_count):
        self.user_vectors.update_one({'user_id': user_id}, {'$set': {
            'vector': vector_to_binary(vector) if vector is not None else None,
            'item_count': item_count,
            'updated_at': datetime.now(timezone.utc),
        }}, upsert=True)

    def get_user_vector(self, user_id):
        return self.user_vectors.find_one({'user_id': user_id})
