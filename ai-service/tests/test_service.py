"""Sync, taste vectors and the HTTP API against a real mongod, with the fake encoder."""
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.encoders import FakeEncoder
from app.index import VectorIndex
from app.indexer import build_indexer
from app.store import binary_to_vector
from app.sync import SyncWorker
from app.users import UserVectors, event_weight
from conftest import TEST_TAXONOMY

NOW = datetime.now(timezone.utc)
HEADERS = {'X-AI-Token': 'test-token'}


def seed(store):
    """Two authors, cricket and food content, a reply that must be skipped."""
    alice, bob, viewer = ObjectId(), ObjectId(), ObjectId()
    ids = {}

    def insert(collection, name, doc, hours_ago=1):
        doc = {'_id': ObjectId(), 'createdAt': NOW - timedelta(hours=hours_ago), 'isDeleted': False, **doc}
        store.db[collection].insert_one(doc)
        ids[name] = doc['_id']

    insert('posts', 'cricket1', {'user_id': alice, 'type': 'post', 'caption': 'cricket match tonight',
                                 'media': [{'fileName': 'green-ground.jpg', 'type': 'image'}]})
    insert('posts', 'cricket2', {'user_id': bob, 'type': 'post', 'caption': 'what a cricket bat', 'media': []})
    insert('posts', 'food1', {'user_id': bob, 'type': 'post', 'caption': 'street food evening',
                              'media': [{'fileName': 'red-chaat.jpg', 'type': 'image'}]})
    insert('posts', 'imageonly', {'user_id': alice, 'type': 'reel', 'caption': '',
                                  'media': [{'fileName': 'clip.mp4', 'type': 'video',
                                             'thumbnail': {'fileName': 'red-thumb.jpg'}}]})
    insert('posts', 'broken', {'user_id': alice, 'type': 'post', 'caption': '',
                               'media': [{'fileName': 'broken.jpg', 'type': 'image'}]})
    insert('tweets', 'tweet1', {'author': bob, 'content': 'cricket tonight', 'parentTweet': None})
    insert('tweets', 'reply', {'author': alice, 'content': 'cricket reply', 'parentTweet': ObjectId()})
    insert('ads', 'ad1', {'user_id': bob, 'ad_title': 'tasty food delivery', 'category': 'Food & Beverages',
                          'status': 'active', 'media': []})
    insert('posts', 'old', {'user_id': bob, 'type': 'post', 'caption': 'cricket from long ago'}, hours_ago=24 * 200)
    return {'alice': alice, 'bob': bob, 'viewer': viewer, **ids}


@pytest.fixture
def worker(settings, store, fake_images):
    index = VectorIndex()
    return SyncWorker(settings, store, index,
                      lambda: build_indexer(settings, store, index, encoder=FakeEncoder(), taxonomy=TEST_TAXONOMY))


def test_sync_indexes_new_content_with_tags(worker, store):
    ids = seed(store)
    assert worker.sync_new() == 9          # every document read …
    assert worker.sync_new() == 0          # … once

    stored = {str(doc['item_id']): doc for doc in store.item_vectors.find()}
    assert str(ids['reply']) not in stored, 'replies are not feed items'
    assert str(ids['broken']) not in stored, 'nothing readable, nothing stored'
    assert str(ids['old']) not in stored, 'older than the index window'
    assert stored[str(ids['cricket1'])]['topics'] == ['cricket']
    assert stored[str(ids['imageonly'])]['topics'] == ['red'], 'image-only reels get tags from the thumbnail'
    assert stored[str(ids['imageonly'])]['item_type'] == 'reel'
    assert 'food' in stored[str(ids['ad1'])]['topics']
    assert len(worker.index) == len(stored) == 6
    assert store.get_state('sync:posts') == ids['old'], 'checkpoint is the last post read'


def test_reconcile_reindexes_edits_and_removes_deletions(worker, store):
    ids = seed(store)
    worker.sync_new()
    store.db.posts.update_one({'_id': ids['cricket2']}, {'$set': {'caption': 'street food tonight'}})
    store.db.posts.update_one({'_id': ids['food1']}, {'$set': {'isDeleted': True}})

    assert worker.reconcile() == (1, 1)
    assert store.item_vectors.find_one({'item_id': ids['food1']}) is None
    assert worker.index.get(ids['food1']) is None
    assert 'food' in store.item_vectors.find_one({'item_id': ids['cricket2']})['topics']


def test_new_worker_loads_stored_vectors_without_the_models(worker, settings, store):
    ids = seed(store)
    worker.sync_new()
    fresh = SyncWorker(settings, store, VectorIndex(), lambda: pytest.fail('models must not load'))
    assert fresh.load_index() == 6
    assert fresh.index.get(ids['cricket1']) is not None


def test_event_weights_match_the_node_feed():
    assert event_weight({'event': 'like'}) == 2
    assert event_weight({'event': 'like', 'undo': True}) == -2
    assert event_weight({'event': 'hide'}) == -4
    assert event_weight({'event': 'dwell', 'dwell_ms': 10 * 60 * 1000}) == pytest.approx(0.9)
    assert event_weight({'event': 'view', 'completion_pct': 50}) == pytest.approx(0.7)


def test_taste_vector_follows_likes_and_moves_away_from_hides(worker, settings, store):
    ids = seed(store)
    worker.sync_new()
    viewer = ids['viewer']
    store.events.insert_many([
        {'user_id': viewer, 'item_id': ids['cricket1'], 'event': 'like', 'createdAt': NOW},
        {'user_id': viewer, 'item_id': ids['tweet1'], 'event': 'comment', 'createdAt': NOW},
        {'user_id': viewer, 'item_id': ids['food1'], 'event': 'hide', 'createdAt': NOW},
    ])
    users = UserVectors(settings, store, worker.index)
    taste, used = users.build(viewer)
    assert used == 3
    cricket = worker.index.get(ids['cricket2'])
    food = worker.index.get(ids['ad1'])
    assert float(taste @ cricket) > float(taste @ food)

    stored = store.get_user_vector(viewer)
    assert np.allclose(binary_to_vector(stored['vector']), taste)
    assert users.get(viewer) is taste, 'served from cache'


def test_taste_vector_uses_older_activity_when_there_are_no_events(worker, settings, store):
    ids = seed(store)
    worker.sync_new()
    viewer = ids['viewer']
    store.db.savedposts.insert_one({'user_id': viewer, 'post_id': ids['food1'], 'createdAt': NOW})
    taste, used = UserVectors(settings, store, worker.index).build(viewer)
    assert used == 1
    assert float(taste @ worker.index.get(ids['food1'])) == pytest.approx(1.0, abs=1e-5)

    nobody = ObjectId()
    assert UserVectors(settings, store, worker.index).build(nobody) == (None, 0)


# ── HTTP API ──────────────────────────────────────────────────────────────────
@pytest.fixture
def api(settings, store, fake_images):
    from app.main import create_app
    app = create_app(settings, store=store, encoder=FakeEncoder(), taxonomy=TEST_TAXONOMY)
    with TestClient(app) as client:
        yield client, app


def test_api_requires_the_token(api):
    client, _ = api
    assert client.get('/health').status_code == 200
    body = {'user_id': str(ObjectId())}
    assert client.post('/v1/candidates', json=body).status_code == 401
    assert client.post('/v1/candidates', json=body, headers={'X-AI-Token': 'wrong'}).status_code == 401
    assert client.post('/v1/candidates', json={'user_id': 'nope'}, headers=HEADERS).status_code == 400
    assert client.post('/v1/candidates', json={**body, 'types': ['story']}, headers=HEADERS).status_code == 400


def test_api_candidates_score_and_similar(api, store):
    client, app = api
    ids = seed(store)
    app.state.worker.sync_new()
    viewer = ids['viewer']
    store.events.insert_one({'user_id': viewer, 'item_id': ids['cricket1'], 'event': 'save', 'createdAt': NOW})

    health = client.get('/health').json()
    assert health['items_indexed'] == 6 and health['worker'] == 'ready'

    response = client.post('/v1/candidates', headers=HEADERS, json={
        'user_id': str(viewer), 'k': 10, 'types': ['post', 'reel', 'tweet'], 'exclude_author_ids': []}).json()
    assert response['has_profile'] is True
    ranked = [item['item_id'] for item in response['items']]
    assert ranked[0] == str(ids['cricket1'])
    assert ranked.index(str(ids['cricket2'])) < ranked.index(str(ids['food1']))
    assert str(ids['ad1']) not in ranked, 'only the requested types'

    excluded = client.post('/v1/candidates', headers=HEADERS, json={
        'user_id': str(viewer), 'exclude_author_ids': [str(ids['alice'])]}).json()
    assert all(item['item_id'] not in (str(ids['cricket1']), str(ids['imageonly'])) for item in excluded['items'])

    scores = client.post('/v1/score', headers=HEADERS, json={
        'user_id': str(viewer), 'item_ids': [str(ids['cricket2']), str(ids['food1']), str(ObjectId())]}).json()
    assert set(scores['scores']) == {str(ids['cricket2']), str(ids['food1'])}
    assert scores['scores'][str(ids['cricket2'])] > scores['scores'][str(ids['food1'])]

    similar = client.get(f"/v1/items/{ids['cricket2']}/similar?k=3&types=post,tweet", headers=HEADERS).json()
    assert similar['items'][0]['item_id'] in (str(ids['cricket1']), str(ids['tweet1']))
    assert str(ids['cricket2']) not in [item['item_id'] for item in similar['items']]
    assert client.get(f'/v1/items/{ObjectId()}/similar', headers=HEADERS).status_code == 404


def test_api_user_without_history_gets_no_candidates(api, store):
    client, app = api
    seed(store)
    app.state.worker.sync_new()
    response = client.post('/v1/candidates', headers=HEADERS, json={'user_id': str(ObjectId())}).json()
    assert response == {'items': [], 'has_profile': False}
    refreshed = client.post(f'/v1/users/{ObjectId()}/refresh', headers=HEADERS).json()
    assert refreshed == {'has_profile': False, 'items_used': 0}
    labels = client.get('/v1/taxonomy', headers=HEADERS).json()['labels']
    assert [label['id'] for label in labels] == ['cricket', 'food', 'red']
