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
 *     summary: Admin deletes any post
 *     description: Soft delete a post by ID (isDeleted=true) and record deletedBy and deletedAt.
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
 *     summary: Admin deletes any comment
 *     description: Soft delete a comment by ID and record deleted metadata.
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
 *     summary: Admin deletes any reply
 *     description: Soft delete a reply (comment with parent_id) and record deleted metadata.
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
 *     summary: Admin deletes any reel
 *     description: Soft delete a reel post by ID and record deleted metadata.
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
 *     summary: Admin deletes any story
 *     description: Soft delete a story by ID and record deleted metadata.
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
 *     summary: Admin deletes any user (soft)
 *     description: Soft delete user, set is_active=false and record deleted metadata.
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
 *     summary: Admin deletes any vendor (soft)
 *     description: Soft delete vendor and optionally downgrade linked user role to member.
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
