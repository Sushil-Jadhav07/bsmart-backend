const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const rateLimit = require('../middleware/rateLimit');
const { upload } = require('../config/multer');
const {
  createAd,
  listAds,
  getAdsFeed,
  getUserAdsWithComments,
  getAdById,
  getAdCategories,
  addAdCategory,
  recordAdView,
  recordClick,
  likeAd,
  dislikeAd,
  saveAd,
  unsaveAd,
  deleteAd,
  updateAdMetadata,
  searchAds
} = require('../controllers/ad.controller');
const {
  addAdComment,
  getAdComments,
  deleteAdComment,
  likeAdComment,
  dislikeAdComment,
  getAdCommentReplies
} = require('../controllers/adComment.controller');
const { getAdStats } = require('../controllers/adstats.controller');

/**
 * @swagger
 * tags:
 *   name: Ads
 *   description: Advertisement management
 */

// ─────────────────────────────────────────────────────────────────────────────
// Reusable Swagger component schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * components:
 *   schemas:
 *
 *     AdMedia:
 *       type: object
 *       required:
 *         - fileName
 *       properties:
 *         fileName:
 *           type: string
 *           example: "string"
 *         media_type:
 *           type: string
 *           example: "image"
 *         video_meta:
 *           type: object
 *           properties:
 *             original_length_seconds:
 *               type: number
 *               example: 0
 *             selected_start:
 *               type: number
 *               example: 0
 *             selected_end:
 *               type: number
 *               example: 0
 *             final_duration:
 *               type: number
 *               example: 0
 *             thumbnail_time:
 *               type: number
 *               example: 0
 *         image_editing:
 *           type: object
 *           properties:
 *             filter:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                   example: "string"
 *                 css:
 *                   type: string
 *                   example: "string"
 *             adjustments:
 *               type: object
 *               properties:
 *                 brightness:
 *                   type: number
 *                   example: 0
 *                 contrast:
 *                   type: number
 *                   example: 0
 *                 saturation:
 *                   type: number
 *                   example: 0
 *                 temperature:
 *                   type: number
 *                   example: 0
 *                 fade:
 *                   type: number
 *                   example: 0
 *                 vignette:
 *                   type: number
 *                   example: 0
 *         crop_settings:
 *           type: object
 *           properties:
 *             mode:
 *               type: string
 *               example: "original"
 *             aspect_ratio:
 *               type: string
 *               example: "string"
 *             zoom:
 *               type: number
 *               example: 0
 *             x:
 *               type: number
 *               example: 0
 *             y:
 *               type: number
 *               example: 0
 *         timing_window:
 *           type: object
 *           properties:
 *             start:
 *               type: number
 *               example: 0
 *             end:
 *               type: number
 *               example: 0
 *         thumbnails:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               fileName:
 *                 type: string
 *                 example: "string"
 *               media_type:
 *                 type: string
 *                 example: "string"
 *
 *     AdCta:
 *       type: object
 *       description: Call-To-Action configuration. The `type` field is enum-based — backend handles rendering dynamically.
 *       properties:
 *         type:
 *           type: string
 *           enum: [view_site, contact_info, install_app, book_now, learn_more, call_now]
 *           default: view_site
 *           example: view_site
 *         url:
 *           type: string
 *           description: Destination URL for the CTA button
 *           example: "https://mystore.com/sale"
 *         deep_link:
 *           type: string
 *           description: Deep link for in-app navigation (mobile apps)
 *           example: "myapp://product/123"
 *         phone_number:
 *           type: string
 *           description: Phone number (used when type is call_now or contact_info)
 *           example: "+919876543210"
 *         email:
 *           type: string
 *           description: Contact email address
 *           example: "support@mystore.com"
 *         whatsapp_number:
 *           type: string
 *           description: WhatsApp number (with country code, no +)
 *           example: "919876543210"
 *
 *     AdBudget:
 *       type: object
 *       description: Extended budget and scheduling configuration
 *       properties:
 *         daily_budget_coins:
 *           type: number
 *           description: Max coins to spend per day (0 = no daily limit)
 *           example: 500
 *         start_date:
 *           type: string
 *           format: date-time
 *           description: When the ad should start running
 *           example: "2025-06-01T00:00:00Z"
 *         end_date:
 *           type: string
 *           format: date-time
 *           description: When the ad should stop running
 *           example: "2025-06-30T23:59:59Z"
 *         auto_stop_on_budget_exhausted:
 *           type: boolean
 *           description: Reserved for future use — auto-pause ad when total budget is exhausted
 *           default: false
 *
 *     AdTargeting:
 *       type: object
 *       description: Audience targeting configuration
 *       properties:
 *         countries:
 *           type: array
 *           items: { type: string }
 *           description: ISO country codes or country names
 *           example: ["IN", "US"]
 *         states:
 *           type: array
 *           items: { type: string }
 *           example: ["Maharashtra", "Karnataka"]
 *         cities:
 *           type: array
 *           items: { type: string }
 *           example: ["Mumbai", "Bangalore"]
 *         age_min:
 *           type: integer
 *           minimum: 13
 *           default: 13
 *           example: 18
 *         age_max:
 *           type: integer
 *           maximum: 100
 *           default: 65
 *           example: 40
 *         gender:
 *           type: string
 *           enum: [all, male, female, other]
 *           default: all
 *           example: all
 *         interests:
 *           type: array
 *           items: { type: string }
 *           description: Interest/category tags for audience matching
 *           example: ["fashion", "lifestyle", "beauty"]
 *         device_types:
 *           type: array
 *           items:
 *             type: string
 *             enum: [mobile, ios, android, desktop]
 *           default: [mobile, desktop]
 *           example: ["mobile"]
 *
 *     AdTracking:
 *       type: object
 *       description: UTM parameters and conversion tracking
 *       properties:
 *         utm_source:
 *           type: string
 *           example: "myapp"
 *         utm_medium:
 *           type: string
 *           example: "paid_ad"
 *         utm_campaign:
 *           type: string
 *           example: "summer_sale_2025"
 *         utm_term:
 *           type: string
 *           example: "fashion"
 *         utm_content:
 *           type: string
 *           example: "banner_v1"
 *         conversion_pixel_id:
 *           type: string
 *           description: Third-party conversion tracking pixel or SDK ID
 *           example: "px_abc123"
 *
 *     AdEngagementControls:
 *       type: object
 *       description: Control what interactions users can perform on this ad
 *       properties:
 *         hide_likes_count:
 *           type: boolean
 *           default: false
 *           description: Hide the likes count from viewers
 *         disable_comments:
 *           type: boolean
 *           default: false
 *           description: Disable comments on this ad
 *         disable_share:
 *           type: boolean
 *           default: false
 *           description: Disable the share button
 *         disable_save:
 *           type: boolean
 *           default: false
 *           description: Disable the save/bookmark button
 *         disable_report:
 *           type: boolean
 *           default: false
 *           description: Disable the report option
 *         moderation_enabled:
 *           type: boolean
 *           default: false
 *           description: Enable moderation mode (hold comments for review)
 *
 *     AdAbVariant:
 *       type: object
 *       description: A single A/B test creative variant
 *       properties:
 *         variant_id: { type: string, example: "variant_a" }
 *         ad_title: { type: string, example: "Summer Sale — Variant A" }
 *         ad_description: { type: string, example: "Up to 50% off" }
 *         media_fileName: { type: string, example: "variant_a_banner.jpg" }
 *
 *     AdAbTesting:
 *       type: object
 *       description: A/B testing configuration for multiple creatives
 *       properties:
 *         enabled:
 *           type: boolean
 *           default: false
 *         variants:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/AdAbVariant'
 *
 *     AdTimeSlot:
 *       type: object
 *       description: A delivery time window for a specific day of week
 *       properties:
 *         day_of_week:
 *           type: string
 *           enum: [monday, tuesday, wednesday, thursday, friday, saturday, sunday]
 *           example: monday
 *         start_time:
 *           type: string
 *           description: 24-hour HH:MM format
 *           example: "09:00"
 *         end_time:
 *           type: string
 *           description: 24-hour HH:MM format
 *           example: "18:00"
 *
 *     AdScheduling:
 *       type: object
 *       description: Ad delivery scheduling — restrict when the ad is shown
 *       properties:
 *         delivery_time_slots:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/AdTimeSlot'
 *
 *     AdCompliance:
 *       type: object
 *       description: Policy agreement and review status
 *       properties:
 *         policy_agreed:
 *           type: boolean
 *           description: Vendor confirms agreement to ad content policy
 *           example: true
 *         approval_status:
 *           type: string
 *           enum: [pending, approved, rejected]
 *           description: Set by admin — read-only for vendors
 *           example: pending
 *
 *     AdTaggedUser:
 *       type: object
 *       properties:
 *         user_id: { type: string }
 *         username: { type: string }
 *         position_x: { type: number }
 *         position_y: { type: number }
 *
 *     AdGalleryItem:
 *       type: object
 *       properties:
 *         link:
 *           type: string
 *           example: "https://example.com/gallery1.jpg"
 *         filename:
 *           type: string
 *           description: Name of the file (e.g. "gallery1.jpg"). Also accepted as "filname" in some requests.
 *           example: "gallery1.jpg"
 *         filname:
 *           type: string
 *           description: Alias for filename.
 *           example: "gallery1.jpg"
 *
 *     # ── Stats schemas (unchanged) ─────────────────────────────────────────
 *     AdStatUser:
 *       type: object
 *       properties:
 *         _id: { type: string, example: "664f1a2b3c4d5e6f7a8b9c0d" }
 *         username: { type: string, example: "john_doe" }
 *         full_name: { type: string, example: "John Doe" }
 *         avatar_url: { type: string }
 *         gender: { type: string }
 *         age: { type: integer }
 *         location: { type: string }
 *
 *     AdGenderBucket:
 *       type: object
 *       properties:
 *         count: { type: integer }
 *         users:
 *           type: array
 *           items: { $ref: '#/components/schemas/AdStatUser' }
 *
 *     AdLikesByGender:
 *       type: object
 *       properties:
 *         male: { $ref: '#/components/schemas/AdGenderBucket' }
 *         female: { $ref: '#/components/schemas/AdGenderBucket' }
 *         other: { $ref: '#/components/schemas/AdGenderBucket' }
 *         unknown: { $ref: '#/components/schemas/AdGenderBucket' }
 *
 *     AdAgeDemographics:
 *       type: object
 *       properties:
 *         "Child (0–12 years)": { type: integer }
 *         "Teen (13–19 years)": { type: integer }
 *         "Adult (20–39 years)": { type: integer }
 *         "Middle Age (40–59 years)": { type: integer }
 *         "Senior (60+ years)": { type: integer }
 *         Unknown: { type: integer }
 *
 *     AdDislikeGenderCount:
 *       type: object
 *       properties:
 *         count: { type: integer }
 *
 *     AdDislikesByGender:
 *       type: object
 *       properties:
 *         male: { $ref: '#/components/schemas/AdDislikeGenderCount' }
 *         female: { $ref: '#/components/schemas/AdDislikeGenderCount' }
 *         other: { $ref: '#/components/schemas/AdDislikeGenderCount' }
 *         unknown: { $ref: '#/components/schemas/AdDislikeGenderCount' }
 *         users:
 *           type: array
 *           items: { $ref: '#/components/schemas/AdStatUser' }
 *
 *     AdViewByLocation:
 *       type: object
 *       properties:
 *         location: { type: string }
 *         views: { type: integer }
 *         unique_viewers: { type: integer }
 *         completed_views: { type: integer }
 *         rewarded_views: { type: integer }
 *         total_coins_rewarded: { type: number }
 *
 *     AdStatsResponse:
 *       type: object
 *       properties:
 *         ad_id: { type: string }
 *         caption: { type: string }
 *         category: { type: string }
 *         status:
 *           type: string
 *           enum: [pending, active, paused, rejected]
 *         content_type:
 *           type: string
 *           enum: [post, reel]
 *         created_at: { type: string, format: date-time }
 *         likes:
 *           type: object
 *           properties:
 *             total: { type: integer }
 *             by_gender: { $ref: '#/components/schemas/AdLikesByGender' }
 *             by_age: { $ref: '#/components/schemas/AdAgeDemographics' }
 *             user_ids:
 *               type: array
 *               items: { type: string }
 *         dislikes:
 *           type: object
 *           properties:
 *             total: { type: integer }
 *             by_gender: { $ref: '#/components/schemas/AdDislikesByGender' }
 *             by_age: { $ref: '#/components/schemas/AdAgeDemographics' }
 *             user_ids:
 *               type: array
 *               items: { type: string }
 *         views:
 *           type: object
 *           properties:
 *             total: { type: integer }
 *             unique: { type: integer }
 *             completed: { type: integer }
 *             by_location:
 *               type: array
 *               items: { $ref: '#/components/schemas/AdViewByLocation' }
 *             by_age: { $ref: '#/components/schemas/AdAgeDemographics' }
 */

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/ads/categories:
 *   get:
 *     summary: Get all ad categories
 *     tags: [Ads]
 *     responses:
 *       200:
 *         description: List of ad categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.get('/categories', getAdCategories);

/**
 * @swagger
 * /api/ads/categories:
 *   post:
 *     summary: Add a new ad category
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Category added successfully
 *       400:
 *         description: Invalid input or category exists
 */
router.post('/categories', auth, addAdCategory);

/**
 * @swagger
 * /api/ads/feed:
 *   get:
 *     summary: Get active ads feed for user
 *     description: |
 *       Returns paginated ads as `{ page, limit, data }`.
 *       Ads from private accounts are excluded unless the viewer follows that account.
 *       Each ad item may include:
 *       - `is_author_followed_by_me` (boolean)
 *       - `can_view_by_me` (boolean)
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 30
 *         description: "Max requests allowed per window for rate limiting (e.g. 30 = max 30 requests per minute)"
 *     responses:
 *       200:
 *         description: List of active ads with user status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       429:
 *         description: Too many requests — rate limit exceeded
 *         content:
 *           application/json:
 *             example:
 *               message: "Too many requests, please slow down."
 *               limit: 30
 *               retry_after_ms: 45000
 */
const { dynamicRateLimit } = require('../middleware/rateLimit');
const adsFeedRateLimit = dynamicRateLimit({
  keyPrefix:    'ads:feed',
  envMaxKey:    'ADS_FEED_RATE_LIMIT_MAX',
  envWindowKey: 'ADS_FEED_RATE_LIMIT_WINDOW_MS',
  defaultMax:    60,
  defaultWindow: 60 * 1000,
});
router.get('/feed', auth, adsFeedRateLimit, getAdsFeed);

/**
 * @swagger
 * /api/ads/user/{userId}:
 *   get:
 *     summary: Get all ads for a specific vendor with comments
 *     tags: [Ads]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *     responses:
 *       200:
 *         description: List of ads with comments
 */
router.get('/user/:userId', getUserAdsWithComments);

/**
 * @swagger
 * /api/ads:
 *   get:
 *     summary: List all ads (Admin only)
 *     tags: [Ads, Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of ads (no pagination)
 */
router.get('/', auth, requireAdmin, listAds);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ads — Create Ad
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/ads:
 *   post:
 *     summary: Create a new ad (Vendor only, currently not implemented)
 *     description: |
 *       Creates a new ad and atomically deducts `total_budget_coins` from the vendor's wallet.
 *
 *       **Media is required.** All other fields are optional and can also be updated later
 *       via `PATCH /api/ads/{id}/metadata` (except `media`).
 *
 *       **CTA** is enum-based — use the `cta.type` field to control what button the user sees.
 *       The backend renders the correct action dynamically.
 *
 *       **Status flow:** `draft → pending → active → paused`. Submit with `status: "draft"` to
 *       save without going to admin review, or omit `status` (defaults to `"pending"`).
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - media
 *               - category
 *               - total_budget_coins
 *             properties:
 *
 *               # ── Core content ──────────────────────────────────────────
 *               ad_title:
 *                 type: string
 *                 description: Primary headline of the ad
 *                 example: "Summer Sale — Up to 50% Off!"
 *               ad_description:
 *                 type: string
 *                 description: Detailed ad description shown below the title
 *                 example: "Shop our biggest sale of the year on all fashion items."
 *               caption:
 *                 type: string
 *                 description: Short caption (legacy field, kept for backward compat)
 *                 example: "Don't miss out!"
 *               location:
 *                 type: string
 *                 example: "Mumbai, India"
 *               ad_type:
 *                 type: string
 *                 enum: [promote, general]
 *                 required: true
 *                 description: |
 *                   Type of the advertisement.
 *                   - `promote`: Paid promotion. Requires `total_budget_coins` and `budget` details.
 *                   - `general`: Regular free or low-cost advertisement.
 *                 example: promote
 *               content_type:
 *                 type: string
 *                 enum: [post, reel]
 *                 default: reel
 *                 example: reel
 *               status:
 *                 type: string
 *                 enum: [draft, pending]
 *                 default: pending
 *                 description: |
 *                   Use `draft` to save without submitting for review.
 *                   Any other value (or omit) will set status to `pending`.
 *                 example: pending
 *
 *               # ── Media (required) ──────────────────────────────────────
 *               media:
 *                 type: array
 *                 description: "Required. At least one media item. Media CANNOT be changed after creation."
 *                 minItems: 1
 *                 items:
 *                   $ref: '#/components/schemas/AdMedia'
 *
 *               # ── CTA ───────────────────────────────────────────────────
 *               cta:
 *                 $ref: '#/components/schemas/AdCta'
 *
 *               # ── Budget ────────────────────────────────────────────────
 *               total_budget_coins:
 *                 type: number
 *                 description: Total ad budget in coins. Deducted from vendor wallet at creation.
 *                 example: 5000
 *               budget:
 *                 $ref: '#/components/schemas/AdBudget'
 *
 *               # ── Targeting ─────────────────────────────────────────────
 *               targeting:
 *                 $ref: '#/components/schemas/AdTargeting'
 *               target_language:
 *                 type: array
 *                 items: { type: string }
 *                 description: Legacy flat language targeting (kept for backward compat)
 *                 example: ["en", "hi"]
 *               target_location:
 *                 type: array
 *                 items: { type: string }
 *                 description: Legacy flat location targeting
 *                 example: ["Mumbai", "Delhi"]
 *               target_preferences:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["fashion", "deals"]
 *
 *               # ── Categorization ────────────────────────────────────────
 *               category:
 *                 type: string
 *                 description: "Required. Must match a value from GET /api/ads/categories"
 *                 example: "Fashion"
 *               sub_category:
 *                 type: string
 *                 description: Optional sub-category for hierarchical classification
 *                 example: "Women's Clothing"
 *               tags:
 *                 type: array
 *                 items: { type: string }
 *                 description: Ad targeting tags (different from hashtags)
 *                 example: ["summer", "sale", "discount"]
 *               keywords:
 *                 type: array
 *                 items: { type: string }
 *                 description: Keywords for search optimization
 *                 example: ["summer sale", "fashion discount", "50% off"]
 *               hashtags:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["#summersale", "#fashion"]
 *               gallery:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/AdGalleryItem'
 *                 description: Array of gallery objects with link and filename. Can also be sent as a JSON string in multipart/form-data.
 *               galleryFiles:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Optional. Upload multiple image files to be added to the gallery. Links will be auto-generated.
 *
 *               # ── Tagged users ──────────────────────────────────────────
 *               tagged_users:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/AdTaggedUser'
 *
 *               # ── Engagement controls ───────────────────────────────────
 *               engagement_controls:
 *                 $ref: '#/components/schemas/AdEngagementControls'
 *
 *               # ── Tracking ──────────────────────────────────────────────
 *               tracking:
 *                 $ref: '#/components/schemas/AdTracking'
 *
 *               # ── Compliance ────────────────────────────────────────────
 *               compliance:
 *                 type: object
 *                 description: Only `policy_agreed` is accepted here. `approval_status` is set by admin.
 *                 properties:
 *                   policy_agreed:
 *                     type: boolean
 *                     description: Vendor must agree to ad content policy before submitting
 *                     example: true
 *
 *               # ── Smart enhancements ────────────────────────────────────
 *               ab_testing:
 *                 $ref: '#/components/schemas/AdAbTesting'
 *               scheduling:
 *                 $ref: '#/components/schemas/AdScheduling'
 *
 *           example:
 *             ad_title: "Summer Sale — Up to 50% Off!"
 *             ad_description: "Shop our biggest sale of the year on all fashion items."
 *             caption: "Don't miss out!"
 *             location: "Mumbai, India"
 *             ad_type: promote
 *             content_type: advertise
 *             status: pending
 *             total_budget_coins: 5000
 *             budget:
 *               daily_budget_coins: 500
 *               start_date: "2025-06-01T00:00:00Z"
 *               end_date: "2025-06-30T23:59:59Z"
 *               auto_stop_on_budget_exhausted: false
 *             targeting:
 *               countries: ["IN"]
 *               states: ["Maharashtra", "Karnataka"]
 *               cities: ["Mumbai", "Bangalore"]
 *               age_min: 18
 *               age_max: 40
 *               gender: all
 *               interests: ["fashion", "lifestyle"]
 *               device_types: ["mobile"]
 *             category: "Fashion"
 *             sub_category: "Women's Clothing"
 *             tags: ["summer", "sale"]
 *             keywords: ["summer sale", "fashion 50% off"]
 *             hashtags: ["#summersale", "#fashion"]
 *             gallery:
 *               - link: "https://example.com/gallery1.jpg"
 *                 filename: "gallery1.jpg"
 *             engagement_controls:
 *               hide_likes_count: false
 *               disable_comments: false
 *               disable_share: false
 *               disable_save: false
 *               disable_report: false
 *               moderation_enabled: false
 *             tracking:
 *               utm_source: myapp
 *               utm_medium: paid_ad
 *               utm_campaign: summer_sale_2025
 *             compliance:
 *               policy_agreed: true
 *             ab_testing:
 *               enabled: false
 *               variants: []
 *             scheduling:
 *               delivery_time_slots:
 *                 - day_of_week: monday
 *                   start_time: "09:00"
 *                   end_time: "21:00"
 *     responses:
 *       401:
 *         description: Unauthorized
 *       501:
 *         description: Not implemented
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Not implemented
 *       500:
 *         description: Server error
 */
router.post('/', auth, upload.array('galleryFiles', 10), createAd);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ads/search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/ads/search:
 *   get:
 *     summary: Search ads by category, hashtag, keyword, username, ad_title, or description
 *     description: |
 *       Unified search endpoint. Supports the following intent prefixes in `q`:
 *       - `#fashion` — searches hashtags
 *       - `@username` — searches by poster username
 *       - `summer sale` — searches caption, ad_title, ad_description, hashtags, tags, keywords, location
 *
 *       If `q` exactly matches a category name, it filters by that category.
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: "Keyword, #hashtag, or @username to search"
 *         example: "summer sale"
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Exact category name (case-insensitive chip filter)
 *         example: "Fashion"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, active, paused, rejected]
 *         description: "Status filter — admin only (non-admins always see active only)"
 *       - in: query
 *         name: content_type
 *         schema:
 *           type: string
 *           enum: [post, reel]
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [latest, popular, top]
 *           default: latest
 *         description: "latest = newest first, popular = most viewed, top = most liked"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *     responses:
 *       200:
 *         description: Paginated search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: integer, example: 42 }
 *                 page: { type: integer, example: 1 }
 *                 limit: { type: integer, example: 20 }
 *                 totalPages: { type: integer, example: 3 }
 *                 ads:
 *                   type: array
 *                   items: { type: object }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/search', auth, searchAds);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ads/:id/stats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/ads/{id}/stats:
 *   get:
 *     summary: Get engagement stats for an ad
 *     description: |
 *       Returns a full breakdown of engagement for a single ad including:
 *       - **Likes** — total count, list of user IDs, gender breakdown with profiles
 *       - **Dislikes** — explicit dislike array from Ad model, gender breakdown with profiles
 *       - **Views** — total, unique, completed, broken down by viewer location with coins rewarded per location
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "664f1a2b3c4d5e6f7a8b9c0a"
 *     responses:
 *       200:
 *         description: Ad engagement statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdStatsResponse'
 *       400:
 *         description: Invalid ad ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Ad not found
 *       500:
 *         description: Server error
 */
router.get('/:id/stats', auth, getAdStats);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ads/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/ads/{id}:
 *   get:
 *     summary: Get ad by ID
 *     description: Requires follow access when the ad owner account is private.
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ad details
 *       404:
 *         description: Ad not found
 *       403:
 *         description: This account is private. Follow to view ads.
 */
router.get('/:id', auth, getAdById);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/ads/:id/metadata — Update Ad (everything except media)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/ads/{id}/metadata:
 *   patch:
 *     summary: Update ad metadata (everything except media)
 *     description: |
 *       Update any ad field **except** the `media` array (media is immutable after creation).
 *
 *       All fields are optional — only send what you want to change.
 *
 *       **Status transitions allowed by vendor:**
 *       - `draft → pending` (submit for admin review)
 *       - `active → paused`
 *       - `paused → active`
 *
 *       **Note:** `compliance.approval_status` is read-only for vendors — it is managed by admin via `PATCH /api/admin/ads/{id}`.
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the ad
 *         example: "664f1a2b3c4d5e6f7a8b9c0a"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: "All fields optional. Send only what needs to change. Media cannot be updated."
 *             properties:
 *
 *               # ── Core content ──────────────────────────────────────────
 *               ad_title:
 *                 type: string
 *                 example: "Updated Summer Sale Title"
 *               ad_description:
 *                 type: string
 *                 example: "Updated description text"
 *               caption:
 *                 type: string
 *                 example: "New caption"
 *               location:
 *                 type: string
 *                 example: "Delhi, India"
 *               ad_type:
 *                 type: string
 *                 enum: [banner, video, carousel, sponsored_post]
 *               content_type:
 *                 type: string
 *                 enum: [post, reel]
 *               status:
 *                 type: string
 *                 enum: [draft, pending, active, paused]
 *                 description: |
 *                   Vendor-allowed transitions only:
 *                   `draft → pending`, `active → paused`, `paused → active`
 *
 *               # ── CTA ───────────────────────────────────────────────────
 *               cta:
 *                 $ref: '#/components/schemas/AdCta'
 *
 *               # ── Budget ────────────────────────────────────────────────
 *               total_budget_coins:
 *                 type: number
 *                 description: Update total budget (does NOT trigger wallet deduction again)
 *                 example: 8000
 *               budget:
 *                 $ref: '#/components/schemas/AdBudget'
 *
 *               # ── Targeting ─────────────────────────────────────────────
 *               targeting:
 *                 $ref: '#/components/schemas/AdTargeting'
 *               target_language:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["en", "hi"]
 *               target_location:
 *                 type: array
 *                 items: { type: string }
 *               target_states:
 *                 type: array
 *                 items: { type: string }
 *               target_preferences:
 *                 type: array
 *                 items: { type: string }
 *
 *               # ── Categorization ────────────────────────────────────────
 *               category:
 *                 type: string
 *                 description: "Must match a value from GET /api/ads/categories"
 *                 example: "Electronics"
 *               sub_category:
 *                 type: string
 *                 example: "Smartphones"
 *               tags:
 *                 type: array
 *                 items: { type: string }
 *               keywords:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["iphone", "android deals"]
 *               hashtags:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["#tech", "#smartphones"]
 *
 *               # ── Tagged users ──────────────────────────────────────────
 *               tagged_users:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/AdTaggedUser'
 *
 *               # ── Engagement controls ───────────────────────────────────
 *               engagement_controls:
 *                 $ref: '#/components/schemas/AdEngagementControls'
 *
 *               # ── Tracking ──────────────────────────────────────────────
 *               tracking:
 *                 $ref: '#/components/schemas/AdTracking'
 *
 *               # ── Compliance ────────────────────────────────────────────
 *               compliance:
 *                 type: object
 *                 description: Only `policy_agreed` is updatable by vendor. `approval_status` is admin-only.
 *                 properties:
 *                   policy_agreed:
 *                     type: boolean
 *                     example: true
 *
 *               # ── Smart enhancements ────────────────────────────────────
 *               ab_testing:
 *                 $ref: '#/components/schemas/AdAbTesting'
 *               scheduling:
 *                 $ref: '#/components/schemas/AdScheduling'
 *
 *           example:
 *             ad_title: "Revised Sale Title"
 *             ad_description: "Now with even bigger discounts!"
 *             cta:
 *               type: book_now
 *               url: "https://mystore.com/book"
 *               whatsapp_number: "919876543210"
 *             budget:
 *               daily_budget_coins: 700
 *               end_date: "2025-07-31T23:59:59Z"
 *             targeting:
 *               age_min: 21
 *               age_max: 45
 *               gender: female
 *               cities: ["Mumbai", "Pune"]
 *               device_types: ["ios", "android"]
 *             sub_category: "Ethnic Wear"
 *             keywords: ["ethnic fashion", "festive sale"]
 *             engagement_controls:
 *               disable_comments: true
 *               moderation_enabled: true
 *             tracking:
 *               utm_campaign: "revised_summer_sale"
 *             scheduling:
 *               delivery_time_slots:
 *                 - day_of_week: saturday
 *                   start_time: "10:00"
 *                   end_time: "22:00"
 *                 - day_of_week: sunday
 *                   start_time: "10:00"
 *                   end_time: "22:00"
 *             compliance:
 *               policy_agreed: true
 *             status: pending
 *     responses:
 *       200:
 *         description: Ad updated successfully — returns the full updated ad document
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Updated Ad document
 *       400:
 *         description: Invalid status transition or bad input
 *         content:
 *           application/json:
 *             example:
 *               message: "Invalid vendor status transition from active to pending"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to update this ad
 *       404:
 *         description: Ad not found
 *       500:
 *         description: Server error
 */
router.patch('/:id/metadata', auth, updateAdMetadata);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/ads/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/ads/{id}:
 *   delete:
 *     summary: Delete an ad (Vendor only, soft delete)
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ad deleted successfully
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Ad not found
 */
router.delete('/:id', auth, deleteAd);

// ─────────────────────────────────────────────────────────────────────────────
// Interaction routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/ads/{id}/view:
 *   post:
 *     summary: Record an ad view (counts view and applies reward if eligible)
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: View recorded (and reward applied if eligible)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 view_count: { type: integer }
 *                 rewarded: { type: boolean }
 *                 reward: { type: number }
 */
router.post('/:id/view', auth, recordAdView);

/**
 * @swagger
 * /api/ads/{id}/click:
 *   post:
 *     summary: Record an ad CTA or product-link click
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Click recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 click:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     ad_id: { type: string }
 *                     user_id: { type: string }
 *                     vendor_id: { type: string }
 *                     is_unique: { type: boolean }
 *                     is_invalid: { type: boolean }
 *                     coins_spent: { type: number }
 *                     country: { type: string }
 *                     language: { type: string }
 *                     gender: { type: string }
 *                     created_at: { type: string, format: date-time }
 *       400:
 *         description: Invalid ad ID
 *       404:
 *         description: Ad not found
 *       500:
 *         description: Server error
 */
router.post('/:id/click', auth, recordClick);

/**
 * @swagger
 * /api/ads/{id}/like:
 *   post:
 *     summary: Like an ad (credits user wallet and spends ad budget)
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Like applied successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 likes_count: { type: number }
 *                 is_liked: { type: boolean }
 *                 coins_earned:
 *                   type: number
 *                   description: Coins credited to user wallet (0 if liking own ad)
 *       400:
 *         description: Invalid ad ID or ad budget exhausted
 *       404:
 *         description: Ad not found
 *       409:
 *         description: Already liked
 *       429:
 *         description: Too many requests
 */
router.post(
  '/:id/like',
  auth,
  rateLimit({ windowMs: 60000, max: 20, keyGenerator: (req) => `${req.userId}:${req.params.id}:like` }),
  likeAd
);

/**
 * @swagger
 * /api/ads/{id}/dislike:
 *   post:
 *     summary: Reverse a previous like (deducts 10 coins from user and refunds ad budget)
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Like reversed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 likes_count: { type: number }
 *                 is_disliked: { type: boolean }
 *                 coins_deducted: { type: number }
 *       400:
 *         description: Not previously liked or insufficient wallet balance
 *       404:
 *         description: Ad not found
 *       429:
 *         description: Too many requests
 */
router.post(
  '/:id/dislike',
  auth,
  rateLimit({ windowMs: 60000, max: 20, keyGenerator: (req) => `${req.userId}:${req.params.id}:dislike` }),
  dislikeAd
);

/**
 * @swagger
 * /api/ads/{id}/save:
 *   post:
 *     summary: Save an ad (user earns 10 coins, deducted from ad creator wallet)
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ad saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 saved: { type: boolean }
 *                 saved_count: { type: integer }
 *                 coins_earned: { type: number }
 *       409:
 *         description: Already saved
 */
router.post('/:id/save', auth, saveAd);

/**
 * @swagger
 * /api/ads/{id}/unsave:
 *   post:
 *     summary: Unsave an ad
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ad unsaved
 *       400:
 *         description: Not saved yet
 */
router.post('/:id/unsave', auth, unsaveAd);

// ─────────────────────────────────────────────────────────────────────────────
// Comment routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/ads/{id}/comments:
 *   post:
 *     summary: Add a comment to an ad
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text: { type: string }
 *               parent_id:
 *                 type: string
 *                 description: Optional ID of the parent comment (for replies)
 *     responses:
 *       201:
 *         description: Comment added
 */
router.post('/:id/comments', auth, addAdComment);

/**
 * @swagger
 * /api/ads/{id}/comments:
 *   get:
 *     summary: Get comments for an ad
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of comments
 */
router.get('/:id/comments', auth, getAdComments);

/**
 * @swagger
 * /api/ads/comments/{commentId}/replies:
 *   get:
 *     summary: Get replies for an ad comment
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of replies
 */
router.get('/comments/:commentId/replies', auth, getAdCommentReplies);

/**
 * @swagger
 * /api/ads/comments/{commentId}:
 *   delete:
 *     summary: Delete a comment
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Comment deleted
 */
router.delete('/comments/:commentId', auth, deleteAdComment);

/**
 * @swagger
 * /api/ads/comments/{id}/like:
 *   post:
 *     summary: Like or unlike a comment
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Like toggled
 */
router.post('/comments/:id/like', auth, likeAdComment);

/**
 * @swagger
 * /api/ads/comments/{id}/dislike:
 *   post:
 *     summary: Dislike or undislike a comment
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dislike toggled
 */
router.post('/comments/:id/dislike', auth, dislikeAdComment);

module.exports = router;
