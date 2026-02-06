const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const { addComment, getComments, deleteComment, likeComment, unlikeComment, getReplies } = require('../controllers/comment.controller');

/**
 * @swagger
 * components:
 *   schemas:
 *     Comment:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         post_id:
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
 *           type: number
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/posts/{postId}/comments:
 *   post:
 *     summary: Add a comment to a post
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
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
 *                 example: "This is a reply to your comment"
 *               parent_id:
 *                 type: string
 *                 description: Optional ID of the parent comment (for replies)
 *                 example: "64f8a1234567890abcdef123"
 *     responses:
 *       201:
 *         description: Comment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Comment'
 *             example:
 *               _id: "64f8b1234567890abcdef456"
 *               post_id: "64f8a1234567890abcdef123"
 *               parent_id: "64f8a1234567890abcdef123"
 *               user:
 *                 id: "64f8c1234567890abcdef789"
 *                 username: "johndoe"
 *                 avatar_url: "https://example.com/avatar.jpg"
 *               text: "This is a reply to your comment"
 *               likes_count: 0
 *               createdAt: "2023-09-06T12:00:00.000Z"
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Post or User not found
 *   get:
 *     summary: Get comments for a post
 *     tags: [Comments]
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of comments
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
 *                 comments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Comment'
 *       404:
 *         description: Post not found
 *
 * /api/comments/{id}:
 *   delete:
 *     summary: Delete a comment
 *     tags: [Comments]
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
 *         description: Comment deleted successfully
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Comment not found
 *
 * /api/comments/{commentId}/like:
 *   post:
 *     summary: Like a comment
 *     tags: [Comments]
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
 *         description: Comment liked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 liked:
 *                   type: boolean
 *                 likes_count:
 *                   type: number
 *       400:
 *         description: Already liked
 *       404:
 *         description: Comment not found
 *
 * /api/comments/{commentId}/unlike:
 *   post:
 *     summary: Unlike a comment
 *     tags: [Comments]
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
 *         description: Comment unliked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 liked:
 *                   type: boolean
 *                 likes_count:
 *                   type: number
 *       400:
 *         description: Not liked
 *       404:
 *         description: Comment not found
 *
 * /api/comments/{commentId}/replies:
 *   get:
 *     summary: Get replies for a comment
 *     tags: [Comments]
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of replies
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
 *                 replies:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Comment'
 *       500:
 *         description: Server error
 */

router.post('/posts/:postId/comments', verifyToken, addComment);
router.get('/posts/:postId/comments', getComments);
router.delete('/comments/:id', verifyToken, deleteComment);
router.post('/comments/:commentId/like', verifyToken, likeComment);
router.post('/comments/:commentId/unlike', verifyToken, unlikeComment);
router.get('/comments/:commentId/replies', getReplies);

module.exports = router;
