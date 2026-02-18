const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const { followUser, unfollowUser, getFollowers, getFollowing, getAllFollowers, getAllFollowing, followByParam } = require('../controllers/follow.controller');

/**
 * @swagger
 * tags:
 *   name: Follow
 *   description: Follow and followers management
 */

/**
 * @swagger
 * /api/follow:
 *   post:
 *     summary: Follow a user
 *     tags: [Follow]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - followedUserId
 *             properties:
 *               followedUserId:
 *                 type: string
 *                 description: The ID of the user to follow
 *     responses:
 *       200:
 *         description: Follow processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 followed:
 *                   type: boolean
 *                 alreadyFollowing:
 *                   type: boolean
 *       400:
 *         description: Invalid request or already following/self-follow
 *       404:
 *         description: User not found
 */
router.post('/follow', verifyToken, followUser);

/**
 * @swagger
 * /api/unfollow:
 *   post:
 *     summary: Unfollow a user
 *     tags: [Follow]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - followedUserId
 *             properties:
 *               followedUserId:
 *                 type: string
 *                 description: The ID of the user to unfollow
 *     responses:
 *       200:
 *         description: Unfollow processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 unfollowed:
 *                   type: boolean
 *                 alreadyNotFollowing:
 *                   type: boolean
 *       404:
 *         description: Relationship not found
 */
router.post('/unfollow', verifyToken, unfollowUser);

/**
 * @swagger
 * /api/users/{id}/followers:
 *   get:
 *     summary: List followers of a user
 *     tags: [Follow]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID
 *     responses:
 *       200:
 *         description: List of followers
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
 *                       _id: { type: string }
 *                       username: { type: string }
 *                       full_name: { type: string }
 *                       avatar_url: { type: string }
 *                       followers_count: { type: number }
 *                       following_count: { type: number }
 */
router.get('/users/:id/followers', getFollowers);

/**
 * @swagger
 * /api/users/{id}/following:
 *   get:
 *     summary: List users the given user is following
 *     tags: [Follow]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID
 *     responses:
 *       200:
 *         description: List of following users
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
 *                       _id: { type: string }
 *                       username: { type: string }
 *                       full_name: { type: string }
 *                       avatar_url: { type: string }
 *                       followers_count: { type: number }
 *                       following_count: { type: number }
 */
router.get('/users/:id/following', getFollowing);

/**
 * @swagger
 * /api/followers:
 *   get:
 *     summary: Get all follower relationships
 *     tags: [Follow]
 *     responses:
 *       200:
 *         description: List of all follower relationships
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: number
 *                 relations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       follower:
 *                         type: object
 *                       followed:
 *                         type: object
 */
router.get('/followers', getAllFollowers);

/**
 * @swagger
 * /api/following:
 *   get:
 *     summary: Get all following relationships
 *     tags: [Follow]
 *     responses:
 *       200:
 *         description: List of all following relationships
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: number
 *                 relations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       follower:
 *                         type: object
 *                       followed:
 *                         type: object
 */
router.get('/following', getAllFollowing);

/**
 * @swagger
 * /api/follows/{userId}:
 *   post:
 *     summary: Follow a user by ID
 *     tags: [Follow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Followed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 follower:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     username: { type: string }
 *                     email: { type: string }
 *                     role: { type: string }
 *                 following:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     username: { type: string }
 *                     email: { type: string }
 *                     role: { type: string }
 *                 followingCount: { type: number }
 *                 followersCount: { type: number }
 *       400:
 *         description: Invalid ID or self-follow
 *       404:
 *         description: User not found
 *       409:
 *         description: Already following
 */
router.post('/follows/:userId', verifyToken, followByParam);

module.exports = router;
