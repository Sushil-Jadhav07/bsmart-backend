const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const { createPost, getFeed, getPost, deletePost } = require('../controllers/post.controller');

/**
 * @swagger
 * components:
 *   schemas:
 *     MediaItem:
 *       type: object
 *       properties:
 *         fileName:
 *           type: string
 *         ratio:
 *           type: number
 *         filter:
 *           type: string
 *         type:
 *           type: string
 *           default: image
 *         fileUrl:
 *           type: string
 *           description: Computed URL for the file (response only)
 *     Post:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         user_id:
 *           type: object
 *           properties:
 *             username:
 *               type: string
 *             full_name:
 *               type: string
 *             avatar_url:
 *               type: string
 *         caption:
 *           type: string
 *         location:
 *           type: string
 *         media:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/MediaItem'
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         likes_count:
 *           type: number
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/posts:
 *   post:
 *     summary: Create a new post
 *     tags: [Posts]
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
 *             properties:
 *               caption:
 *                 type: string
 *               location:
 *                 type: string
 *               media:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/MediaItem'
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               hide_likes_count:
 *                 type: boolean
 *               turn_off_commenting:
 *                 type: boolean
 *               type:
 *                 type: string
 *                 enum: [post, reel, promote, advertise]
 *     responses:
 *       201:
 *         description: Post created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 */
router.post('/', verifyToken, createPost);

/**
 * @swagger
 * /api/posts/feed:
 *   get:
 *     summary: Get posts feed
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of posts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 posts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Post'
 */
router.get('/feed', verifyToken, getFeed);

/**
 * @swagger
 * /api/posts/{id}:
 *   get:
 *     summary: Get a single post by ID
 *     tags: [Posts]
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
 *         description: Post details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 *       404:
 *         description: Post not found
 */
router.get('/:id', verifyToken, getPost);

/**
 * @swagger
 * /api/posts/{id}:
 *   delete:
 *     summary: Delete a post
 *     tags: [Posts]
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
 *         description: Post deleted successfully
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Post not found
 */
router.delete('/:id', verifyToken, deletePost);

module.exports = router;
