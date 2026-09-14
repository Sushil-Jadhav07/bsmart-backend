"""Turns bSmart documents (posts, reels, tweets, ads, promote reels) into the
text and media URLs the encoder needs."""
import hashlib
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from .media import VIDEO_URL, resolve_media_url

_URL = re.compile(r'https?://\S+')
_MENTION = re.compile(r'@[\w.]+')


@dataclass
class ItemContent:
    item_id: object
    item_type: str                      # post | reel | tweet | ad | promote_reel
    author_id: object
    created_at: datetime
    text: str
    image_urls: list = field(default_factory=list)
    video_urls: list = field(default_factory=list)
    content_hash: str = ''


def clean_text(text):
    text = _URL.sub(' ', str(text or ''))
    text = _MENTION.sub(' ', text).replace('#', ' ')
    return re.sub(r'\s+', ' ', text).strip()[:500]


def _tag_text(tag):
    if isinstance(tag, str):
        return tag
    if isinstance(tag, dict):
        return tag.get('name') or tag.get('tag') or tag.get('label') or tag.get('value') or ''
    return ''


def _as_utc(value):
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc)


def _media_urls(media_list, settings, type_key='type'):
    """Images to embed. Videos contribute their thumbnails, and are returned
    separately in case they have none."""
    images, videos = [], []
    for media in media_list or []:
        if not isinstance(media, dict):
            continue
        url = resolve_media_url(media.get('fileName'), media.get('fileUrl') or media.get('url'), settings)
        thumbnails = [
            resolve_media_url(t.get('fileName'), t.get('fileUrl'), settings)
            for t in (media.get('thumbnails') or []) if isinstance(t, dict)
        ]
        single = media.get('thumbnail')
        if isinstance(single, dict) and single.get('fileName'):
            thumbnails.append(resolve_media_url(single.get('fileName'), single.get('fileUrl'), settings))
        if media.get(type_key) == 'video' or VIDEO_URL.search(url or ''):
            images.extend(t for t in thumbnails if t)
            if url:
                videos.append(url)
        elif url:
            images.append(url)
    return images, videos


def _content(doc, item_type, author_id, text, images, videos, settings):
    text = clean_text(text)
    images = list(dict.fromkeys(u for u in images if u))[:settings.max_images_per_item]
    videos = list(dict.fromkeys(u for u in videos if u))[:1]
    if not text and not images and not videos:
        return None
    digest = hashlib.sha1('\n'.join([text, *images, *videos]).encode('utf-8')).hexdigest()
    return ItemContent(doc['_id'], item_type, author_id, _as_utc(doc.get('createdAt')),
                       text, images, videos, digest)


def from_post(doc, settings):
    if doc.get('isDeleted'):
        return None
    item_type = 'reel' if doc.get('type') == 'reel' else 'post'
    tags = ' '.join(_tag_text(t) for t in doc.get('tags') or [])
    images, videos = _media_urls(doc.get('media'), settings)
    return _content(doc, item_type, doc.get('user_id'), f"{doc.get('caption') or ''} {tags}",
                    images, videos, settings)


def from_tweet(doc, settings):
    # Replies are not feed items; pure reposts have no content of their own.
    if doc.get('isDeleted') or doc.get('parentTweet'):
        return None
    images = [resolve_media_url(None, m.get('url'), settings) for m in doc.get('media') or [] if isinstance(m, dict)]
    return _content(doc, 'tweet', doc.get('author'),
                    f"{doc.get('content') or ''} {doc.get('quoteContent') or ''}", images, [], settings)


def from_ad(doc, settings):
    if doc.get('isDeleted'):
        return None
    words = [doc.get('ad_title'), doc.get('ad_description'), doc.get('caption'),
             doc.get('category'), doc.get('sub_category')]
    for key in ('tags', 'hashtags', 'keywords'):
        words.extend(_tag_text(t) for t in doc.get(key) or [])
    images, videos = _media_urls(doc.get('media'), settings, type_key='media_type')
    return _content(doc, 'ad', doc.get('user_id'), ' '.join(w for w in words if w), images, videos, settings)


def from_promote_reel(doc, settings):
    if doc.get('isDeleted'):
        return None
    products = doc.get('products') or []
    words = [doc.get('caption') or '', *(_tag_text(t) for t in doc.get('tags') or []),
             *(p.get('product_name') or '' for p in products if isinstance(p, dict))]
    images, videos = _media_urls(doc.get('media'), settings)
    images += [p.get('promote_img') for p in products if isinstance(p, dict) and p.get('promote_img')]
    return _content(doc, 'promote_reel', doc.get('user_id'), ' '.join(words), images, videos, settings)


# collection → (extractor, projection, item types stored from it)
SOURCES = {
    'posts': (from_post, {'user_id': 1, 'caption': 1, 'tags': 1, 'type': 1, 'media': 1, 'isDeleted': 1, 'createdAt': 1},
              ('post', 'reel')),
    'tweets': (from_tweet, {'author': 1, 'content': 1, 'quoteContent': 1, 'media': 1, 'parentTweet': 1,
                            'isDeleted': 1, 'createdAt': 1}, ('tweet',)),
    'ads': (from_ad, {'user_id': 1, 'ad_title': 1, 'ad_description': 1, 'caption': 1, 'category': 1,
                      'sub_category': 1, 'tags': 1, 'hashtags': 1, 'keywords': 1, 'media': 1, 'isDeleted': 1,
                      'createdAt': 1}, ('ad',)),
    'promotereels': (from_promote_reel, {'user_id': 1, 'caption': 1, 'tags': 1, 'products': 1, 'media': 1,
                                         'isDeleted': 1, 'createdAt': 1}, ('promote_reel',)),
}
