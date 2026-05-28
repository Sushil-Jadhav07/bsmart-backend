const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const {
  deletePostByAdmin,
  deleteCommentByAdmin,
  deleteReplyByAdmin,
  deleteReelByAdmin,
  deleteStoryByAdmin,
  deleteUserByAdmin,
  deleteVendorByAdmin,
  adminGetAllUsers,
  adminGetUserContent,
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
router.delete('/posts/:id', auth, requireAdmin, deletePostByAdmin);

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
router.delete('/comments/:id', auth, requireAdmin, deleteCommentByAdmin);

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
router.delete('/replies/:id', auth, requireAdmin, deleteReplyByAdmin);

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
router.delete('/reels/:id', auth, requireAdmin, deleteReelByAdmin);

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
router.delete('/stories/:id', auth, requireAdmin, deleteStoryByAdmin);

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
router.delete('/users/:id', auth, requireAdmin, deleteUserByAdmin);

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
router.delete('/vendors/:id', auth, requireAdmin, deleteVendorByAdmin);

/**
 * @swagger
 * /api/admin/ads/{id}:
 *   patch:
 *     summary: Admin updates ad status (approve/reject/pause)
 *     description: |
 *       Updates moderation status for an ad.
 *       Allowed statuses: `active`, `paused`, `rejected`.
 *       If status is `rejected`, you can pass `rejection_reason`.
 *       Admin access is required (roles supported by middleware include `admin`, `admin_manager`, `superadmin`, `super_admin`).
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
 *                 description: Optional reason shown when status is rejected
 *             example:
 *               status: rejected
 *               rejection_reason: "Policy violation"
 *     responses:
 *       200:
 *         description: Ad status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string, example: "Ad status updated to paused" }
 *                 data:
 *                   type: object
 *                 ad:
 *                   type: object
 *       400:
 *         description: Validation error (invalid ad id or invalid status)
 *       401:
 *         description: Missing/invalid token
 *       403:
 *         description: Forbidden - Admin only
 *       404:
 *         description: Ad not found
 */
router.patch('/ads/:id', auth, requireAdmin, adminUpdateAdStatus);

/**
 * @swagger
 * /api/admin/ads/{id}:
 *   delete:
 *     summary: Admin permanently deletes an ad
 *     description: Permanently removes the ad document.
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
 *         description: Ad deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string, example: "Ad deleted" }
 *       403:
 *         description: Forbidden - Admin only
 *       404:
 *         description: Ad not found
 */
router.delete('/ads/:id', auth, requireAdmin, adminDeleteAd);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Admin - get all users (user data only)
 *     description: Returns a paginated list of all user records with no posts or enriched data. Supports optional filters by role and a search query that matches against username, full_name, and email.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number (1-based)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Items per page (max 100)
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum:
 *             - member
 *             - vendor
 *             - admin
 *             - sales
 *         description: Filter by user role
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Case-insensitive search on username, full_name, or email
 *     responses:
 *       200:
 *         description: Paginated list of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 total:
 *                   type: integer
 *                   example: 120
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 20
 *                 pages:
 *                   type: integer
 *                   example: 6
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "60f1b2c3d4e5f67890123456"
 *                       username:
 *                         type: string
 *                         example: "john_doe"
 *                       full_name:
 *                         type: string
 *                         example: "John Doe"
 *                       email:
 *                         type: string
 *                         example: "john@example.com"
 *                       phone:
 *                         type: string
 *                         example: "+911234567890"
 *                       role:
 *                         type: string
 *                         example: "member"
 *                       is_active:
 *                         type: boolean
 *                         example: true
 *                       avatar_url:
 *                         type: string
 *                         example: ""
 *                       bio:
 *                         type: string
 *                         example: "Software developer"
 *                       age:
 *                         type: integer
 *                         example: 25
 *                       gender:
 *                         type: string
 *                         example: "male"
 *                       location:
 *                         type: string
 *                         example: "Mumbai, India"
 *                       isPrivate:
 *                         type: boolean
 *                         example: false
 *                       followers_count:
 *                         type: integer
 *                         example: 42
 *                       following_count:
 *                         type: integer
 *                         example: 18
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized - missing or invalid token
 *       403:
 *         description: Forbidden - admin access required
 *       500:
 *         description: Server error
 */
router.get('/users', auth, requireAdmin, adminGetAllUsers);

/**
 * @swagger
 * /api/admin/users/{id}/content:
 *   get:
 *     summary: Admin - get a user's posts, reels, tweets, promote reels (and ads if vendor)
 *     description: Returns all content created by the specified user grouped by type. Posts, reels, promote_reels and tweets are always present. The ads array is included only when the user role is vendor. All media items include a resolved fileUrl field.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID (MongoDB ObjectId)
 *         example: "60f1b2c3d4e5f67890123456"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Maximum number of items to return per content type
 *     responses:
 *       200:
 *         description: User content grouped by type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user_id:
 *                   type: string
 *                   example: "60f1b2c3d4e5f67890123456"
 *                 role:
 *                   type: string
 *                   example: "vendor"
 *                 counts:
 *                   type: object
 *                   properties:
 *                     posts:
 *                       type: integer
 *                       example: 5
 *                     reels:
 *                       type: integer
 *                       example: 3
 *                     promote_reels:
 *                       type: integer
 *                       example: 2
 *                     tweets:
 *                       type: integer
 *                       example: 8
 *                     ads:
 *                       type: integer
 *                       description: Present only when role is vendor
 *                       example: 4
 *                 data:
 *                   type: object
 *                   properties:
 *                     posts:
 *                       type: array
 *                       description: Regular image/video posts
 *                       items:
 *                         type: object
 *                     reels:
 *                       type: array
 *                       description: Short video reels
 *                       items:
 *                         type: object
 *                     promote_reels:
 *                       type: array
 *                       description: Promoted reels with product tags
 *                       items:
 *                         type: object
 *                     tweets:
 *                       type: array
 *                       description: Top-level tweets (replies excluded)
 *                       items:
 *                         type: object
 *                     ads:
 *                       type: array
 *                       description: Vendor ads - only present when role is vendor
 *                       items:
 *                         type: object
 *       400:
 *         description: Invalid user ID format
 *       401:
 *         description: Unauthorized - missing or invalid token
 *       403:
 *         description: Forbidden - admin access required
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/users/:id/content', auth, requireAdmin, adminGetUserContent);

module.exports = router;
