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
  completeAdView,
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
 *     summary: Record an ad view
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
 *         description: View recorded
 */
router.post('/:id/view', auth, recordAdView);

/**
 * @swagger
 * /api/ads/{id}/complete:
 *   post:
 *     summary: Complete ad view and claim reward
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               watchTimeMs:
 *                 type: number
 *     responses:
 *       200:
 *         description: Ad view completed and reward claimed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Ad completed and rewarded"
 *                 reward:
 *                   type: number
 *                   description: Coins rewarded to member
 *                   example: 10
 *                 member_balance_change:
 *                   type: string
 *                   description: Balance change for member
 *                   example: "+10"
 *                 owner_balance_change:
 *                   type: string
 *                   description: Balance change for ad owner
 *                   example: "-10"
 */
router.post('/:id/complete', auth, completeAdView);

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
