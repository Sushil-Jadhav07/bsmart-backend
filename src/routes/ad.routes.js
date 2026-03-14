const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const rateLimit = require('../middleware/rateLimit');
const {
  createAd,
  listAds,
  getAdsFeed,
  getUserAdsWithComments,
  getAdById,
  getAdCategories,
  addAdCategory,
  recordAdView,
  likeAd,
  dislikeAd,
  saveAd,
  unsaveAd,
  deleteAd,
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
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *     responses:
 *       200:
 *         description: List of active ads with user status
 */
router.get('/feed', auth, getAdsFeed);

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

/**
 * @swagger
 * /api/ads:
 *   post:
 *     summary: Create a new ad (Vendor only)
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
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [ads]
 *               caption:
 *                 type: string
 *               location:
 *                 type: string
 *               media:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - fileName
 *                   properties:
 *                     fileName:
 *                       type: string
 *                     media_type:
 *                       type: string
 *                       enum: [image, video]
 *                     video_meta:
 *                       type: object
 *                       properties:
 *                         original_length_seconds:
 *                           type: number
 *                         selected_start:
 *                           type: number
 *                         selected_end:
 *                           type: number
 *                         final_duration:
 *                           type: number
 *                         thumbnail_time:
 *                           type: number
 *                     image_editing:
 *                       type: object
 *                       properties:
 *                         filter:
 *                           type: object
 *                           properties:
 *                             name:
 *                               type: string
 *                             css:
 *                               type: string
 *                         adjustments:
 *                           type: object
 *                           properties:
 *                             brightness:
 *                               type: number
 *                             contrast:
 *                               type: number
 *                             saturation:
 *                               type: number
 *                             temperature:
 *                               type: number
 *                             fade:
 *                               type: number
 *                             vignette:
 *                               type: number
 *                     crop_settings:
 *                       type: object
 *                       properties:
 *                         mode:
 *                           type: string
 *                           enum: [original, "1:1", "4:5", "16:9", "9:16"]
 *                         aspect_ratio:
 *                           type: string
 *                         zoom:
 *                           type: number
 *                         x:
 *                           type: number
 *                         y:
 *                           type: number
 *                     timing_window:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: number
 *                         end:
 *                           type: number
 *                     thumbnails:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           fileName:
 *                             type: string
 *                           media_type:
 *                             type: string
 *               hashtags:
 *                 type: array
 *                 items:
 *                   type: string
 *               tagged_users:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     position_x:
 *                       type: number
 *                     position_y:
 *                       type: number
 *               engagement_controls:
 *                 type: object
 *                 properties:
 *                   hide_likes_count:
 *                     type: boolean
 *                   disable_comments:
 *                     type: boolean
 *               content_type:
 *                 type: string
 *                 enum: [post, reel]
 *               category:
 *                 type: string
 *                 description: Must match a value from GET /api/ads/categories
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Ad targeting tags, different from hashtags
 *               target_language:
 *                 type: array
 *                 items:
 *                   type: string
 *               target_location:
 *                 type: array
 *                 items:
 *                   type: string
 *               total_budget_coins:
 *                 type: number
 *                 description: Total ad budget. This amount is deducted from vendor wallet atomically at ad creation and recorded as a transaction.
 *     responses:
 *       201:
 *         description: Ad created successfully
 */
router.post('/', auth, createAd);

/**
 * @swagger
 * /api/ads/search:
 *   get:
 *     summary: Search ads by category, hashtag, user_id, caption, keyword
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: "Keyword to search in caption, hashtags, tags, location"
 *         example: "summer sale"
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Exact category name (case-insensitive)
 *         example: "Fashion"
 *       - in: query
 *         name: hashtag
 *         schema:
 *           type: string
 *         description: Single hashtag to search (with or without #)
 *         example: "sale"
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the vendor/user who created the ad
 *         example: "664f1a2b3c4d5e6f7a8b9c0d"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, active, paused, rejected]
 *         description: "Ad status filter - admin only (non-admins always see active only)"
 *       - in: query
 *         name: content_type
 *         schema:
 *           type: string
 *           enum: [post, reel]
 *         description: Filter by content type
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *         description: Results per page (max 50)
 *     responses:
 *       200:
 *         description: Search results with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 42
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 20
 *                 totalPages:
 *                   type: integer
 *                   example: 3
 *                 ads:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Invalid user_id format
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/search', auth, searchAds);


/**
 * @swagger
 * components:
 *   schemas:
 *     AdStatUser:
 *       type: object
 *       description: Basic user profile returned inside ad stats
 *       properties:
 *         _id:
 *           type: string
 *           example: "664f1a2b3c4d5e6f7a8b9c0d"
 *         username:
 *           type: string
 *           example: "john_doe"
 *         full_name:
 *           type: string
 *           example: "John Doe"
 *         avatar_url:
 *           type: string
 *           example: "http://localhost:5000/uploads/avatar.jpg"
 *         gender:
 *           type: string
 *           example: "male"
 *         location:
 *           type: string
 *           example: "Mumbai, India"
 *
 *     AdGenderBucket:
 *       type: object
 *       description: Count and user list for one gender (used in likes)
 *       properties:
 *         count:
 *           type: integer
 *           example: 5
 *         users:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/AdStatUser'
 *
 *     AdLikesByGender:
 *       type: object
 *       properties:
 *         male:
 *           $ref: '#/components/schemas/AdGenderBucket'
 *         female:
 *           $ref: '#/components/schemas/AdGenderBucket'
 *         other:
 *           $ref: '#/components/schemas/AdGenderBucket'
 *         unknown:
 *           $ref: '#/components/schemas/AdGenderBucket'
 *
 *     AdDislikeGenderCount:
 *       type: object
 *       properties:
 *         count:
 *           type: integer
 *           example: 3
 *
 *     AdDislikesByGender:
 *       type: object
 *       properties:
 *         male:
 *           $ref: '#/components/schemas/AdDislikeGenderCount'
 *         female:
 *           $ref: '#/components/schemas/AdDislikeGenderCount'
 *         other:
 *           $ref: '#/components/schemas/AdDislikeGenderCount'
 *         unknown:
 *           $ref: '#/components/schemas/AdDislikeGenderCount'
 *         users:
 *           type: array
 *           description: Full list of users who explicitly disliked this ad
 *           items:
 *             $ref: '#/components/schemas/AdStatUser'
 *
 *     AdRecentComment:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664f1a2b3c4d5e6f7a8b9c11"
 *         text:
 *           type: string
 *           example: "Great ad!"
 *         user:
 *           type: object
 *           properties:
 *             username:
 *               type: string
 *               example: "jane_doe"
 *             avatar_url:
 *               type: string
 *               example: "http://localhost:5000/uploads/jane.jpg"
 *         likes_count:
 *           type: integer
 *           example: 2
 *         dislikes_count:
 *           type: integer
 *           example: 0
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *     AdViewByLocation:
 *       type: object
 *       properties:
 *         location:
 *           type: string
 *           example: "Mumbai, India"
 *         views:
 *           type: integer
 *           example: 180
 *         unique_viewers:
 *           type: integer
 *           example: 120
 *         completed_views:
 *           type: integer
 *           example: 90
 *         rewarded_views:
 *           type: integer
 *           description: Views that triggered a coin reward to the viewer
 *           example: 70
 *         total_coins_rewarded:
 *           type: number
 *           description: Total coins paid out to viewers from this location
 *           example: 700
 *
 *     AdCoinAction:
 *       type: object
 *       properties:
 *         count:
 *           type: integer
 *           description: Number of times this action occurred
 *           example: 12
 *         total_coins:
 *           type: number
 *           description: Net coins exchanged for this action (negative = deducted from vendor)
 *           example: -120
 *
 *     AdBudget:
 *       type: object
 *       properties:
 *         total:
 *           type: number
 *           description: Initial budget allocated at ad creation
 *           example: 5000
 *         spent:
 *           type: number
 *           description: Coins spent so far
 *           example: 1200
 *         remaining:
 *           type: number
 *           example: 3800
 *         spent_percentage:
 *           type: number
 *           example: 24.0
 *
 *     AdStatsResponse:
 *       type: object
 *       properties:
 *         ad_id:
 *           type: string
 *           example: "664f1a2b3c4d5e6f7a8b9c0a"
 *         caption:
 *           type: string
 *           example: "Summer Sale — up to 50% off!"
 *         category:
 *           type: string
 *           example: "Fashion"
 *         status:
 *           type: string
 *           enum: [pending, active, paused, rejected]
 *           example: "active"
 *         content_type:
 *           type: string
 *           enum: [post, reel]
 *           example: "reel"
 *         created_at:
 *           type: string
 *           format: date-time
 *         likes:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               example: 38
 *             by_gender:
 *               $ref: '#/components/schemas/AdLikesByGender'
 *             user_ids:
 *               type: array
 *               items:
 *                 type: string
 *               example: ["664f1a2b3c4d5e6f7a8b9c01", "664f1a2b3c4d5e6f7a8b9c02"]
 *         dislikes:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               example: 5
 *             by_gender:
 *               $ref: '#/components/schemas/AdDislikesByGender'
 *             user_ids:
 *               type: array
 *               items:
 *                 type: string
 *         comments:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               example: 25
 *             top_level:
 *               type: integer
 *               example: 18
 *             replies:
 *               type: integer
 *               example: 7
 *             recent:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AdRecentComment'
 *         views:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               example: 500
 *             unique:
 *               type: integer
 *               example: 340
 *             completed:
 *               type: integer
 *               example: 210
 *             by_location:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AdViewByLocation'
 *         saves:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               example: 42
 *         budget:
 *           $ref: '#/components/schemas/AdBudget'
 *         coins:
 *           type: object
 *           properties:
 *             by_action:
 *               type: object
 *               description: Keyed by event_type (like, dislike, undo-like, undo-dislike)
 *               additionalProperties:
 *                 $ref: '#/components/schemas/AdCoinAction'
 *               example:
 *                 like: { count: 38, total_coins: -380 }
 *                 dislike: { count: 5, total_coins: 50 }
 *                 undo-like: { count: 2, total_coins: 20 }
 */

/**
 * @swagger
 * /api/ads/{id}/stats:
 *   get:
 *     summary: Get engagement stats for an ad
 *     description: |
 *       Returns a full breakdown of engagement for a single ad including:
 *       - **Likes** — total count, list of user IDs, gender breakdown with profiles
 *       - **Dislikes** — explicit dislike array from Ad model, gender breakdown with profiles
 *       - **Comments** — total, top-level vs replies, 5 most recent
 *       - **Views** — total, unique, completed, broken down by viewer location with coins rewarded per location
 *       - **Saves** — total number of users who saved this ad
 *       - **Budget** — total allocated / spent / remaining / percentage
 *       - **Coins by action** — breakdown of coins exchanged per event type (like, dislike, undo-like, undo-dislike)
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
 *     responses:
 *       200:
 *         description: Ad engagement statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdStatsResponse'
 *             example:
 *               ad_id: "664f1a2b3c4d5e6f7a8b9c0a"
 *               caption: "Summer Sale — up to 50% off!"
 *               category: "Fashion"
 *               status: "active"
 *               content_type: "reel"
 *               created_at: "2025-05-20T08:00:00.000Z"
 *               likes:
 *                 total: 38
 *                 by_gender:
 *                   male:
 *                     count: 20
 *                     users:
 *                       - _id: "664f1a2b3c4d5e6f7a8b9c01"
 *                         username: "rahul_m"
 *                         gender: "male"
 *                         location: "Delhi, India"
 *                   female:
 *                     count: 15
 *                     users:
 *                       - _id: "664f1a2b3c4d5e6f7a8b9c02"
 *                         username: "priya_s"
 *                         gender: "female"
 *                         location: "Mumbai, India"
 *                   other:
 *                     count: 1
 *                     users: []
 *                   unknown:
 *                     count: 2
 *                     users: []
 *                 user_ids: ["664f1a2b3c4d5e6f7a8b9c01", "664f1a2b3c4d5e6f7a8b9c02"]
 *               dislikes:
 *                 total: 5
 *                 by_gender:
 *                   male: { count: 3 }
 *                   female: { count: 2 }
 *                   other: { count: 0 }
 *                   unknown: { count: 0 }
 *                 users:
 *                   - _id: "664f1a2b3c4d5e6f7a8b9c03"
 *                     username: "viewer_99"
 *                     gender: "male"
 *                     location: "Pune, India"
 *                 user_ids: ["664f1a2b3c4d5e6f7a8b9c03"]
 *               comments:
 *                 total: 25
 *                 top_level: 18
 *                 replies: 7
 *                 recent:
 *                   - _id: "664f1a2b3c4d5e6f7a8b9c11"
 *                     text: "Love this product!"
 *                     user:
 *                       username: "jane_doe"
 *                       avatar_url: "http://localhost:5000/uploads/jane.jpg"
 *                     likes_count: 3
 *                     dislikes_count: 0
 *                     createdAt: "2025-06-01T10:30:00.000Z"
 *               views:
 *                 total: 500
 *                 unique: 340
 *                 completed: 210
 *                 by_location:
 *                   - location: "Mumbai, India"
 *                     views: 180
 *                     unique_viewers: 120
 *                     completed_views: 90
 *                     rewarded_views: 70
 *                     total_coins_rewarded: 700
 *                   - location: "Delhi, India"
 *                     views: 120
 *                     unique_viewers: 80
 *                     completed_views: 55
 *                     rewarded_views: 40
 *                     total_coins_rewarded: 400
 *                   - location: "Unknown"
 *                     views: 200
 *                     unique_viewers: 140
 *                     completed_views: 65
 *                     rewarded_views: 50
 *                     total_coins_rewarded: 500
 *               saves:
 *                 total: 42
 *               budget:
 *                 total: 5000
 *                 spent: 1200
 *                 remaining: 3800
 *                 spent_percentage: 24.0
 *               coins:
 *                 by_action:
 *                   like: { count: 38, total_coins: -380 }
 *                   dislike: { count: 5, total_coins: 50 }
 *                   undo-like: { count: 2, total_coins: 20 }
 *       400:
 *         description: Invalid ad ID format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invalid ad ID"
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Token is not valid"
 *       404:
 *         description: Ad not found or has been deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Ad not found"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Server error"
 *                 error:
 *                   type: string
 */
router.get('/:id/stats', auth, getAdStats);

/**
 * @swagger
 * /api/ads/{id}:
 *   get:
 *     summary: Get ad by ID
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
 */
router.get('/:id', auth, getAdById);

/**
 * @swagger
 * /api/ads/{id}:
 *   delete:
 *     summary: Delete an ad (Vendor only)
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
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                 description: Optional; if provided must match authenticated user (or admin)
 *     responses:
 *       200:
 *         description: View recorded (and reward applied if eligible)
 */
router.post('/:id/view', auth, recordAdView);

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
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                 description: Optional; if provided must match authenticated user (or admin)
 *     responses:
 *       200:
 *         description: Like applied successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 likes_count:
 *                   type: number
 *                   example: 5
 *                 is_liked:
 *                   type: boolean
 *                   example: true
 *                 coins_earned:
 *                   type: number
 *                   description: Coins credited to user wallet (0 if liking own ad)
 *                   example: 10
 *       400:
 *         description: Invalid ad ID or ad budget exhausted
 *       403:
 *         description: Forbidden
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
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                 description: Optional; if provided must match authenticated user (or admin)
 *     responses:
 *       200:
 *         description: Like reversed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 likes_count:
 *                   type: number
 *                 is_disliked:
 *                   type: boolean
 *                 coins_deducted:
 *                   type: number
 *       400:
 *         description: Invalid ad ID, not previously liked, or insufficient wallet balance
 *       403:
 *         description: Forbidden
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
 *     summary: Save an ad
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
 *         description: Ad saved (user earns 10 coins, deducted from ad creator wallet)
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
 *               text:
 *                 type: string
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