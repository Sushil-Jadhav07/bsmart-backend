// ─── Auto-detected topics from the AI service ───────────────────────────────
// The AI service tags content with interest topics read from its image and
// text (feeditemvectors.topics), so a food photo with no hashtags still counts
// as "food" — for ranking and for learning what the viewer likes. They are
// appended after the item's own hashtags and tags.

const FeedItemVector = require('../models/FeedItemVector');
const { aiServiceConfigured } = require('./aiClient');

const loadAutoTopics = async (keys) => {
  if (!keys.length || !aiServiceConfigured()) return new Map();
  try {
    const rows = await FeedItemVector.find({ item_id: { $in: keys } }).select('item_id topics').lean();
    return new Map(rows.map((row) => [String(row.item_id), row.topics || []]));
  } catch (err) {
    console.error('[Feed] Could not load auto-detected topics:', err.message);
    return new Map();
  }
};

const mergeTopics = (own, auto, limit = 20) => [...new Set([...(own || []), ...(auto || [])])].slice(0, limit);

module.exports = { loadAutoTopics, mergeTopics };
