const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const { addView, completeView } = require('../controllers/view.controller');

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

module.exports = router;
