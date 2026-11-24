const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const { addView, completeView, pingProgress } = require('../controllers/view.controller');

/**
 * @swagger
 * /api/views:
 *   post:
 *     summary: Add a view for a reel
 *     tags: [Views]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - postId
 *             properties:
 *               postId:
 *                 type: string
 *     responses:
 *       200:
 *         description: View recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 views_count:
 *                   type: number
 *                 unique_views_count:
 *                   type: number
 *       400:
 *         description: Invalid postId/type
 *       401:
 *         description: Not authorized
 */
router.post('/', verifyToken, addView);

/**
 * @swagger
 * /api/views/complete:
 *   post:
 *     summary: Complete a view for a reel and reward user
 *     tags: [Views]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - postId
 *             properties:
 *               postId:
 *                 type: string
 *               watchTimeMs:
 *                 type: number
 *     responses:
 *       200:
 *         description: Completion processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 completed:
 *                   type: boolean
 *                 rewarded:
 *                   type: boolean
 *                 walletBalance:
 *                   type: number
 *       400:
 *         description: Invalid postId/type
 *       401:
 *         description: Not authorized
 */
router.post('/complete', verifyToken, completeView);

/**
 * @swagger
 * /api/views/progress:
 *   post:
 *     summary: Report how far through a reel this viewer has watched (for retention curve)
 *     tags: [Views]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [postId, fraction]
 *             properties:
 *               postId: { type: string }
 *               fraction: { type: number, minimum: 0, maximum: 1 }
 *     responses:
 *       200: { description: Progress recorded }
 *       400: { description: Invalid postId/fraction/type }
 *       401: { description: Not authorized }
 */
router.post('/progress', verifyToken, pingProgress);

module.exports = router;
