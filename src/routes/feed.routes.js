const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const rateLimit = require('../middleware/rateLimit');
const {
  getSurfaceFeed,
  recordFeedEvents,
  getFeedPreferences,
  updateFeedPreferences,
  getFeedAdminConfig,
  updateFeedAdminConfig,
} = require('../controllers/feed.controller');

// Static per-user limiters. Unlike dynamicRateLimit, `limit` here is only the
// page size, so a small page never lowers the rate limit.
const personalizedFeedRateLimit = rateLimit({
  windowMs: parseInt(process.env.PERSONALIZED_FEED_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max: parseInt(process.env.PERSONALIZED_FEED_RATE_LIMIT_MAX) || 90,
  keyGenerator: (req) => `feed:personalized:${req.userId || req.ip}`,
});

const feedEventsRateLimit = rateLimit({
  windowMs: parseInt(process.env.FEED_EVENTS_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max: parseInt(process.env.FEED_EVENTS_RATE_LIMIT_MAX) || 120,
  keyGenerator: (req) => `feed:events:${req.userId || req.ip}`,
});

/**
 * @swagger
 * tags:
 *   name: Personalized Feed
 *   description: |
 *     Per-user ranked feeds (Home, Sparks, Buzz, Spotlight, Promotions) personalised by location,
 *     language, interests, following, watch behaviour, engagement, freshness and trending.
 *     Clients should report impressions and interactions to `POST /api/feed/events`.
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     FeedMeta:
 *       type: object
 *       properties:
 *         surface: { type: string, example: home }
 *         rank: { type: integer, example: 4 }
 *         reasons:
 *           type: array
 *           items: { type: string }
 *           example: [following, fresh]
 *           description: "Why the item was shown: yours, following, interests, nearby, language, trending, fresh, new_for_you, sponsored, targeted, recommended"
 *         sources:
 *           type: array
 *           items: { type: string }
 *           example: [following, recent]
 *         score: { type: number, description: "Admins only, with ?debug=true" }
 *         terms: { type: object, description: "Admins only, with ?debug=true — per-term score breakdown" }
 *     PersonalizedFeedResponse:
 *       type: object
 *       properties:
 *         surface: { type: string, example: home }
 *         page: { type: integer, example: 1 }
 *         limit: { type: integer, example: 20 }
 *         session_id: { type: string }
 *         next_cursor: { type: string, nullable: true }
 *         has_more: { type: boolean }
 *         session_restarted:
 *           type: boolean
 *           description: Present when the cursor's session expired and the ranking restarted from the top
 *         languages:
 *           type: array
 *           items: { type: string }
 *           example: [hi, en]
 *         data:
 *           type: array
 *           description: |
 *             Same item shapes as GET /api/posts/feed (`item_type` = post | reel | tweet | ad | promote_reel),
 *             each with an extra `feed_meta` object.
 *           items:
 *             type: object
 *             properties:
 *               item_type: { type: string }
 *               feed_meta: { $ref: '#/components/schemas/FeedMeta' }
 *     FeedEventInput:
 *       type: object
 *       required: [item_id, item_type, event]
 *       properties:
 *         item_id: { type: string, example: 665f1c2e9b1e8a0012345678 }
 *         item_type: { type: string, enum: [post, reel, tweet, ad, promote_reel] }
 *         event:
 *           type: string
 *           enum: [impression, view, dwell, complete, like, comment, share, save, click, follow, skip, hide, not_interested]
 *         surface: { type: string, enum: [home, sparks, buzz, spotlight, promotions, other] }
 *         position: { type: integer, description: 1-based position in the feed }
 *         dwell_ms: { type: number, description: Time the item was on screen }
 *         watch_ms: { type: number, description: Video watch time }
 *         completion_pct: { type: number, minimum: 0, maximum: 100 }
 */

/**
 * @swagger
 * /api/feed/events:
 *   post:
 *     summary: Report feed impressions and interactions (batched)
 *     description: |
 *       Send up to 100 events per request, e.g. every few seconds while scrolling.
 *       `impression` should be sent once an item is at least 50% visible. `hide` / `not_interested`
 *       remove the item from the viewer's next feed request. Events for unknown items are ignored.
 *     tags: [Personalized Feed]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [events]
 *             properties:
 *               events:
 *                 type: array
 *                 maxItems: 100
 *                 items: { $ref: '#/components/schemas/FeedEventInput' }
 *     responses:
 *       202:
 *         description: Events accepted
 *         content:
 *           application/json:
 *             example: { accepted: 3, rejected: 1, errors: [{ index: 2, reason: "item_id must be a valid id" }] }
 *       400:
 *         description: Missing or oversized batch
 */
router.post('/events', verifyToken, feedEventsRateLimit, recordFeedEvents);

/**
 * @swagger
 * /api/feed/preferences:
 *   get:
 *     summary: Get the viewer's feed preferences and what the feed has inferred
 *     tags: [Personalized Feed]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences
 *         content:
 *           application/json:
 *             example:
 *               preferred_languages: [hi, en]
 *               interests: [cricket, travel]
 *               inferred:
 *                 languages: [en]
 *                 top_interests: [{ term: cricket, weight: 7.5 }]
 *   put:
 *     summary: Set preferred languages and/or declared interests (e.g. from onboarding)
 *     tags: [Personalized Feed]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               preferred_languages:
 *                 type: array
 *                 maxItems: 5
 *                 items: { type: string }
 *                 example: [hi, en]
 *                 description: "Codes (hi, en, ta, hi-Latn for Hinglish …) or names (Hindi, English …). An empty array switches back to inferred languages."
 *               interests:
 *                 type: array
 *                 maxItems: 30
 *                 items: { type: string }
 *                 example: [cricket, travel, food]
 *     responses:
 *       200:
 *         description: Saved preferences
 *       400:
 *         description: Validation error
 */
router.get('/preferences', verifyToken, getFeedPreferences);
router.put('/preferences', verifyToken, updateFeedPreferences);

/**
 * @swagger
 * /api/feed/admin/config:
 *   get:
 *     summary: Get feed ranking config (defaults, overrides, effective) — admin only
 *     tags: [Personalized Feed]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Config
 *       403:
 *         description: Admin only
 *   put:
 *     summary: Replace feed ranking overrides — admin only
 *     description: |
 *       Overrides are deep-merged onto the defaults and take effect within a minute, without a deploy.
 *       Only keys that exist in the defaults are accepted; any invalid key rejects the whole update.
 *       Send `{ "overrides": {} }` to reset.
 *     tags: [Personalized Feed]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             overrides:
 *               surfaces:
 *                 home:
 *                   weights: { affinity: 0.35, freshness: 0.15 }
 *               exploration: { rate: 0.1 }
 *     responses:
 *       200:
 *         description: Saved
 *       400:
 *         description: Invalid overrides (errors listed)
 *       403:
 *         description: Admin only
 */
router.get('/admin/config', requireAdmin, getFeedAdminConfig);
router.put('/admin/config', requireAdmin, updateFeedAdminConfig);

/**
 * @swagger
 * /api/feed/{surface}:
 *   get:
 *     summary: Get a personalized feed
 *     description: |
 *       Surfaces:
 *       - `home` — posts, reels and tweets, with promotions interleaved
 *       - `sparks` — reels (short video), with video promotions interleaved
 *       - `buzz` — tweet-style posts
 *       - `spotlight` — trending / discovery from creators the viewer does not follow
 *       - `promotions` — ads and promote reels ranked by targeting and interest
 *
 *       Page 1 always re-ranks (pull-to-refresh). Continue with `cursor` (preferred) or `page`;
 *       both read from the same cached ranking for ~10 minutes, so pages never overlap.
 *       Blocked, muted and private-unfollowed accounts, hidden and reported items are excluded.
 *     tags: [Personalized Feed]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: surface
 *         required: true
 *         schema: { type: string, enum: [home, sparks, buzz, spotlight, promotions] }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *         description: Page size
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *         description: next_cursor from the previous page
 *       - in: query
 *         name: lang
 *         schema: { type: string, example: "hi,en" }
 *         description: Language hint (defaults to the Accept-Language header). Ignored when the user set preferred languages.
 *       - in: query
 *         name: debug
 *         schema: { type: boolean }
 *         description: Admins only — include score breakdowns in feed_meta
 *     responses:
 *       200:
 *         description: Ranked feed page
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PersonalizedFeedResponse'
 *       400:
 *         description: Unknown surface or invalid cursor
 *       429:
 *         description: Too many requests
 */
router.get('/:surface', verifyToken, personalizedFeedRateLimit, getSurfaceFeed);

module.exports = router;
