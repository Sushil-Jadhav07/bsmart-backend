const express    = require('express');
const router     = express.Router();
const verifyToken = require('../middleware/auth');

const {
  createPromoteReel,
  listPromoteReels,
  getPromoteReelById,
  updatePromoteReel,
  deletePromoteReel,
  likePromoteReel,
  unlikePromoteReel,
  getPromoteReelLikes,
  addComment,
  getComments,
  getReplies,
  deleteComment,
  deleteReply,
  likeComment,
  unlikeComment
} = require('../controllers/promoteReel.controller');

/**
 * @swagger
 * tags:
 *   name: PromoteReels
 *   description: Promote reel management — reels with attached product listings
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       required:
 *         - product_name
 *         - product_price
 *       properties:
 *         product_name:
 *           type: string
 *           example: "Wireless Earbuds Pro"
 *         product_description:
 *           type: string
 *           example: "High-quality noise-cancelling earbuds"
 *         product_price:
 *           type: number
 *           example: 1299
 *         visit_link:
 *           type: string
 *           example: "https://shop.example.com/earbuds-pro"
 *         discount_amount:
 *           type: number
 *           example: 200
 *
 *     PromoteReel:
 *       type: object
 *       properties:
 *         promote_reel_id:
 *           type: string
 *         _id:
 *           type: string
 *         item_type:
 *           type: string
 *           example: promote_reel
 *         user_id:
 *           type: object
 *           properties:
 *             username:   { type: string }
 *             full_name:  { type: string }
 *             avatar_url: { type: string }
 *         caption:       { type: string }
 *         location:      { type: string }
 *         media:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ReelMediaItem'
 *         products:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Product'
 *         tags:
 *           type: array
 *           items: { type: string }
 *         likes_count:           { type: number }
 *         comments_count:        { type: number }
 *         is_liked_by_me:        { type: boolean }
 *         hide_likes_count:      { type: boolean }
 *         turn_off_commenting:   { type: boolean }
 *         createdAt:
 *           type: string
 *           format: date-time
 */

// ═══════════════════════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/promote-reels:
 *   post:
 *     summary: Create a new promote reel
 *     tags: [PromoteReels]
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
 *               caption:             { type: string }
 *               location:            { type: string }
 *               media:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ReelMediaItem'
 *               tags:
 *                 type: array
 *                 items: { type: string }
 *               people_tags:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     user_id:  { type: string }
 *                     username: { type: string }
 *                     x:        { type: number }
 *                     y:        { type: number }
 *               hide_likes_count:    { type: boolean }
 *               turn_off_commenting: { type: boolean }
 *               products:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Product'
 *     responses:
 *       201:
 *         description: Promote reel created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PromoteReel'
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/', verifyToken, createPromoteReel);

/**
 * @swagger
 * /api/promote-reels:
 *   get:
 *     summary: List all promote reels (paginated)
 *     tags: [PromoteReels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated promote reels
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:  { type: integer }
 *                 limit: { type: integer }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PromoteReel'
 */
router.get('/', verifyToken, listPromoteReels);

/**
 * @swagger
 * /api/promote-reels/{id}:
 *   get:
 *     summary: Get a promote reel by ID
 *     tags: [PromoteReels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Promote reel details with comments
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PromoteReel'
 *       403:
 *         description: Private account – follow to view
 *       404:
 *         description: Promote reel not found
 */
router.get('/:id', verifyToken, getPromoteReelById);

/**
 * @swagger
 * /api/promote-reels/{id}:
 *   patch:
 *     summary: Update a promote reel (caption, location, tags, products, etc.)
 *     tags: [PromoteReels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               caption:             { type: string }
 *               location:            { type: string }
 *               tags:
 *                 type: array
 *                 items: { type: string }
 *               hide_likes_count:    { type: boolean }
 *               turn_off_commenting: { type: boolean }
 *               products:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Product'
 *     responses:
 *       200:
 *         description: Updated promote reel
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PromoteReel'
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Promote reel not found
 */
router.patch('/:id', verifyToken, updatePromoteReel);

/**
 * @swagger
 * /api/promote-reels/{id}:
 *   delete:
 *     summary: Delete a promote reel (soft delete)
 *     tags: [PromoteReels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted successfully
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Promote reel not found
 */
router.delete('/:id', verifyToken, deletePromoteReel);

// ═══════════════════════════════════════════════════════════════════════════
// LIKE / UNLIKE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/promote-reels/{id}/like:
 *   post:
 *     summary: Like a promote reel
 *     tags: [PromoteReels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 liked:       { type: boolean }
 *                 likes_count: { type: number }
 *       400:
 *         description: Already liked
 *       404:
 *         description: Promote reel not found
 */
router.post('/:id/like', verifyToken, likePromoteReel);

/**
 * @swagger
 * /api/promote-reels/{id}/unlike:
 *   post:
 *     summary: Unlike a promote reel
 *     tags: [PromoteReels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Unliked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 liked:       { type: boolean }
 *                 likes_count: { type: number }
 *       400:
 *         description: Not liked yet
 *       404:
 *         description: Promote reel not found
 */
router.post('/:id/unlike', verifyToken, unlikePromoteReel);

/**
 * @swagger
 * /api/promote-reels/{id}/likes:
 *   get:
 *     summary: Get users who liked a promote reel
 *     tags: [PromoteReels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Users who liked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: number }
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       username:  { type: string }
 *                       full_name: { type: string }
 *                       avatar_url:{ type: string }
 */
router.get('/:id/likes', verifyToken, getPromoteReelLikes);

// ═══════════════════════════════════════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/promote-reels/{promoteReelId}/comments:
 *   post:
 *     summary: Add a comment (or reply) to a promote reel
 *     tags: [PromoteReels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: promoteReelId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text:
 *                 type: string
 *                 example: "Love this product!"
 *               parent_id:
 *                 type: string
 *                 description: Optional – ID of the parent comment (creates a reply)
 *     responses:
 *       201:
 *         description: Comment created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Comment'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Promote reel or parent comment not found
 */
router.post('/:promoteReelId/comments', verifyToken, addComment);

/**
 * @swagger
 * /api/promote-reels/{promoteReelId}/comments:
 *   get:
 *     summary: Get top-level comments for a promote reel
 *     tags: [PromoteReels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: promoteReelId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Array of comments
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Comment'
 */
router.get('/:promoteReelId/comments', verifyToken, getComments);

/**
 * @swagger
 * /api/promote-reels/comments/{id}:
 *   delete:
 *     summary: Delete a comment on a promote reel
 *     tags: [PromoteReels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Comment deleted
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Comment not found
 */
router.delete('/comments/:id', verifyToken, deleteComment);

// ═══════════════════════════════════════════════════════════════════════════
// REPLIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/promote-reels/comments/{commentId}/replies:
 *   get:
 *     summary: Get replies for a comment on a promote reel
 *     tags: [PromoteReels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Array of replies
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Comment'
 */
router.get('/comments/:commentId/replies', verifyToken, getReplies);

/**
 * @swagger
 * /api/promote-reels/comments/{commentId}/replies/{replyId}:
 *   delete:
 *     summary: Delete a specific reply on a promote reel comment
 *     tags: [PromoteReels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: replyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Reply deleted
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Reply not found
 */
router.delete('/comments/:commentId/replies/:replyId', verifyToken, deleteReply);

// ═══════════════════════════════════════════════════════════════════════════
// COMMENT LIKE / UNLIKE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/promote-reels/comments/{commentId}/like:
 *   post:
 *     summary: Like a comment on a promote reel
 *     tags: [PromoteReels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Comment liked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 liked:       { type: boolean }
 *                 likes_count: { type: number }
 *       400:
 *         description: Already liked
 *       404:
 *         description: Comment not found
 */
router.post('/comments/:commentId/like', verifyToken, likeComment);

/**
 * @swagger
 * /api/promote-reels/comments/{commentId}/unlike:
 *   post:
 *     summary: Unlike a comment on a promote reel
 *     tags: [PromoteReels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Comment unliked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 liked:       { type: boolean }
 *                 likes_count: { type: number }
 *       400:
 *         description: Not liked
 *       404:
 *         description: Comment not found
 */
router.post('/comments/:commentId/unlike', verifyToken, unlikeComment);

module.exports = router;
