const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const {
  createAd,
  listAds,
  getAdsFeed,
  getAdById,
  getAdCategories,
  recordAdView,
  completeAdView,
  likeAd
} = require('../controllers/ad.controller');
const {
  addAdComment,
  getAdComments,
  deleteAdComment
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
 * /api/ads:
 *   get:
 *     summary: List all ads (Admin only)
 *     tags: [Ads, Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated list of ads
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
 *               - coins_reward
 *             properties:
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
 *                 type: string
 *               target_location:
 *                 type: string
 *               total_budget_coins:
 *                 type: number
 *               coins_reward:
 *                 type: number
 *                 description: Coins user earns for completing this ad, minimum 1
 *     responses:
 *       201:
 *         description: Ad created successfully
 */
router.post('/', auth, createAd);

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
 *         description: Reward processed
 */
router.post('/:id/complete', auth, completeAdView);

/**
 * @swagger
 * /api/ads/{id}/like:
 *   post:
 *     summary: Like or unlike an ad
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
 *         description: Like status updated
 */
router.post('/:id/like', auth, likeAd);

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

module.exports = router;
