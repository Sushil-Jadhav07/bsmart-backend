const FeedProfile = require('../models/FeedProfile');
const { SURFACES, DEFAULT_CONFIG } = require('../feed/config');
const { buildFeed } = require('../feed/engine');
const { validateEvents, recordEvents } = require('../feed/events');
const { getFeedConfig, getFeedOverrides, saveFeedOverrides } = require('../feed/settings');
const { getViewerContext, invalidateViewer } = require('../feed/profile');
const { normalizeLanguage, normalizeTerm } = require('../feed/text');

const ADMIN_ROLES = new Set(['admin', 'admin_manager', 'superadmin', 'super_admin']);
const isAdminRole = (role) => ADMIN_ROLES.has(String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_'));

const topWeights = (weights, n) => Object.entries(weights || {})
  .filter(([, w]) => w > 0)
  .sort((a, b) => b[1] - a[1])
  .slice(0, n)
  .map(([term, weight]) => ({ term, weight: Math.round(weight * 100) / 100 }));

// ─── GET /api/feed/:surface ───────────────────────────────────────────────────
exports.getSurfaceFeed = async (req, res) => {
  try {
    const surface = String(req.params.surface || '').toLowerCase();
    if (!SURFACES.includes(surface)) {
      return res.status(400).json({ message: `Unknown feed surface. Use one of: ${SURFACES.join(', ')}` });
    }
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await buildFeed({
      user: req.user,
      surface,
      page,
      limit,
      cursor: req.query.cursor,
      languageHint: req.query.lang || req.headers['accept-language'],
      debug: req.query.debug === 'true' && isAdminRole(req.user?.role),
      baseUrl: `${req.protocol}://${req.get('host')}`,
    });
    res.json(result);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    console.error('[Feed] getSurfaceFeed error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── POST /api/feed/events ────────────────────────────────────────────────────
exports.recordFeedEvents = async (req, res) => {
  try {
    const config = await getFeedConfig();
    const events = req.body?.events;
    if (!Array.isArray(events) || !events.length) {
      return res.status(400).json({ message: '`events` must be a non-empty array' });
    }
    if (events.length > config.events.maxBatch) {
      return res.status(400).json({ message: `At most ${config.events.maxBatch} events per request` });
    }

    const { valid, rejected } = validateEvents(events);
    const result = valid.length
      ? await recordEvents(req.userId, valid, config)
      : { accepted: 0, unknown: 0, learning: Promise.resolve() };
    // Profile learning finishes after the response; failures are only logged.
    result.learning.catch((err) => console.error('[Feed] Profile learning failed:', err.message));

    res.status(202).json({
      accepted: result.accepted,
      rejected: rejected.length + result.unknown,
      errors: rejected.slice(0, 20),
    });
  } catch (error) {
    console.error('[Feed] recordFeedEvents error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── GET /api/feed/preferences ────────────────────────────────────────────────
exports.getFeedPreferences = async (req, res) => {
  try {
    const config = await getFeedConfig();
    const [ctx, profile] = await Promise.all([
      getViewerContext(req.user, config),
      FeedProfile.findOne({ user_id: req.userId }).select('preferred_languages declared_interests').lean(),
    ]);
    res.json({
      preferred_languages: profile?.preferred_languages || [],
      interests: profile?.declared_interests || [],
      inferred: {
        languages: ctx.inferredLanguages,
        top_interests: topWeights(ctx.interests, 15),
      },
    });
  } catch (error) {
    console.error('[Feed] getFeedPreferences error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── PUT /api/feed/preferences ────────────────────────────────────────────────
exports.updateFeedPreferences = async (req, res) => {
  try {
    const { preferred_languages: languages, interests } = req.body || {};
    const update = {};
    const errors = [];

    if (languages !== undefined) {
      if (!Array.isArray(languages) || languages.length > 5) {
        errors.push('preferred_languages must be an array of at most 5 language codes');
      } else {
        const codes = languages.map(normalizeLanguage);
        if (codes.some((code) => !code)) errors.push('preferred_languages contains an invalid language');
        else update.preferred_languages = [...new Set(codes)];
      }
    }
    if (interests !== undefined) {
      if (!Array.isArray(interests) || interests.length > 30 || !interests.every((i) => typeof i === 'string')) {
        errors.push('interests must be an array of at most 30 strings');
      } else {
        update.declared_interests = [...new Set(interests.map(normalizeTerm).filter(Boolean))];
      }
    }
    if (errors.length) return res.status(400).json({ message: errors.join('; '), errors });
    if (!Object.keys(update).length) {
      return res.status(400).json({ message: 'Provide preferred_languages and/or interests' });
    }

    const profile = await FeedProfile.findOneAndUpdate(
      { user_id: req.userId },
      { $set: update },
      { upsert: true, new: true }
    ).select('preferred_languages declared_interests').lean();
    invalidateViewer(req.userId);

    res.json({ preferred_languages: profile.preferred_languages, interests: profile.declared_interests });
  } catch (error) {
    console.error('[Feed] updateFeedPreferences error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── GET /api/feed/admin/config ───────────────────────────────────────────────
exports.getFeedAdminConfig = async (req, res) => {
  try {
    const [effective, overrides] = await Promise.all([getFeedConfig(), getFeedOverrides()]);
    res.json({ defaults: DEFAULT_CONFIG, overrides, effective });
  } catch (error) {
    console.error('[Feed] getFeedAdminConfig error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── PUT /api/feed/admin/config ───────────────────────────────────────────────
exports.updateFeedAdminConfig = async (req, res) => {
  try {
    const overrides = req.body?.overrides;
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
      return res.status(400).json({ message: 'Body must be { "overrides": { … } }. Send {} to reset to defaults.' });
    }
    const result = await saveFeedOverrides(overrides, req.userId);
    if (result.errors) {
      return res.status(400).json({ message: 'Invalid feed config overrides', errors: result.errors });
    }
    res.json({ overrides: result.overrides, effective: result.config });
  } catch (error) {
    console.error('[Feed] updateFeedAdminConfig error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
