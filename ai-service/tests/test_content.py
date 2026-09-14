"""Media URL resolution, content extraction, vector index and tagging (no database)."""
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from bson import ObjectId

from app.config import Settings
from app.encoders import FakeEncoder, normalize
from app.index import VectorIndex
from app.items import clean_text, from_ad, from_post, from_promote_reel, from_tweet
from app.media import download_image, resolve_media_url
from app.tagging import Tagger
from conftest import TEST_TAXONOMY

S = Settings(public_base_url='https://api.test', cloudfront_base_url='https://cdn.test')
NOW = datetime(2026, 9, 14, tzinfo=timezone.utc)


# ── media ─────────────────────────────────────────────────────────────────────
def test_resolve_media_url_matches_the_node_helper():
    assert resolve_media_url('photo.jpg', None, S) == 'https://cdn.test/uploads/photo.jpg'
    assert resolve_media_url('uploads/a/b.jpg', None, S) == 'https://cdn.test/uploads/a/b.jpg'
    assert resolve_media_url('/uploads/a.jpg', None, S) == 'https://cdn.test/uploads/a.jpg'
    assert resolve_media_url(None, 'https://api.bebsmart.in/uploads/x.jpg', S) == 'https://cdn.test/uploads/x.jpg'
    assert resolve_media_url(None, 'https://other.test/x.jpg', S) == 'https://other.test/x.jpg'
    assert resolve_media_url(None, '/static/x.jpg', S) == 'https://api.test/static/x.jpg'
    assert resolve_media_url('photo.jpg', None, Settings(public_base_url='https://api.test')) == \
        'https://api.test/uploads/photo.jpg'
    assert resolve_media_url(None, None, S) == ''


def test_download_image_refuses_videos_and_non_http():
    assert download_image('https://cdn.test/uploads/clip.mp4', S) is None
    assert download_image('https://cdn.test/uploads/master.m3u8', S) is None
    assert download_image('file:///etc/passwd', S) is None
    assert download_image('', S) is None


# ── content extraction ────────────────────────────────────────────────────────
def post(**fields):
    return {'_id': ObjectId(), 'user_id': ObjectId(), 'createdAt': NOW, **fields}


def test_clean_text_drops_links_mentions_and_hash_signs():
    assert clean_text('Great #Cricket match @rahul https://x.test/a  today') == 'Great Cricket match today'


def test_image_post_uses_caption_tags_and_images():
    content = from_post(post(caption='Weekend #travel', tags=['Beach', {'name': 'Goa'}],
                             media=[{'fileName': 'a.jpg', 'type': 'image'}, {'fileName': 'b.jpg', 'type': 'image'}]), S)
    assert content.item_type == 'post'
    assert content.text == 'Weekend travel Beach Goa'
    assert content.image_urls == ['https://cdn.test/uploads/a.jpg', 'https://cdn.test/uploads/b.jpg']
    assert content.video_urls == []


def test_reel_uses_its_thumbnail_and_keeps_the_video_for_frames():
    content = from_post(post(type='reel', caption='', media=[{
        'fileName': 'clip.mp4', 'type': 'video', 'thumbnails': [], 'thumbnail': {'fileName': 'thumb.jpg'}}]), S)
    assert content.item_type == 'reel'
    assert content.image_urls == ['https://cdn.test/uploads/thumb.jpg']
    assert content.video_urls == ['https://cdn.test/uploads/clip.mp4']


def test_items_that_are_not_feed_content_are_skipped():
    assert from_post(post(caption='gone', isDeleted=True, media=[{'fileName': 'a.jpg'}]), S) is None
    assert from_post(post(caption='', media=[]), S) is None
    assert from_tweet({'_id': ObjectId(), 'author': ObjectId(), 'content': 'reply', 'parentTweet': ObjectId()}, S) is None


def test_tweet_ad_and_promote_reel_extraction():
    tweet = from_tweet({'_id': ObjectId(), 'author': ObjectId(), 'content': 'Hello', 'quoteContent': 'world',
                        'media': [{'url': 'https://cdn.test/uploads/t.jpg', 'type': 'image'}]}, S)
    assert (tweet.item_type, tweet.text, tweet.image_urls) == ('tweet', 'Hello world', ['https://cdn.test/uploads/t.jpg'])

    ad = from_ad({'_id': ObjectId(), 'user_id': ObjectId(), 'ad_title': 'Running shoes', 'category': 'Sports & Fitness',
                  'hashtags': ['#marathon'], 'media': [{'fileName': 'ad.mp4', 'media_type': 'video',
                                                        'thumbnails': [{'fileUrl': 'https://cdn.test/t.jpg'}]}]}, S)
    assert ad.item_type == 'ad'
    assert 'Running shoes' in ad.text and 'Sports & Fitness' in ad.text and 'marathon' in ad.text
    assert ad.image_urls == ['https://cdn.test/t.jpg']

    promo = from_promote_reel({'_id': ObjectId(), 'user_id': ObjectId(), 'caption': 'New drop',
                               'products': [{'product_name': 'Sneakers', 'promote_img': 'https://cdn.test/p.jpg'}],
                               'media': [{'fileName': 'p.mp4', 'type': 'video'}]}, S)
    assert 'Sneakers' in promo.text
    assert promo.image_urls == ['https://cdn.test/p.jpg']


def test_content_hash_changes_with_the_caption():
    doc = post(caption='one', media=[{'fileName': 'a.jpg'}])
    first = from_post(doc, S).content_hash
    assert from_post({**doc, 'caption': 'two'}, S).content_hash != first
    assert from_post(doc, S).content_hash == first


# ── vector index ──────────────────────────────────────────────────────────────
def unit(*values):
    return normalize(np.array(values, dtype=np.float32))


def test_index_search_ranks_by_similarity_and_applies_filters():
    index = VectorIndex(capacity=2)  # small, so it has to grow
    a1, a2 = ObjectId(), ObjectId()
    index.upsert('p1', unit(1, 0, 0), 'post', a1, NOW)
    index.upsert('p2', unit(0.9, 0.1, 0), 'reel', a2, NOW - timedelta(days=40))
    index.upsert('p3', unit(0, 1, 0), 'tweet', a1, NOW)
    assert len(index) == 3

    query = unit(1, 0, 0)
    assert [hit[0] for hit in index.search(query, 3)] == ['p1', 'p2', 'p3']
    assert [hit[0] for hit in index.search(query, 3, types=['reel', 'tweet'])] == ['p2', 'p3']
    assert [hit[0] for hit in index.search(query, 3, since=NOW - timedelta(days=30))] == ['p1', 'p3']
    assert [hit[0] for hit in index.search(query, 3, exclude_authors=[str(a1)])] == ['p2']
    assert [hit[0] for hit in index.search(query, 3, exclude_ids=['p1'])] == ['p2', 'p3']
    assert index.search(query, 1)[0][1] == 'post'


def test_index_upsert_replaces_and_remove_frees_the_row():
    index = VectorIndex()
    index.upsert('x', unit(1, 0), 'post', None, NOW)
    index.upsert('x', unit(0, 1), 'post', None, NOW)
    assert len(index) == 1
    assert np.allclose(index.get('x'), unit(0, 1))
    assert index.remove('x') and index.get('x') is None and len(index) == 0
    index.upsert('y', unit(1, 0), 'post', None, NOW)
    assert index.search(unit(1, 0), 5)[0][0] == 'y'
    assert index.prune(NOW + timedelta(days=1)) == 1 and len(index) == 0
    with pytest.raises(ValueError):
        index.upsert('z', unit(1, 0, 0), 'post', None, NOW)


# ── tagging ───────────────────────────────────────────────────────────────────
def test_tagger_finds_the_matching_interest():
    encoder = FakeEncoder()
    tagger = Tagger(encoder, TEST_TAXONOMY, top_k=3, min_prob=0.3)
    tags = tagger.tag([encoder.encode_texts(['cricket match tonight'])[0]])
    assert tags[0]['label'] == 'cricket'
    assert tags[0]['terms'] == ['cricket']


def test_tagger_leaves_ordinary_content_untagged():
    encoder = FakeEncoder()
    tagger = Tagger(encoder, TEST_TAXONOMY, top_k=3, min_prob=0.3)
    assert tagger.tag([encoder.encode_texts(['person selfie'])[0]]) == []


def test_tagger_combines_text_and_image():
    from PIL import Image
    encoder = FakeEncoder()
    tagger = Tagger(encoder, TEST_TAXONOMY, top_k=3, min_prob=0.3)
    text = encoder.encode_texts(['street food'])[0]
    image = encoder.encode_images([Image.new('RGB', (8, 8), (230, 10, 10))])[0]
    labels = {tag['label'] for tag in tagger.tag([text, image])}
    assert labels == {'food', 'red'}
