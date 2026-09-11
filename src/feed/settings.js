// ─── Runtime feed config: defaults + admin overrides ────────────────────────

const FeedSettings = require('../models/FeedSettings');
const { DEFAULT_CONFIG, sanitizeOverrides, mergeConfig } = require('./config');

const CACHE_TTL_MS = 60 * 1000;
let cache = null;

const load = async () => {
  if (cache && cache.expiresAt > Date.now()) return cache;
  let stored = {};
  try {
    const doc = await FeedSettings.findOne({ key: 'default' }).lean();
    stored = doc?.overrides || {};
  } catch (err) {
    console.error('[Feed] Could not load feed settings, using defaults:', err.message);
  }
  const { clean } = sanitizeOverrides(DEFAULT_CONFIG, stored);
  cache = { overrides: clean, config: mergeConfig(DEFAULT_CONFIG, clean), expiresAt: Date.now() + CACHE_TTL_MS };
  return cache;
};

const getFeedConfig = async () => (await load()).config;
const getFeedOverrides = async () => (await load()).overrides;

// Replaces all stored overrides; `{}` resets to defaults. Rejects the whole
// update if any key is invalid, so a typo never half-applies.
const saveFeedOverrides = async (overrides, userId) => {
  const { clean, errors } = sanitizeOverrides(DEFAULT_CONFIG, overrides);
  if (errors.length) return { errors };
  await FeedSettings.updateOne(
    { key: 'default' },
    { $set: { overrides: clean, updated_by: userId || null } },
    { upsert: true }
  );
  cache = null;
  return { overrides: clean, config: mergeConfig(DEFAULT_CONFIG, clean) };
};

const clearFeedConfigCache = () => { cache = null; };

module.exports = { getFeedConfig, getFeedOverrides, saveFeedOverrides, clearFeedConfigCache };
