"""Service settings, read from environment variables (see .env.example)."""
import os
from dataclasses import dataclass


def _str(name, default=''):
    value = os.environ.get(name, '').strip()
    return value or default


def _int(name, default):
    try:
        return int(os.environ.get(name, ''))
    except ValueError:
        return default


def _float(name, default):
    try:
        return float(os.environ.get(name, ''))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    mongo_uri: str = 'mongodb://127.0.0.1:27017/b_smart'
    mongo_db: str = ''                  # defaults to the database named in MONGO_URI
    token: str = ''                     # shared secret; the Node API sends it as X-AI-Token
    public_base_url: str = 'https://api.bebsmart.in'
    cloudfront_base_url: str = ''
    encoder: str = 'clip'               # 'clip' in production, 'fake' in tests
    image_model: str = 'sentence-transformers/clip-ViT-B-32'
    text_model: str = 'sentence-transformers/clip-ViT-B-32-multilingual-v1'
    device: str = 'cpu'
    index_days: int = 90                # content older than this is not kept in the search index
    sync_interval_s: float = 15.0
    sync_batch: int = 64
    reconcile_hour_utc: int = 21        # nightly clean-up at ~02:30 IST
    user_vector_ttl_s: int = 6 * 3600
    user_history_days: int = 90
    media_timeout_s: float = 10.0
    media_max_bytes: int = 15 * 1024 * 1024
    max_images_per_item: int = 3
    ffmpeg_path: str = 'ffmpeg'
    tag_top_k: int = 3
    tag_min_prob: float = 0.2
    run_background: bool = True


def load_settings():
    return Settings(
        mongo_uri=_str('MONGO_URI', Settings.mongo_uri),
        mongo_db=_str('MONGO_DB'),
        token=_str('AI_SERVICE_TOKEN'),
        public_base_url=_str('PUBLIC_BASE_URL', Settings.public_base_url).rstrip('/'),
        cloudfront_base_url=_str('CLOUDFRONT_BASE_URL').rstrip('/'),
        encoder=_str('AI_ENCODER', Settings.encoder),
        image_model=_str('AI_IMAGE_MODEL', Settings.image_model),
        text_model=_str('AI_TEXT_MODEL', Settings.text_model),
        device=_str('AI_DEVICE', Settings.device),
        index_days=_int('AI_INDEX_DAYS', Settings.index_days),
        sync_interval_s=_float('AI_SYNC_INTERVAL_S', Settings.sync_interval_s),
        sync_batch=_int('AI_SYNC_BATCH', Settings.sync_batch),
        reconcile_hour_utc=_int('AI_RECONCILE_HOUR_UTC', Settings.reconcile_hour_utc),
        user_vector_ttl_s=_int('AI_USER_VECTOR_TTL_S', Settings.user_vector_ttl_s),
        user_history_days=_int('AI_USER_HISTORY_DAYS', Settings.user_history_days),
        media_timeout_s=_float('AI_MEDIA_TIMEOUT_S', Settings.media_timeout_s),
        media_max_bytes=_int('AI_MEDIA_MAX_BYTES', Settings.media_max_bytes),
        max_images_per_item=_int('AI_MAX_IMAGES_PER_ITEM', Settings.max_images_per_item),
        ffmpeg_path=_str('FFMPEG_PATH', Settings.ffmpeg_path),
        tag_top_k=_int('AI_TAG_TOP_K', Settings.tag_top_k),
        tag_min_prob=_float('AI_TAG_MIN_PROB', Settings.tag_min_prob),
        run_background=_str('AI_RUN_BACKGROUND', 'true').lower() != 'false',
    )
