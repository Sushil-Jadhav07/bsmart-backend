"""Embeds and tags content, then saves it to MongoDB and the in-memory index."""
import logging
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from . import media
from .encoders import build_encoder, normalize
from .tagging import Tagger, load_taxonomy

log = logging.getLogger(__name__)


class Indexer:
    def __init__(self, settings, encoder, tagger, store, index):
        self.settings = settings
        self.encoder = encoder
        self.tagger = tagger
        self.store = store
        self.index = index
        self.model = encoder.name

    def _images_for(self, content):
        images = [image for image in (media.download_image(url, self.settings) for url in content.image_urls)
                  if image is not None]
        if not images and content.video_urls:
            images = media.extract_video_frames(content.video_urls[0], self.settings)
        return images

    def index_contents(self, contents):
        """Returns how many items were indexed. Items with neither readable
        text nor a downloadable image are skipped."""
        contents = [content for content in contents if content]
        if not contents:
            return 0

        with ThreadPoolExecutor(max_workers=8) as pool:
            images_per_item = list(pool.map(self._images_for, contents))

        text_rows = [i for i, content in enumerate(contents) if content.text]
        text_vectors = self.encoder.encode_texts([contents[i].text for i in text_rows]) if text_rows else []
        text_by_row = dict(zip(text_rows, text_vectors))

        flat_images = [image for images in images_per_item for image in images]
        image_vectors = self.encoder.encode_images(flat_images) if flat_images else None

        rows = []
        cursor = 0
        for i, content in enumerate(contents):
            parts = []
            if i in text_by_row:
                parts.append(text_by_row[i])
            count = len(images_per_item[i])
            if count:
                parts.append(normalize(image_vectors[cursor:cursor + count].mean(axis=0)))
                cursor += count
            if not parts:
                continue
            vector = normalize(np.mean(parts, axis=0))
            tags = self.tagger.tag(parts)
            topics = sorted({term for tag in tags for term in tag['terms']})
            rows.append((content, vector, [{'label': t['label'], 'score': t['score']} for t in tags], topics))

        self.store.save_item_vectors(rows, self.model)
        for content, vector, _, _ in rows:
            self.index.upsert(content.item_id, vector, content.item_type, content.author_id, content.created_at)
        return len(rows)


def build_indexer(settings, store, index, encoder=None, taxonomy=None):
    """Loads the models (slow: tens of seconds on first run) and returns an Indexer."""
    encoder = encoder or build_encoder(settings)
    tagger = Tagger(encoder, taxonomy or load_taxonomy(), settings.tag_top_k, settings.tag_min_prob)
    log.info('Models ready: %s', encoder.name)
    return Indexer(settings, encoder, tagger, store, index)
