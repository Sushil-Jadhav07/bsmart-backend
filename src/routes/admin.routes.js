const express = require('express');
const router = express.Router();
const requireAdmin = require('../middleware/requireAdmin');
const {
  deletePostByAdmin,
  deleteCommentByAdmin,
  deleteReplyByAdmin,
  deleteReelByAdmin,
  deleteStoryByAdmin,
  deleteUserByAdmin,
  deleteVendorByAdmin
} = require('../controllers/admin.controller');

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin-only moderation APIs
 */

/**
 * @swagger
 * /api/admin/posts/{id}:
 *   delete:
 *     summary: Admin permanently deletes any post
 *     description: Permanently delete a post by ID.
 *     tags: [Admin]
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
 *         description: Forbidden - Admin only
 *       404:
 *         description: Post not found
 */
router.delete('/posts/:id', requireAdmin, deletePostByAdmin);

/**
 * @swagger
 * /api/admin/comments/{id}:
 *   delete:
 *     summary: Admin permanently deletes any comment
 *     description: Permanently delete a comment by ID.
 *     tags: [Admin]
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
 *         description: Forbidden - Admin only
 *       404:
 *         description: Comment not found
 */
router.delete('/comments/:id', requireAdmin, deleteCommentByAdmin);

/**
 * @swagger
 * /api/admin/replies/{id}:
 *   delete:
 *     summary: Admin permanently deletes any reply
 *     description: Permanently delete a reply (comment with parent_id).
 *     tags: [Admin]
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
 *         description: Reply deleted successfully
 *       403:
 *         description: Forbidden - Admin only
 *       404:
 *         description: Reply not found
 */
router.delete('/replies/:id', requireAdmin, deleteReplyByAdmin);

/**
 * @swagger
 * /api/admin/reels/{id}:
 *   delete:
 *     summary: Admin permanently deletes any reel
 *     description: Permanently delete a reel post by ID.
 *     tags: [Admin]
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
 *         description: Reel deleted successfully
 *       403:
 *         description: Forbidden - Admin only
 *       404:
 *         description: Reel not found
 */
router.delete('/reels/:id', requireAdmin, deleteReelByAdmin);

/**
 * @swagger
 * /api/admin/stories/{id}:
 *   delete:
 *     summary: Admin permanently deletes any story
 *     description: Permanently delete a story by ID (also removes items and views).
 *     tags: [Admin]
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
 *         description: Story deleted successfully
 *       403:
 *         description: Forbidden - Admin only
 *       404:
 *         description: Story not found
 */
router.delete('/stories/:id', requireAdmin, deleteStoryByAdmin);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     summary: Admin permanently deletes any user
 *     description: Permanently delete user and related data (posts, comments, follows, saved posts).
 *     tags: [Admin]
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
 *         description: User deleted successfully
 *       403:
 *         description: Forbidden - Admin only
 *       404:
 *         description: User not found
 */
router.delete('/users/:id', requireAdmin, deleteUserByAdmin);

/**
 * @swagger
 * /api/admin/vendors/{id}:
 *   delete:
 *     summary: Admin permanently deletes any vendor
 *     description: Permanently delete vendor and optionally downgrade linked user role to member.
 *     tags: [Admin, Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               downgrade_user_to_member:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Vendor deleted successfully
 *       403:
 *         description: Forbidden - Admin only
 *       404:
 *         description: Vendor not found
 */
router.delete('/vendors/:id', requireAdmin, deleteVendorByAdmin);

module.exports = router;
