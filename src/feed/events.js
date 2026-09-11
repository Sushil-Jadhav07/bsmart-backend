// ─── Feed event ingestion ───────────────────────────────────────────────────
// Clients batch what happened in the feed (impressions, dwell, likes, hides …).
// Each batch is stored raw, rolled into per-item counters, and folded into the
// viewer's learned profile.

const FeedEvent = require('../models/FeedEvent');
const FeedItemStats = require('../models/FeedItemStats');
const Post = require('../models/Post');
const Tweet = require('../models/tweet.model');
const Ad = require('../models/Ad');
const PromoteReel = require('../models/PromoteReel');
const { describeItem, postItemType } = require('./items');
const { EVENT_WEIGHTS, learnFromInteractions, invalidateViewer } = require('./profile');

const { FEED_ITEM_TYPES, FEED_SURFACES, FEED_EVENT_TYPES } = FeedEvent;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const MAX_MS = 60 * 60 * 1000;

const STAT_FIELD = {
  impression: 'impressions', view: 'views', complete: 'completions', like: 'likes',
  comment: 'comments', share: 'shares', save: 'saves', click: 'clicks',
  skip: 'skips', hide: 'hides', not_interested: 'not_interested',
};

const clamp = (value, min, max, integer = false) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(max, Math.max(min, n));
  return integer ? Math.round(clamped) : clamped;
};

// Returns normalized events plus { index, reason } for each rejected one.
const validateEvents = (raw) => {
  const valid = [];
  const rejected = [];
  (Array.isArray(raw) ? raw : []).forEach((event, index) => {
    const reject = (reason) => rejected.push({ index, reason });
    if (!event || typeof event !== 'object') return reject('event must be an object');
    if (!OBJECT_ID_RE.test(String(event.item_id || ''))) return reject('item_id must be a valid id');
    if (!FEED_ITEM_TYPES.includes(event.item_type)) return reject(`item_type must be one of: ${FEED_ITEM_TYPES.join(', ')}`);
    if (!FEED_EVENT_TYPES.includes(event.event)) return reject(`event must be one of: ${FEED_EVENT_TYPES.join(', ')}`);
    valid.push({
      item_id: String(event.item_id),
      item_type: event.item_type,
      event: event.event,
      surface: FEED_SURFACES.includes(event.surface) ? event.surface : 'other',
      position: clamp(event.position, 0, 10000, true),
      dwell_ms: clamp(event.dwell_ms, 0, MAX_MS),
      watch_ms: clamp(event.watch_ms, 0, MAX_MS),
      completion_pct: clamp(event.completion_pct, 0, 100),
    });
    return undefined;
  });
  return { valid, rejected };
};

// How strongly one event says "more like this" (or "less").
const interactionWeight = (event) => {
  if (event.event === 'dwell') return EVENT_WEIGHTS.dwell * Math.min((event.dwell_ms || 0) / 10000, 3);
  if (event.event === 'view') {
    return EVENT_WEIGHTS.view + (event.completion_pct != null ? event.completion_pct / 100 : 0);
  }
  return EVENT_WEIGHTS[event.event] || 0;
};

const ITEM_SOURCES = [
  { types: ['post', 'reel'], model: Post, select: 'user_id caption tags type media.type', typeOf: postItemType },
  { types: ['tweet'], model: Tweet, select: 'author content quoteContent', typeOf: () => 'tweet' },
  {
    types: ['ad'],
    model: Ad,
    select: 'user_id caption ad_title ad_description tags hashtags keywords category sub_category targeting.interests target_preferences',
    typeOf: () => 'ad',
  },
  { types: ['promote_reel'], model: PromoteReel, select: 'user_id caption tags', typeOf: () => 'promote_reel' },
];

// Posts and reels share a collection, so the stored type comes from the
// document, not from what the client claimed.
const loadItems = async (events) => {
  const items = new Map();
  await Promise.all(ITEM_SOURCES.map(async ({ types, model, select, typeOf }) => {
    const ids = [...new Set(events.filter((e) => types.includes(e.item_type)).map((e) => e.item_id))];
    if (!ids.length) return;
    const docs = await model.find({ _id: { $in: ids } }).select(select).lean();
    for (const doc of docs) items.set(String(doc._id), describeItem(doc, typeOf(doc)));
  }));
  return items;
};

const recordEvents = async (userId, events, config) => {
  const items = await loadItems(events);
  const known = events.filter((e) => items.has(e.item_id));
  if (!known.length) return { accepted: 0, unknown: events.length, learning: Promise.resolve() };

  const docs = known.map((e) => {
    const item = items.get(e.item_id);
    return { ...e, user_id: userId, item_type: item.type, author_id: item.authorId };
  });
  await FeedEvent.insertMany(docs, { ordered: false });

  const increments = new Map();
  for (const doc of docs) {
    const entry = increments.get(doc.item_id) || { type: doc.item_type, inc: {} };
    const field = STAT_FIELD[doc.event];
    if (field) entry.inc[field] = (entry.inc[field] || 0) + 1;
    if (doc.dwell_ms) entry.inc.dwell_ms_total = (entry.inc.dwell_ms_total || 0) + doc.dwell_ms;
    if (doc.watch_ms) entry.inc.watch_ms_total = (entry.inc.watch_ms_total || 0) + doc.watch_ms;
    increments.set(doc.item_id, entry);
  }
  const now = new Date();
  await FeedItemStats.bulkWrite([...increments].map(([itemId, { type, inc }]) => ({
    updateOne: {
      filter: { item_id: itemId },
      update: {
        ...(Object.keys(inc).length ? { $inc: inc } : {}),
        $set: { item_type: type, last_event_at: now },
      },
      upsert: true,
    },
  })), { ordered: false });

  // A hide should take effect on the very next feed request.
  if (docs.some((d) => d.event === 'hide' || d.event === 'not_interested')) invalidateViewer(userId);

  const interactions = docs
    .map((d) => ({ item: items.get(d.item_id), weight: interactionWeight(d) }))
    .filter((i) => i.weight !== 0);
  const learning = interactions.length ? learnFromInteractions(userId, interactions, config) : Promise.resolve();

  return { accepted: docs.length, unknown: events.length - known.length, learning };
};

module.exports = { validateEvents, interactionWeight, recordEvents };
