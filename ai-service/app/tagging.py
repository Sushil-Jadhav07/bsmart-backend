"""Zero-shot interest tagging.

Each taxonomy label is embedded from its prompts. An item's text and image
vectors are compared with every label (CLIP-style softmax), and the best labels
above a probability threshold become its tags. Generic "distractor" labels
(selfie, group photo, text) absorb ordinary content, so it is not forced into
an interest it does not have.
"""
import json
from pathlib import Path

import numpy as np

from .encoders import normalize

LOGIT_SCALE = 100.0  # CLIP's temperature
DEFAULT_TAXONOMY = Path(__file__).with_name('taxonomy.json')


def load_taxonomy(path=None):
    with open(path or DEFAULT_TAXONOMY, encoding='utf-8') as handle:
        return json.load(handle)


class Tagger:
    def __init__(self, encoder, taxonomy, top_k=3, min_prob=0.2):
        self.top_k = top_k
        self.min_prob = min_prob
        entries = [(label['id'], label.get('terms') or [label['id']], label['prompts'], False)
                   for label in taxonomy['labels']]
        entries += [(d['id'], [], d['prompts'], True) for d in taxonomy.get('distractors', [])]
        self.ids = [entry[0] for entry in entries]
        self.terms = [entry[1] for entry in entries]
        self.is_distractor = [entry[3] for entry in entries]
        self.matrix = np.stack([normalize(encoder.encode_texts(entry[2]).mean(axis=0)) for entry in entries])

    def probabilities(self, vector):
        logits = LOGIT_SCALE * (self.matrix @ np.asarray(vector, dtype=np.float32))
        logits -= logits.max()
        probs = np.exp(logits)
        return probs / probs.sum()

    def tag(self, vectors):
        """vectors: one per modality (text, image). Returns [{label, score, terms}]."""
        if not vectors:
            return []
        probs = np.max([self.probabilities(v) for v in vectors], axis=0)
        tags = []
        for i in np.argsort(-probs):
            if probs[i] < self.min_prob or len(tags) >= self.top_k:
                break
            if not self.is_distractor[i]:
                tags.append({'label': self.ids[i], 'score': round(float(probs[i]), 3), 'terms': self.terms[i]})
        return tags
