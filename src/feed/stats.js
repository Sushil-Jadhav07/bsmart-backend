// ─── Per-item feed counters ─────────────────────────────────────────────────

const FeedItemStats = require('../models/FeedItemStats');

const loadItemStats = async (keys) => {
  if (!keys.length) return new Map();
  const rows = await FeedItemStats.find({ item_id: { $in: keys } }).lean();
  return new Map(rows.map((row) => [String(row.item_id), row]));
};

module.exports = { loadItemStats };
