const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const { createPost, getFeed, getPost, deletePost, createReel, listReels, getReelById } = require('../controllers/post.controller');
const { likePost, unlikePost, getPostLikes } = require('../controllers/like.controller');
const { savePost, unsavePost, listMySavedPosts } = require('../controllers/saved.controller');
const { getPostStats } = require('../controllers/poststats.controller');

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
 *     tags: [Reels]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of reels
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Post'
 */
router.get('/reels', verifyToken, listReels);

/**
 * @swagger
 * /api/posts/reels/{id}:
 *   get:
 *     summary: Get a reel by ID
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
 */
router.get('/reels/:id', verifyToken, getReelById);

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

/**
 * @swagger
 * components:
 *   schemas:
 *     StatUser:
 *       type: object
 *       description: Basic user profile returned inside stats
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
 *         age:
 *           type: integer
 *           example: 25
 *         location:
 *           type: string
 *           example: "Mumbai, India"
 *
 *     GenderBucket:
 *       type: object
 *       description: Count and user list for a specific gender
 *       properties:
 *         count:
 *           type: integer
 *           example: 5
 *         users:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/StatUser'
 *
 *     LikesByGender:
 *       type: object
 *       properties:
 *         male:
 *           $ref: '#/components/schemas/GenderBucket'
 *         female:
 *           $ref: '#/components/schemas/GenderBucket'
 *         other:
 *           $ref: '#/components/schemas/GenderBucket'
 *         unknown:
 *           $ref: '#/components/schemas/GenderBucket'
 *
 *     PostAgeDemographics:
 *       type: object
 *       properties:
 *         "Child (0–12 years)":
 *           type: integer
 *           description: "0–12 years"
 *           example: 0
 *         "Teen (13–19 years)":
 *           type: integer
 *           description: "13–19 years"
 *           example: 5
 *         "Adult (20–39 years)":
 *           type: integer
 *           description: "20–39 years"
 *           example: 20
 *         "Middle Age (40–59 years)":
 *           type: integer
 *           description: "40–59 years"
 *           example: 10
 *         "Senior (60+ years)":
 *           type: integer
 *           description: "60+ years"
 *           example: 1
 *         Unknown:
 *           type: integer
 *           description: "Age not provided"
 *           example: 2
 *
 *     DislikeGenderCount:
 *       type: object
 *       description: Gender count (no user list) for dislikes
 *       properties:
 *         count:
 *           type: integer
 *           example: 3
 *
 *     DislikesByGender:
 *       type: object
 *       properties:
 *         male:
 *           $ref: '#/components/schemas/DislikeGenderCount'
 *         female:
 *           $ref: '#/components/schemas/DislikeGenderCount'
 *         other:
 *           $ref: '#/components/schemas/DislikeGenderCount'
 *         unknown:
 *           $ref: '#/components/schemas/DislikeGenderCount'
 *         users:
 *           type: array
 *           description: Full list of users who viewed but never liked
 *           items:
 *             $ref: '#/components/schemas/StatUser'
 *
 *     RecentComment:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664f1a2b3c4d5e6f7a8b9c11"
 *         text:
 *           type: string
 *           example: "Great post!"
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
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2025-06-01T10:30:00.000Z"
 *
 *     ViewByLocation:
 *       type: object
 *       properties:
 *         location:
 *           type: string
 *           example: "Mumbai, India"
 *         views:
 *           type: integer
 *           description: Total view count from this location
 *           example: 120
 *         unique_viewers:
 *           type: integer
 *           description: Number of distinct users who viewed from this location
 *           example: 90
 *         completed_views:
 *           type: integer
 *           description: Views that were completed (watched fully)
 *           example: 60
 *
 *     PostStatsResponse:
 *       type: object
 *       properties:
 *         post_id:
 *           type: string
 *           example: "664f1a2b3c4d5e6f7a8b9c0a"
 *         caption:
 *           type: string
 *           example: "Sunset vibes 🌅"
 *         type:
 *           type: string
 *           enum: [post, reel, promote, advertise]
 *           example: "post"
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-05-20T08:00:00.000Z"
 *         likes:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               description: Total number of likes
 *               example: 38
 *             by_gender:
 *               $ref: '#/components/schemas/LikesByGender'
 *             by_age:
 *               $ref: '#/components/schemas/PostAgeDemographics'
 *             user_ids:
 *               type: array
 *               description: Raw ObjectId array of all users who liked this post
 *               items:
 *                 type: string
 *               example: ["664f1a2b3c4d5e6f7a8b9c01", "664f1a2b3c4d5e6f7a8b9c02"]
 *         dislikes:
 *           type: object
 *           description: Users who viewed the post but never liked it
 *           properties:
 *             total:
 *               type: integer
 *               example: 12
 *             by_gender:
 *               $ref: '#/components/schemas/DislikesByGender'
 *             by_age:
 *               $ref: '#/components/schemas/PostAgeDemographics'
 *         comments:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               description: Total comments including replies
 *               example: 25
 *             top_level:
 *               type: integer
 *               description: Root-level comments only (no parent)
 *               example: 18
 *             replies:
 *               type: integer
 *               description: Threaded reply comments
 *               example: 7
 *             recent:
 *               type: array
 *               description: Latest 5 top-level comments
 *               items:
 *                 $ref: '#/components/schemas/RecentComment'
 *         views:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               description: Cumulative view count (re-views included)
 *               example: 500
 *             unique:
 *               type: integer
 *               description: Distinct users who viewed
 *               example: 340
 *             completed:
 *               type: integer
 *               description: Views where the user watched the full reel
 *               example: 210
 *             by_location:
 *               type: array
 *               description: View breakdown sorted by most views, grouped by viewer's location
 *               items:
 *                 $ref: '#/components/schemas/ViewByLocation'
 *             by_age:
 *               $ref: '#/components/schemas/PostAgeDemographics'
 */

/**
 * @swagger
 * /api/posts/{id}/stats:
 *   get:
 *     summary: Get engagement stats for a post
 *     description: |
 *       Returns a full breakdown of engagement for a single post including:
 *       - **Likes** — total count, list of user IDs who liked, and gender breakdown (male / female / other / unknown) with user profiles
 *       - **Dislikes** — users who viewed the post but never liked it, with gender breakdown
 *       - **Comments** — total, top-level vs replies, and the 5 most recent comments
 *       - **Views** — total, unique, completed, and a breakdown by viewer location (sorted by most views)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the post
 *         example: "664f1a2b3c4d5e6f7a8b9c0a"
 *     responses:
 *       200:
 *         description: Post engagement statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PostStatsResponse'
 *             example:
 *               post_id: "664f1a2b3c4d5e6f7a8b9c0a"
 *               caption: "Sunset vibes 🌅"
 *               type: "reel"
 *               created_at: "2025-05-20T08:00:00.000Z"
 *               likes:
 *                 total: 38
 *                 by_gender:
 *                   male:
 *                     count: 20
 *                     users:
 *                       - _id: "664f1a2b3c4d5e6f7a8b9c01"
 *                         username: "rahul_m"
 *                         full_name: "Rahul Mehta"
 *                         gender: "male"
 *                         age: 25
 *                         location: "Delhi, India"
 *                   female:
 *                     count: 15
 *                     users:
 *                       - _id: "664f1a2b3c4d5e6f7a8b9c02"
 *                         username: "priya_s"
 *                         full_name: "Priya Sharma"
 *                         gender: "female"
 *                         age: 28
 *                         location: "Mumbai, India"
 *                   other:
 *                     count: 1
 *                     users: []
 *                   unknown:
 *                     count: 2
 *                     users: []
 *                 by_age:
 *                   "Child (0–12 years)": 0
 *                   "Teen (13–19 years)": 5
 *                   "Adult (20–39 years)": 20
 *                   "Middle Age (40–59 years)": 10
 *                   "Senior (60+ years)": 1
 *                   Unknown: 2
 *                 user_ids:
 *                   - "664f1a2b3c4d5e6f7a8b9c01"
 *                   - "664f1a2b3c4d5e6f7a8b9c02"
 *               dislikes:
 *                 total: 12
 *                 by_gender:
 *                   male: { count: 7 }
 *                   female: { count: 4 }
 *                   other: { count: 0 }
 *                   unknown: { count: 1 }
 *                 users:
 *                   - _id: "664f1a2b3c4d5e6f7a8b9c03"
 *                     username: "viewer_99"
 *                     gender: "male"
 *                     location: "Pune, India"
 *               comments:
 *                 total: 25
 *                 top_level: 18
 *                 replies: 7
 *                 recent:
 *                   - _id: "664f1a2b3c4d5e6f7a8b9c11"
 *                     text: "Amazing shot!"
 *                     user:
 *                       username: "jane_doe"
 *                       avatar_url: "http://localhost:5000/uploads/jane.jpg"
 *                     likes_count: 3
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
 *                   - location: "Delhi, India"
 *                     views: 120
 *                     unique_viewers: 80
 *                     completed_views: 55
 *                   - location: "Unknown"
 *                     views: 200
 *                     unique_viewers: 140
 *                     completed_views: 65
 *                 by_age:
 *                   "Child (0–12 years)": 10
 *                   "Teen (13–19 years)": 40
 *                   "Adult (20–39 years)": 250
 *                   "Middle Age (40–59 years)": 150
 *                   "Senior (60+ years)": 30
 *                   Unknown: 20
 *       400:
 *         description: Invalid post ID format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invalid post ID"
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
 *         description: Post not found or has been deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Post not found"
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
router.get('/:id/stats', verifyToken, getPostStats);

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