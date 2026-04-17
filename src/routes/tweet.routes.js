const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const verifyToken = require('../middleware/auth');
const {
  createTweet,
  getFeedTweets,
  getUserTweets,
  getTweetReplies,
  getTweetById,
  likeTweet,
  unlikeTweet,
  repostTweet,
  deleteTweet,
  searchTweets,
  getTrendingTweets,
  uploadTweetImage,
} = require('../controllers/tweet.controller');
const {
  addTweetComment,
  getTweetComments,
  getTweetCommentReplies,
  likeTweetComment,
  unlikeTweetComment,
  deleteTweetComment,
} = require('../controllers/tweetComment.controller');

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const tweetImageUpload = multer({
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

    return cb(new Error('Only JPEG, JPG, PNG, GIF and WEBP images are supported for tweets'));
  },
});

/**
 * @swagger
 * tags:
 *   name: Tweets
 *   description: Tweets-style posting, replies, likes, reposts and discovery
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     TweetAuthor:
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
 *     TweetMedia:
 *       type: object
 *       properties:
 *         url:
 *           type: string
 *         type:
 *           type: string
 *           enum: [image]
 *     Tweet:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         author:
 *           $ref: '#/components/schemas/TweetAuthor'
 *         content:
 *           type: string
 *         media:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/TweetMedia'
 *         parentTweet:
 *           type: string
 *           nullable: true
 *         rootTweet:
 *           type: string
 *           nullable: true
 *         repostOf:
 *           oneOf:
 *             - type: string
 *             - $ref: '#/components/schemas/Tweet'
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
 *     CreateTweetRequest:
 *       type: object
 *       properties:
 *         content:
 *           type: string
 *           maxLength: 500
 *         media:
 *           type: array
 *           maxItems: 10
 *           items:
 *             $ref: '#/components/schemas/TweetMedia'
 *         parentTweetId:
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
 *         content: "Launching our new tweet feature today."
 *         media:
 *           - url: "https://example.com/image.jpg"
 *             type: "image"
 *         audience: "everyone"
 *     RepostTweetRequest:
 *       type: object
 *       required:
 *         - tweetId
 *       properties:
 *         tweetId:
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
 *             $ref: '#/components/schemas/TweetMedia'
 *         audience:
 *           type: string
 *           enum: [everyone, followers]
 *     TweetFeedResponse:
 *       type: object
 *       properties:
 *         tweets:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Tweet'
 *         nextCursor:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         hasMore:
 *           type: boolean
 *     TweetComment:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         comment_id:
 *           type: string
 *         tweet_id:
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
 * /api/tweets/upload:
 *   post:
 *     summary: Upload a tweet image
 *     description: Tweets support image uploads only for now.
 *     tags: [Tweets]
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
 *         description: Tweet image uploaded successfully
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
 *                   $ref: '#/components/schemas/TweetMedia'
 *       400:
 *         description: Missing file or unsupported format
 */
router.post('/upload', verifyToken, tweetImageUpload.single('file'), uploadTweetImage);

/**
 * @swagger
 * /api/tweets:
 *   post:
 *     summary: Create a tweet, reply, repost or quote repost
 *     tags: [Tweets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTweetRequest'
 *     responses:
 *       201:
 *         description: Tweet created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tweet'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Parent or original tweet not found
 */
router.post('/', verifyToken, createTweet);

/**
 * @swagger
 * /api/tweets/feed:
 *   get:
 *     summary: Get public root tweets for the feed
 *     tags: [Tweets]
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
 *         description: Feed tweets
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TweetFeedResponse'
 */
router.get('/feed', verifyToken, getFeedTweets);

/**
 * @swagger
 * /api/tweets/trending:
 *   get:
 *     summary: Get trending tweets from the last 48 hours
 *     tags: [Tweets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trending tweets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tweets:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Tweet'
 */
router.get('/trending', verifyToken, getTrendingTweets);

/**
 * @swagger
 * /api/tweets/search:
 *   get:
 *     summary: Search public tweets by content
 *     tags: [Tweets]
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
 *         description: Matching tweets
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TweetFeedResponse'
 *       400:
 *         description: Missing search query or invalid cursor
 */
router.get('/search', verifyToken, searchTweets);

/**
 * @swagger
 * /api/tweets/user/{userId}:
 *   get:
 *     summary: Get a user's root tweets and reposts
 *     tags: [Tweets]
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
 *         description: User tweets and reposts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 tweets:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Tweet'
 *                 nextCursor:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 hasMore:
 *                   type: boolean
 */
router.get('/user/:userId', verifyToken, getUserTweets);

/**
 * @swagger
 * /api/tweets/repost:
 *   post:
 *     summary: Toggle repost or create a quote repost
 *     tags: [Tweets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RepostTweetRequest'
 *     responses:
 *       200:
 *         description: Repost toggled
 *       201:
 *         description: Quote repost created
 *       404:
 *         description: Tweet not found
 */
router.post('/repost', verifyToken, repostTweet);

/**
 * @swagger
 * /api/tweets/{tweetId}/comments:
 *   post:
 *     summary: Add a comment to a tweet
 *     tags: [Tweets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tweetId
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
 *         description: Tweet comment created successfully
 *   get:
 *     summary: Get comments for a tweet
 *     tags: [Tweets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tweetId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of tweet comments
 */
router.post('/:tweetId/comments', verifyToken, addTweetComment);
router.get('/:tweetId/comments', verifyToken, getTweetComments);

/**
 * @swagger
 * /api/tweets/comments/{commentId}/like:
 *   post:
 *     summary: Like a tweet comment
 *     tags: [Tweets]
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
 *         description: Tweet comment liked successfully
 */
router.post('/comments/:commentId/like', verifyToken, likeTweetComment);

/**
 * @swagger
 * /api/tweets/comments/{commentId}/unlike:
 *   post:
 *     summary: Unlike a tweet comment
 *     tags: [Tweets]
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
 *         description: Tweet comment unliked successfully
 */
router.post('/comments/:commentId/unlike', verifyToken, unlikeTweetComment);

/**
 * @swagger
 * /api/tweets/comments/{commentId}/replies:
 *   get:
 *     summary: Get replies for a tweet comment
 *     tags: [Tweets]
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
 *         description: List of tweet comment replies
 */
router.get('/comments/:commentId/replies', verifyToken, getTweetCommentReplies);

/**
 * @swagger
 * /api/tweets/comments/{commentId}:
 *   delete:
 *     summary: Delete a tweet comment
 *     tags: [Tweets]
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
 *         description: Tweet comment deleted successfully
 */
router.delete('/comments/:commentId', verifyToken, deleteTweetComment);

/**
 * @swagger
 * /api/tweets/{tweetId}/replies:
 *   get:
 *     summary: Get direct replies for a tweet
 *     tags: [Tweets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tweetId
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
 *                     $ref: '#/components/schemas/Tweet'
 */
router.get('/:tweetId/replies', verifyToken, getTweetReplies);

/**
 * @swagger
 * /api/tweets/{tweetId}/like:
 *   post:
 *     summary: Toggle like for a tweet
 *     tags: [Tweets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tweetId
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
router.post('/:tweetId/like', verifyToken, likeTweet);

/**
 * @swagger
 * /api/tweets/{tweetId}/unlike:
 *   post:
 *     summary: Unlike a tweet
 *     tags: [Tweets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tweetId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tweet unliked successfully
 */
router.post('/:tweetId/unlike', verifyToken, unlikeTweet);

/**
 * @swagger
 * /api/tweets/{tweetId}:
 *   get:
 *     summary: Get a single tweet by ID
 *     tags: [Tweets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tweetId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tweet details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tweet'
 *       404:
 *         description: Tweet not found
 */
router.get('/:tweetId', verifyToken, getTweetById);

/**
 * @swagger
 * /api/tweets/{tweetId}:
 *   delete:
 *     summary: Soft delete a tweet
 *     tags: [Tweets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tweetId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tweet deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.delete('/:tweetId', verifyToken, deleteTweet);

module.exports = router;

