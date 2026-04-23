const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const { dynamicRateLimit } = require('../middleware/rateLimit');
const { createPost, getFeed, getPost, deletePost, createReel, listReels, getReelById, updatePostMetadata, updateReelMetadata } = require('../controllers/post.controller');
const { likePost, unlikePost, getPostLikes } = require('../controllers/like.controller');
const { savePost, unsavePost, listMySavedPosts } = require('../controllers/saved.controller');
const { getPostStats } = require('../controllers/poststats.controller');

// ─── Feed rate limiters (dynamic — values set via query params) ─────────────
// Pass `limit` in the request query to control the rate limit.
// Falls back to env vars (FEED_RATE_LIMIT_MAX / FEED_RATE_LIMIT_WINDOW_MS)
// or defaults (60 req / 60 000 ms) if not supplied.
const feedRateLimit = dynamicRateLimit({
  keyPrefix:    'feed',
  envMaxKey:    'FEED_RATE_LIMIT_MAX',
  envWindowKey: 'FEED_RATE_LIMIT_WINDOW_MS',
  defaultMax:    60,
  defaultWindow: 60 * 1000,
});

const reelsRateLimit = dynamicRateLimit({
  keyPrefix:    'reels',
  envMaxKey:    'REELS_RATE_LIMIT_MAX',
  envWindowKey: 'REELS_RATE_LIMIT_WINDOW_MS',
  defaultMax:    60,
  defaultWindow: 60 * 1000,
});

/**
 * @swagger
 * tags:
 *   name: Reels
 *   description: Reel management and viewing
 */

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
 *         videoLength:
 *           type: number
 *           description: Original video length in milliseconds
 *         finalLength:
 *           type: number
 *           description: Final video length after trim in milliseconds
 *         finallength:
 *           type: number
 *           description: Alias for finalLength (accepted in requests)
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
 *             aspect_ratio:
 *               type: string
 *             zoom:
 *               type: number
 *               default: 1
 *             x:
 *               type: number
 *               default: 0
 *             y:
 *               type: number
 *               default: 0
 *         timing:
 *           type: object
 *           properties:
 *             start:
 *               type: number
 *             end:
 *               type: number
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
 *         thumbnail:
 *           type: object
 *           properties:
 *             fileName:
 *               type: string
 *             type:
 *               type: string
 *               enum: [image]
 *               default: image
 *             fileUrl:
 *               type: string
 *               description: Computed URL for the thumbnail (response only)
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
 *     PostMediaItem:
 *       type: object
 *       properties:
 *         fileName:
 *           type: string
 *         type:
 *           type: string
 *           enum: [image]
 *           default: image
 *         fileUrl:
 *           type: string
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
 *             brightness: { type: number }
 *             contrast: { type: number }
 *             saturation: { type: number }
 *             temperature: { type: number }
 *             fade: { type: number }
 *             vignette: { type: number }
 *     ReelMediaItem:
 *       type: object
 *       properties:
 *         fileName:
 *           type: string
 *         type:
 *           type: string
 *           enum: [video]
 *           default: video
 *         videoLength: { type: number }
 *         totalLenght: { type: number }
 *         thumbail-time: { type: number }
 *         finalLength-start: { type: number }
 *         finallength-end: { type: number }
 *         finalLength: { type: number }
 *         finallength: { type: number }
 *         fileUrl: { type: string }
 *         crop:
 *           type: object
 *           properties:
 *             mode:
 *               type: string
 *               enum: ["original", "1:1", "4:5", "16:9"]
 *               default: "original"
 *             aspect_ratio:
 *               type: string
 *             zoom:
 *               type: number
 *               default: 1
 *             x:
 *               type: number
 *               default: 0
 *             y:
 *               type: number
 *               default: 0
 *         timing:
 *           type: object
 *           properties:
 *             start:
 *               type: number
 *             end:
 *               type: number
 *         thumbnail:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               fileName: { type: string }
 *               type: { type: string, enum: [image], default: image }
 *               fileUrl: { type: string }
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
 *                   $ref: '#/components/schemas/PostMediaItem'
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
 *     description: |
 *       Returns a mixed feed of posts/tweets (and ad inserts), paginated as `{ page, limit, data }`.
 *       Content from private accounts is excluded unless the viewer follows that account.
 *       Each post/ad item may include:
 *       - `is_author_followed_by_me` (boolean)
 *       - `can_view_by_me` (boolean)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 30
 *         description: "Max requests allowed per window for rate limiting (e.g. 30 = max 30 requests per minute)"
 *     responses:
 *       200:
 *         description: Paginated feed payload
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
 *                     $ref: '#/components/schemas/Post'
 *       429:
 *         description: Too many requests — rate limit exceeded
 *         content:
 *           application/json:
 *             example:
 *               message: "Too many requests, please slow down."
 *               limit: 30
 *               retry_after_ms: 45000
 */
router.get('/feed', verifyToken, feedRateLimit, getFeed);

/**
 * @swagger
 * /api/posts/reels:
 *   post:
 *     summary: Create a new reel
 *     tags: [Reels]
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
 *                   $ref: '#/components/schemas/ReelMediaItem'
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               people_tags:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     user_id: { type: string }
 *                     username: { type: string }
 *                     x: { type: number }
 *                     y: { type: number }
 *               hide_likes_count:
 *                 type: boolean
 *               turn_off_commenting:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Reel created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 */
router.post('/reels', verifyToken, createReel);

/**
 * @swagger
 * /api/posts/reels:
 *   get:
 *     summary: List all reels
 *     description: |
 *       Returns paginated reels as `{ page, limit, data }`.
 *       Reels from private accounts are excluded unless the viewer follows the author.
 *     tags: [Reels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 30
 *         description: "Max requests allowed per window for rate limiting (e.g. 30 = max 30 requests per minute)"
 *     responses:
 *       200:
 *         description: Paginated reels payload
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
 *                     $ref: '#/components/schemas/Post'
 *       429:
 *         description: Too many requests — rate limit exceeded
 *         content:
 *           application/json:
 *             example:
 *               message: "Too many requests, please slow down."
 *               limit: 30
 *               retry_after_ms: 45000
 */
router.get('/reels', verifyToken, reelsRateLimit, listReels);

/**
 * @swagger
 * /api/posts/reels/{id}:
 *   get:
 *     summary: Get a reel by ID
 *     description: Requires follow access when the reel author account is private.
 *     tags: [Reels]
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
 *         description: Reel details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 *       404:
 *         description: Reel not found
 *       403:
 *         description: This account is private. Follow to view reels.
 */
router.get('/reels/:id', verifyToken, getReelById);

/**
 * @swagger
 * /api/posts/{id}:
 *   get:
 *     summary: Get a single post by ID
 *     description: Requires follow access when the post author account is private.
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
 *       403:
 *         description: This account is private. Follow to view posts.
 *       404:
 *         description: Post not found
 */
router.get('/saved', verifyToken, listMySavedPosts);

router.get('/:id/stats', verifyToken, getPostStats);

/**
 * @swagger
 * /api/posts/{id}/metadata:
 *   patch:
 *     summary: Update post caption, location, tags and advanced settings
 *     tags: [Posts]
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
 *             properties:
 *               caption:
 *                 type: string
 *               location:
 *                 type: string
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
 *     responses:
 *       200:
 *         description: Post updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Post not found
 */
router.patch('/:id/metadata', verifyToken, updatePostMetadata);

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
 * /api/posts/reels/{id}/metadata:
 *   patch:
 *     summary: Update reel caption, location, tags and advanced settings
 *     tags: [Reels]
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
 *             properties:
 *               caption:
 *                 type: string
 *               location:
 *                 type: string
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
 *     responses:
 *       200:
 *         description: Reel updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Reel not found
 */
router.patch('/reels/:id/metadata', verifyToken, updateReelMetadata);

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
