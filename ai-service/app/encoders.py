"""Embedding models.

ClipEncoder puts captions (about 50 languages, including Hindi and Marathi) and
images into one shared 512-dimensional space: a cricket photo and the caption
"कल का मैच" land close together. FakeEncoder is a deterministic stand-in for
tests that needs no model download.
"""
import hashlib
import re

import numpy as np


def normalize(matrix):
    matrix = np.asarray(matrix, dtype=np.float32)
    if matrix.ndim == 1:
        norm = float(np.linalg.norm(matrix))
        return matrix / norm if norm > 0 else matrix
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return matrix / norms


class ClipEncoder:
    """CLIP ViT-B/32 image encoder + its multilingual text encoder."""

    def __init__(self, image_model, text_model, device='cpu'):
        # Imported here so the API and the tests start without PyTorch installed.
        from sentence_transformers import SentenceTransformer

        self._image_model = SentenceTransformer(image_model, device=device)
        self._text_model = SentenceTransformer(text_model, device=device)
        self.dim = self._text_model.get_sentence_embedding_dimension() or 512
        self.name = f'{image_model.split("/")[-1]}+{text_model.split("/")[-1]}'

    def encode_texts(self, texts):
        if not texts:
            return np.zeros((0, self.dim), np.float32)
        return normalize(self._text_model.encode(
            list(texts), batch_size=32, convert_to_numpy=True, show_progress_bar=False))

    def encode_images(self, images):
        if not images:
            return np.zeros((0, self.dim), np.float32)
        return normalize(self._image_model.encode(
            list(images), batch_size=16, convert_to_numpy=True, show_progress_bar=False))


def _colour_name(r, g, b):
    if max(r, g, b) < 60:
        return 'black'
    if min(r, g, b) > 200:
        return 'white'
    return ('red', 'green', 'blue')[int(np.argmax([r, g, b]))]


class FakeEncoder:
    """Words are hashed into buckets, so texts that share words get similar
    vectors. An image is encoded as the name of its dominant colour, so a red
    image lands next to the word "red"."""

    name = 'fake'

    def __init__(self, dim=64):
        self.dim = dim

    def _bucket(self, word):
        return int(hashlib.md5(word.encode('utf-8')).hexdigest(), 16) % self.dim

    def _encode_words(self, words_per_row):
        out = np.zeros((len(words_per_row), self.dim), np.float32)
        for row, words in enumerate(words_per_row):
            for word in words:
                out[row, self._bucket(word)] += 1
        return normalize(out)

    def encode_texts(self, texts):
        return self._encode_words([re.findall(r'\w+', str(text).lower()) for text in texts])

    def encode_images(self, images):
        words = []
        for image in images:
            pixels = np.asarray(image.convert('RGB'), dtype=np.float32).reshape(-1, 3)
            words.append([_colour_name(*pixels.mean(axis=0))])
        return self._encode_words(words)


def build_encoder(settings):
    if settings.encoder == 'fake':
        return FakeEncoder()
    return ClipEncoder(settings.image_model, settings.text_model, settings.device)
