// ─── Item helpers shared by retrieval, promotions, events and profiles ──────

const { extractTopics, detectLanguage, itemText } = require('./text');
const { placeFromUser } = require('./geo');

const AUTHOR_FIELD = { post: 'user_id', reel: 'user_id', tweet: 'author', ad: 'user_id', promote_reel: 'user_id' };

const idOf = (value) => (value ? String(value._id || value) : null);

// Posts and reels share the Post collection.
const postItemType = (doc) => (doc?.type === 'reel' ? 'reel' : 'post');

const isVideoItem = (doc, type) => type === 'reel'
  || type === 'promote_reel'
  || (Array.isArray(doc?.media) && doc.media.some((m) => m?.type === 'video' || m?.media_type === 'video'));

// The minimal description used for learning: who made it, what it is about,
// which language it is in.
const describeItem = (doc, type) => ({
  key: String(doc._id),
  type,
  authorId: idOf(doc[AUTHOR_FIELD[type]]),
  topics: extractTopics(doc, type),
  language: detectLanguage(itemText(doc, type)),
});

// A ranking candidate. `doc` is a lean document with its author populated.
const toCandidate = (doc, type, source) => {
  const author = doc[AUTHOR_FIELD[type]];
  const populated = author && typeof author === 'object' && author._id ? author : null;
  return {
    ...describeItem(doc, type),
    doc,
    createdAt: doc.createdAt,
    authorFollowers: populated?.followers_count || 0,
    authorGeo: populated ? placeFromUser(populated) : null,
    authorActive: Boolean(populated) && populated.is_active !== false && !populated.isDeleted,
    locationText: doc.location || '',
    isVideo: isVideoItem(doc, type),
    sources: new Set([source]),
  };
};

module.exports = { AUTHOR_FIELD, idOf, postItemType, isVideoItem, describeItem, toCandidate };
