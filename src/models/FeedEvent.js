const mongoose = require('mongoose');

// One document per client-reported feed interaction. This is the raw signal
// the personalized feed learns from (impressions, dwell, hides, …), and the
// only place impressions are recorded — without it engagement *rates* cannot
// be computed.

const FEED_ITEM_TYPES = ['post', 'reel', 'tweet', 'ad', 'promote_reel'];
const FEED_SURFACES = ['home', 'sparks', 'buzz', 'spotlight', 'promotions', 'other'];
const FEED_EVENT_TYPES = [
  'impression', 'view', 'dwell', 'complete',
  'like', 'comment', 'share', 'save', 'click', 'follow',
  'skip', 'hide', 'not_interested',
];

// Raw events expire after this many days. Changing it once the TTL index
// exists requires a manual `collMod` on the index.
const RETENTION_DAYS = parseInt(process.env.FEED_EVENT_RETENTION_DAYS, 10) || 90;

const feedEventSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  item_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  item_type: { type: String, enum: FEED_ITEM_TYPES, required: true },
  author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  surface: { type: String, enum: FEED_SURFACES, default: 'other' },
  event: { type: String, enum: FEED_EVENT_TYPES, required: true },
  position: { type: Number, default: null },
  dwell_ms: { type: Number, default: null },
  watch_ms: { type: Number, default: null },
  completion_pct: { type: Number, default: null },
}, {
  timestamps: { createdAt: true, updatedAt: false },
});

feedEventSchema.index({ user_id: 1, event: 1, createdAt: -1 });
feedEventSchema.index({ user_id: 1, item_id: 1 });
feedEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });

module.exports = mongoose.model('FeedEvent', feedEventSchema);
module.exports.FEED_ITEM_TYPES = FEED_ITEM_TYPES;
module.exports.FEED_SURFACES = FEED_SURFACES;
module.exports.FEED_EVENT_TYPES = FEED_EVENT_TYPES;
