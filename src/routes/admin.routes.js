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
const { adminUpdateAdStatus, adminDeleteAd } = require('../controllers/ad.controller');

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
 *     description: Permanently delete a reel by ID.
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
 *     description: Permanently delete a story by ID.
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
 *     summary: Admin permanently deletes (soft delete) any user
 *     description: Soft delete a user by ID.
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
 *     summary: Admin permanently deletes (soft delete) any vendor
 *     description: Soft delete a vendor by ID.
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
 *         description: Vendor deleted successfully
 *       403:
 *         description: Forbidden - Admin only
 *       404:
 *         description: Vendor not found
 */
router.delete('/vendors/:id', requireAdmin, deleteVendorByAdmin);

/**
 * @swagger
 * /api/admin/ads/{id}:
 *   patch:
 *     summary: Admin updates ad status (approve/reject/pause)
 *     tags: [Admin, Ads]
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
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, paused, rejected]
 *               rejection_reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ad status updated
 *       403:
 *         description: Forbidden - Admin only
 *       404:
 *         description: Ad not found
 */
router.patch('/ads/:id', requireAdmin, adminUpdateAdStatus);

/**
 * @swagger
 * /api/admin/ads/{id}:
 *   delete:
 *     summary: Admin permanently deletes (soft delete) an ad
 *     tags: [Admin, Ads]
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
 *         description: Ad deleted successfully
 *       403:
 *         description: Forbidden - Admin only
 *       404:
 *         description: Ad not found
 */
router.delete('/ads/:id', requireAdmin, adminDeleteAd);

module.exports = router;
