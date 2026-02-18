const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const { createPost, getFeed, getPost, deletePost } = require('../controllers/post.controller');
const { likePost, unlikePost, getPostLikes } = require('../controllers/like.controller');
const { savePost, unsavePost, listMySavedPosts } = require('../controllers/saved.controller');

/**
 * @swagger
 * components:
 *   schemas:
 *     MediaItem:
 *       type: object
 *       properties:
 *         fileName:
 *           type: string
 *         type:
 *           type: string
 *           enum: [image, video]
 *           default: image
 *         fileUrl:
 *           type: string
 *           description: Computed URL for the file (response only)
 *         crop:
 *           type: object
 *           properties:
 *             mode:
 *               type: string
 *               enum: ["original", "1:1", "4:5", "16:9"]
 *               default: "original"
 *             zoom:
 *               type: number
 *               default: 1
 *             x:
 *               type: number
 *               default: 0
 *             y:
 *               type: number
 *               default: 0
 *         filter:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               default: "Original"
 *             css:
 *               type: string
 *               default: ""
 *               example: "contrast(1.1) saturate(1.25)"
 *         adjustments:
 *           type: object
 *           properties:
 *             brightness:
 *               type: number
 *             contrast:
 *               type: number
 *             saturation:
 *               type: number
 *             temperature:
 *               type: number
 *             fade:
 *               type: number
 *             vignette:
 *               type: number
 *     Post:
 *       type: object
 *       properties:
 *         post_id:
 *           type: string
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
 *         people_tags:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               user_id:
 *                 type: string
 *               username:
 *                 type: string
 *               x:
 *                 type: number
 *               y:
 *                 type: number
 *         likes_count:
 *           type: number
 *         is_liked_by_me:
 *           type: boolean
 *         is_saved_by_me:
 *           type: boolean
 *         comments:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               comment_id:
 *                 type: string
 *               _id:
 *                 type: string
 *               text:
 *                 type: string
 *               user:
 *                 type: object
 *                 properties:
 *                   username:
 *                     type: string
 *                   avatar_url:
 *                     type: string
 *               createdAt:
 *                 type: string
 *                 format: date-time
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
 *               people_tags:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     x:
 *                       type: number
 *                     y:
 *                       type: number
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
 *     responses:
 *       200:
 *         description: List of posts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Post'
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
router.get('/saved', verifyToken, listMySavedPosts);

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

/**
 * @swagger
 * /api/posts/{id}/like:
 *   post:
 *     summary: Like a post
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
 *         description: Liked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 likes_count:
 *                   type: number
 *                 liked:
 *                   type: boolean
 *       400:
 *         description: Already liked
 *       404:
 *         description: Post not found
 */
router.post('/:id/like', verifyToken, likePost);

/**
 * @swagger
 * /api/posts/{id}/unlike:
 *   post:
 *     summary: Unlike a post
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
 *         description: Unliked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 likes_count:
 *                   type: number
 *                 liked:
 *                   type: boolean
 *       400:
 *         description: Not liked yet
 *       404:
 *         description: Post not found
 */
router.post('/:id/unlike', verifyToken, unlikePost);

/**
 * @swagger
 * /api/posts/{id}/likes:
 *   get:
 *     summary: Get users who liked a post
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
 *         description: List of users who liked the post
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: number
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       username:
 *                         type: string
 *                       full_name:
 *                         type: string
 *                       avatar_url:
 *                         type: string
 *       404:
 *         description: Post not found
 */
router.get('/:id/likes', verifyToken, getPostLikes);

/**
 * @swagger
 * /api/posts/{id}/save:
 *   post:
 *     summary: Save a post
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
 *         description: Post saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 saved:
 *                   type: boolean
 *                 saved_count:
 *                   type: number
 *       400:
 *         description: Invalid postId
 *       404:
 *         description: Post not found
 *       409:
 *         description: Already saved
 */
router.post('/:id/save', verifyToken, savePost);

/**
 * @swagger
 * /api/posts/{id}/unsave:
 *   post:
 *     summary: Unsave a post
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
 *         description: Post unsaved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 saved:
 *                   type: boolean
 *                 saved_count:
 *                   type: number
 *       400:
 *         description: Invalid postId or Not saved yet
 *       404:
 *         description: Post not found
 */
router.post('/:id/unsave', verifyToken, unsavePost);

/**
 * @swagger
 * /api/posts/saved:
 *   get:
 *     summary: Get current user's saved posts
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All saved posts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 posts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Post'
 */

module.exports = router;
