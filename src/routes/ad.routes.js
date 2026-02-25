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
 *               - title
 *               - video_fileName
 *               - video_url
 *               - duration_seconds
 *               - coins_reward
 *               - category
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               video_fileName:
 *                 type: string
 *               video_url:
 *                 type: string
 *               thumbnail_fileName:
 *                 type: string
 *               thumbnail_url:
 *                 type: string
 *               duration_seconds:
 *                 type: number
 *               coins_reward:
 *                 type: number
 *               category:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               target_language:
 *                 type: string
 *               target_location:
 *                 type: string
 *               daily_limit:
 *                 type: number
 *               total_budget_coins:
 *                 type: number
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
