const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const verifyToken = require('../middleware/auth');
const {
  createThread,
  getFeedThreads,
  getUserThreads,
  getThreadReplies,
  getThreadById,
  likeThread,
  unlikeThread,
  repostThread,
  deleteThread,
  searchThreads,
  getTrendingThreads,
  uploadThreadImage,
} = require('../controllers/thread.controller');
const {
  addThreadComment,
  getThreadComments,
  getThreadCommentReplies,
  likeThreadComment,
  unlikeThreadComment,
  deleteThreadComment,
} = require('../controllers/threadComment.controller');

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const threadImageUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExts = /jpeg|jpg|png|gif|webp/;
    const extname = allowedExts.test(path.extname(file.originalname).toLowerCase());
    const mimetype = !!file.mimetype && file.mimetype.startsWith('image/');

    if (extname && mimetype) {
      return cb(null, true);
    }

    return cb(new Error('Only JPEG, JPG, PNG, GIF and WEBP images are supported for threads'));
  },
});

/**
 * @swagger
 * tags:
 *   name: Threads
 *   description: Threads-style posting, replies, likes, reposts and discovery
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ThreadAuthor:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         username:
 *           type: string
 *         full_name:
 *           type: string
 *         avatar_url:
 *           type: string
 *         name:
 *           type: string
 *         profilePicture:
 *           type: string
 *         isVerified:
 *           type: boolean
 *     ThreadMedia:
 *       type: object
 *       properties:
 *         url:
 *           type: string
 *         type:
 *           type: string
 *           enum: [image]
 *     Thread:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         author:
 *           $ref: '#/components/schemas/ThreadAuthor'
 *         content:
 *           type: string
 *         media:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ThreadMedia'
 *         parentThread:
 *           type: string
 *           nullable: true
 *         rootThread:
 *           type: string
 *           nullable: true
 *         repostOf:
 *           oneOf:
 *             - type: string
 *             - $ref: '#/components/schemas/Thread'
 *           nullable: true
 *         quoteContent:
 *           type: string
 *         likesCount:
 *           type: integer
 *         repliesCount:
 *           type: integer
 *         commentsCount:
 *           type: integer
 *         repostsCount:
 *           type: integer
 *         quotesCount:
 *           type: integer
 *         viewsCount:
 *           type: integer
 *         isDeleted:
 *           type: boolean
 *         audience:
 *           type: string
 *           enum: [everyone, followers]
 *         isLiked:
 *           type: boolean
 *         isReposted:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateThreadRequest:
 *       type: object
 *       properties:
 *         content:
 *           type: string
 *           maxLength: 500
 *         media:
 *           type: array
 *           maxItems: 10
 *           items:
 *             $ref: '#/components/schemas/ThreadMedia'
 *         parentThreadId:
 *           type: string
 *         repostOfId:
 *           type: string
 *         quoteContent:
 *           type: string
 *           maxLength: 500
 *         audience:
 *           type: string
 *           enum: [everyone, followers]
 *       example:
 *         content: "Launching our new thread feature today."
 *         media:
 *           - url: "https://example.com/image.jpg"
 *             type: "image"
 *         audience: "everyone"
 *     RepostThreadRequest:
 *       type: object
 *       required:
 *         - threadId
 *       properties:
 *         threadId:
 *           type: string
 *         quoteContent:
 *           type: string
 *           maxLength: 500
 *         content:
 *           type: string
 *           maxLength: 500
 *         media:
 *           type: array
 *           maxItems: 10
 *           items:
 *             $ref: '#/components/schemas/ThreadMedia'
 *         audience:
 *           type: string
 *           enum: [everyone, followers]
 *     ThreadFeedResponse:
 *       type: object
 *       properties:
 *         threads:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Thread'
 *         nextCursor:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         hasMore:
 *           type: boolean
 *     ThreadComment:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         comment_id:
 *           type: string
 *         thread_id:
 *           type: string
 *         parent_id:
 *           type: string
 *           nullable: true
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             username:
 *               type: string
 *             avatar_url:
 *               type: string
 *         text:
 *           type: string
 *         likes_count:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/threads/upload:
 *   post:
 *     summary: Upload a thread image
 *     description: Threads support image uploads only for now.
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Thread image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fileName:
 *                   type: string
 *                 fileUrl:
 *                   type: string
 *                 media:
 *                   $ref: '#/components/schemas/ThreadMedia'
 *       400:
 *         description: Missing file or unsupported format
 */
router.post('/upload', verifyToken, threadImageUpload.single('file'), uploadThreadImage);

/**
 * @swagger
 * /api/threads:
 *   post:
 *     summary: Create a thread, reply, repost or quote repost
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateThreadRequest'
 *     responses:
 *       201:
 *         description: Thread created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Thread'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Parent or original thread not found
 */
router.post('/', verifyToken, createThread);

/**
 * @swagger
 * /api/threads/feed:
 *   get:
 *     summary: Get public root threads for the feed
 *     tags: [Threads]
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
 *         name: cursor
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Primary pagination cursor based on createdAt
 *     responses:
 *       200:
 *         description: Feed threads
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ThreadFeedResponse'
 */
router.get('/feed', verifyToken, getFeedThreads);

/**
 * @swagger
 * /api/threads/trending:
 *   get:
 *     summary: Get trending threads from the last 48 hours
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trending threads
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 threads:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Thread'
 */
router.get('/trending', verifyToken, getTrendingThreads);

/**
 * @swagger
 * /api/threads/search:
 *   get:
 *     summary: Search public threads by content
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Matching threads
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ThreadFeedResponse'
 *       400:
 *         description: Missing search query or invalid cursor
 */
router.get('/search', verifyToken, searchThreads);

/**
 * @swagger
 * /api/threads/user/{userId}:
 *   get:
 *     summary: Get a user's root threads and reposts
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: User threads and reposts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 threads:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Thread'
 *                 nextCursor:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 hasMore:
 *                   type: boolean
 */
router.get('/user/:userId', verifyToken, getUserThreads);

/**
 * @swagger
 * /api/threads/repost:
 *   post:
 *     summary: Toggle repost or create a quote repost
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RepostThreadRequest'
 *     responses:
 *       200:
 *         description: Repost toggled
 *       201:
 *         description: Quote repost created
 *       404:
 *         description: Thread not found
 */
router.post('/repost', verifyToken, repostThread);

/**
 * @swagger
 * /api/threads/{threadId}/comments:
 *   post:
 *     summary: Add a comment to a thread
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: threadId
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
 *                 description: Optional parent comment id for a reply
 *     responses:
 *       201:
 *         description: Thread comment created successfully
 *   get:
 *     summary: Get comments for a thread
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of thread comments
 */
router.post('/:threadId/comments', verifyToken, addThreadComment);
router.get('/:threadId/comments', verifyToken, getThreadComments);

/**
 * @swagger
 * /api/threads/comments/{commentId}/like:
 *   post:
 *     summary: Like a thread comment
 *     tags: [Threads]
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
 *         description: Thread comment liked successfully
 */
router.post('/comments/:commentId/like', verifyToken, likeThreadComment);

/**
 * @swagger
 * /api/threads/comments/{commentId}/unlike:
 *   post:
 *     summary: Unlike a thread comment
 *     tags: [Threads]
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
 *         description: Thread comment unliked successfully
 */
router.post('/comments/:commentId/unlike', verifyToken, unlikeThreadComment);

/**
 * @swagger
 * /api/threads/comments/{commentId}/replies:
 *   get:
 *     summary: Get replies for a thread comment
 *     tags: [Threads]
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
 *         description: List of thread comment replies
 */
router.get('/comments/:commentId/replies', verifyToken, getThreadCommentReplies);

/**
 * @swagger
 * /api/threads/comments/{commentId}:
 *   delete:
 *     summary: Delete a thread comment
 *     tags: [Threads]
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
 *         description: Thread comment deleted successfully
 */
router.delete('/comments/:commentId', verifyToken, deleteThreadComment);

/**
 * @swagger
 * /api/threads/{threadId}/replies:
 *   get:
 *     summary: Get direct replies for a thread
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Direct replies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 replies:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Thread'
 */
router.get('/:threadId/replies', verifyToken, getThreadReplies);

/**
 * @swagger
 * /api/threads/{threadId}/like:
 *   post:
 *     summary: Toggle like for a thread
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Like toggled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 liked:
 *                   type: boolean
 *                 likesCount:
 *                   type: integer
 */
router.post('/:threadId/like', verifyToken, likeThread);

/**
 * @swagger
 * /api/threads/{threadId}/unlike:
 *   post:
 *     summary: Unlike a thread
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thread unliked successfully
 */
router.post('/:threadId/unlike', verifyToken, unlikeThread);

/**
 * @swagger
 * /api/threads/{threadId}:
 *   get:
 *     summary: Get a single thread by ID
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thread details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Thread'
 *       404:
 *         description: Thread not found
 */
router.get('/:threadId', verifyToken, getThreadById);

/**
 * @swagger
 * /api/threads/{threadId}:
 *   delete:
 *     summary: Soft delete a thread
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thread deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.delete('/:threadId', verifyToken, deleteThread);

module.exports = router;
