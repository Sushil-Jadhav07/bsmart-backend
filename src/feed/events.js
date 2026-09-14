// ─── Feed event ingestion ───────────────────────────────────────────────────
// Two sources feed this pipeline:
//   client — the app batches what only it can see: impressions, dwell and
//            watch time, skips, hides, external shares (POST /api/feed/events)
//   server — the existing APIs report likes, comments, saves, reposts, reel and
//            ad views, completions and ad clicks as they happen (track.js)
// Each event is stored raw, rolled into per-item counters, and folded into the
// viewer's learned profile.

const mongoose = require('mongoose');
const FeedEvent = require('../models/FeedEvent');
const FeedItemStats = require('../models/FeedItemStats');
const Post = require('../models/Post');
const Tweet = require('../models/tweet.model');
const Ad = require('../models/Ad');
const PromoteReel = require('../models/PromoteReel');
const { describeItem, postItemType } = require('./items');
const { EVENT_WEIGHTS, learnFromInteractions, invalidateViewer } = require('./profile');
const { loadAutoTopics, mergeTopics } = require('./autoTopics');

const { FEED_ITEM_TYPES, FEED_SURFACES, FEED_EVENT_TYPES } = FeedEvent;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const MAX_MS = 60 * 60 * 1000;

// Events the app may send. Everything else is recorded by the backend when the
// existing API is called — if the app sent those too they would count twice.
const CLIENT_EVENTS = new Set(['impression', 'dwell', 'skip', 'hide', 'not_interested', 'share', 'click']);

const STAT_FIELD = {
  impression: 'impressions', view: 'views', complete: 'completions', like: 'likes',
  comment: 'comments', share: 'shares', repost: 'shares', save: 'saves', click: 'clicks',
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
const validateEvents = (raw, { source = 'client' } = {}) => {
  const valid = [];
  const rejected = [];
  (Array.isArray(raw) ? raw : []).forEach((event, index) => {
    const reject = (reason) => rejected.push({ index, reason });
    if (!event || typeof event !== 'object') return reject('event must be an object');
    if (!OBJECT_ID_RE.test(String(event.item_id || ''))) return reject('item_id must be a valid id');
    if (!FEED_ITEM_TYPES.includes(event.item_type)) return reject(`item_type must be one of: ${FEED_ITEM_TYPES.join(', ')}`);
    if (!FEED_EVENT_TYPES.includes(event.event)) return reject(`event must be one of: ${FEED_EVENT_TYPES.join(', ')}`);
    if (source === 'client') {
      if (!CLIENT_EVENTS.has(event.event)) {
        return reject(`${event.event} is recorded by the server when the API is called; do not send it`);
      }
      if (event.event === 'click' && event.item_type === 'ad') {
        return reject('ad clicks are recorded by POST /api/ads/:id/click; do not send them');
      }
    }
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

// How strongly one event says "more like this" (negative: "less like this").
// Video completion rides on dwell (from the app) or view (from the server).
const interactionWeight = (event) => {
  let weight;
  if (event.event === 'dwell' || event.event === 'view') {
    const base = event.event === 'dwell'
      ? EVENT_WEIGHTS.dwell * Math.min((event.dwell_ms || 0) / 10000, 3)
      : EVENT_WEIGHTS.view;
    weight = base + (event.completion_pct != null ? event.completion_pct / 100 : 0);
  } else {
    weight = EVENT_WEIGHTS[event.event] || 0;
  }
  return event.undo ? -weight : weight;
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
// document, not from what the caller claimed. Topics the AI service detected
// in the image or text are added, so liking an untagged food photo still
// teaches "food".
const loadItems = async (events, config) => {
  const items = new Map();
  await Promise.all(ITEM_SOURCES.map(async ({ types, model, select, typeOf }) => {
    const ids = [...new Set(events.filter((e) => types.includes(e.item_type)).map((e) => e.item_id))];
    if (!ids.length) return;
    const docs = await model.find({ _id: { $in: ids } }).select(select).lean();
    for (const doc of docs) items.set(String(doc._id), describeItem(doc, typeOf(doc)));
  }));
  if (config?.ai?.enabled && items.size) {
    const autoTopics = await loadAutoTopics([...items.keys()]);
    for (const [key, item] of items) {
      const extra = autoTopics.get(key);
      if (extra?.length) item.topics = mergeTopics(item.topics, extra);
    }
  }
  return items;
};

const updateStats = async (docs) => {
  const increments = new Map();
  const decrements = new Map();
  for (const doc of docs) {
    const target = doc.undo ? decrements : increments;
    const entry = target.get(doc.item_id) || { type: doc.item_type, inc: {} };
    const field = STAT_FIELD[doc.event];
    if (field) entry.inc[field] = (entry.inc[field] || 0) + 1;
    if (!doc.undo && doc.dwell_ms) entry.inc.dwell_ms_total = (entry.inc.dwell_ms_total || 0) + doc.dwell_ms;
    if (!doc.undo && doc.watch_ms) entry.inc.watch_ms_total = (entry.inc.watch_ms_total || 0) + doc.watch_ms;
    target.set(doc.item_id, entry);
  }

  const now = new Date();
  if (increments.size) {
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
  }

  // Undo never takes a counter below zero (the original event may predate tracking).
  const undoOps = [...decrements]
    .filter(([, { inc }]) => Object.keys(inc).length)
    .map(([itemId, { inc }]) => ({
      updateOne: {
        filter: { item_id: new mongoose.Types.ObjectId(itemId) },
        update: [{
          $set: {
            ...Object.fromEntries(Object.entries(inc).map(([field, n]) => [
              field,
              { $max: [0, { $subtract: [{ $ifNull: [`$${field}`, 0] }, n] }] },
            ])),
            last_event_at: now,
            updatedAt: now,
          },
        }],
      },
    }));
  if (undoOps.length) await FeedItemStats.collection.bulkWrite(undoOps, { ordered: false });
};

const recordEvents = async (userId, events, config, { source = 'client' } = {}) => {
  const items = await loadItems(events, config);
  const known = events.filter((e) => items.has(e.item_id));
  if (!known.length) return { accepted: 0, unknown: events.length, learning: Promise.resolve() };

  const docs = known.map((e) => {
    const item = items.get(e.item_id);
    return {
      ...e,
      undo: Boolean(e.undo),
      source,
      user_id: userId,
      item_type: item.type,
      author_id: item.authorId,
    };
  });
  await FeedEvent.insertMany(docs, { ordered: false });
  await updateStats(docs);

  // A hide should take effect on the very next feed request.
  if (docs.some((d) => !d.undo && (d.event === 'hide' || d.event === 'not_interested'))) invalidateViewer(userId);

  const interactions = docs
    .map((d) => ({ item: items.get(d.item_id), weight: interactionWeight(d) }))
    .filter((i) => i.weight !== 0);
  const learning = interactions.length ? learnFromInteractions(userId, interactions, config) : Promise.resolve();

  return { accepted: docs.length, unknown: events.length - known.length, learning };
};

module.exports = { CLIENT_EVENTS, validateEvents, interactionWeight, recordEvents };
