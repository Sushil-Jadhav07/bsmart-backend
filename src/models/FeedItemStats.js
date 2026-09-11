const mongoose = require('mongoose');

// Running counters per content item, incremented from FeedEvent ingestion.
// Gives the ranker impression counts (the denominator for engagement rate)
// and negative-feedback rates, which the content models do not track.

const counter = { type: Number, default: 0 };

const feedItemStatsSchema = new mongoose.Schema({
  item_id: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  item_type: { type: String, enum: ['post', 'reel', 'tweet', 'ad', 'promote_reel'], required: true },
  impressions: counter,
  views: counter,
  completions: counter,
  likes: counter,
  comments: counter,
  shares: counter,
  saves: counter,
  clicks: counter,
  skips: counter,
  hides: counter,
  not_interested: counter,
  dwell_ms_total: counter,
  watch_ms_total: counter,
  last_event_at: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('FeedItemStats', feedItemStatsSchema);
