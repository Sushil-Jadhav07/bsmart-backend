const express = require('express');
const router = express.Router();
const { getAllUsers, getUserById, updateUser, deleteUser, getUserPostsDetails, listUsersProfiles } = require('../controllers/user.controller');
const { getSavedPostsByUser } = require('../controllers/saved.controller');
const { getFollowers, getFollowing } = require('../controllers/follow.controller');
const auth = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management
 */


/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get list of user profiles with posts, comments, likes, and views
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user profiles with aggregated data
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   user:
 *                     $ref: '#/components/schemas/User'
 *                   summary:
 *                     type: object
 *                     properties:
 *                       posts_count: { type: number }
 *                       reels_count: { type: number }
 *                       likes_count_total: { type: number }
 *                       comments_count_total: { type: number }
 *                       views_count_total: { type: number }
 *                       unique_views_count_total: { type: number }
 *                       completed_views_count_total: { type: number }
 *                   posts:
 *                     type: array
 *                     items:
 *                       $ref: '#/components/schemas/Post'
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/', auth, listUsersProfiles);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user details
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/:id', getUserById);

/**
 * @swagger
 * /api/users/{id}/posts:
 *   get:
 *     summary: Get user's posts with comments and likes
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID
 *     responses:
 *       200:
 *         description: List of posts with comments and likes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Post'
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/:id/posts', getUserPostsDetails);
router.get('/:id/followers', getFollowers);
router.get('/:id/following', getFollowing);
router.get('/:id/saved', auth, getSavedPostsByUser);

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user details
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *               bio:
 *                 type: string
 *               avatar_url:
 *                 type: string
 *               phone:
 *                 type: string
 *               username:
 *                 type: string
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       403:
 *         description: Not authorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.put('/:id', auth, updateUser);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete user and their posts
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       403:
 *         description: Not authorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', auth, deleteUser);

module.exports = router;
