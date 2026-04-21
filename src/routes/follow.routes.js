const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  followUser,
  followByParam,
  unfollowUser,
  getFollowers,
  getFollowing,
  getAllFollowers,
  getAllFollowing,
  // NEW: privacy
  togglePrivacy,
  setPrivacy,
  getPrivacyStatus,
  getFollowRequests,
  acceptFollowRequest,
  declineFollowRequest,
  cancelFollowRequest,
  removeFollower,
} = require('../controllers/follow.controller');

// ─── EXISTING ROUTES (unchanged) ──────────────────────────────────────────
router.post('/follow',              auth, followUser);
router.post('/unfollow',            auth, unfollowUser);
router.post('/follows/:userId',     auth, followByParam);
router.get('/users/:id/followers',  getFollowers);
router.get('/users/:id/following',  getFollowing);
router.get('/followers',            getAllFollowers);
router.get('/following',            getAllFollowing);

// ─── NEW: ACCOUNT PRIVACY ─────────────────────────────────────────────────
router.patch('/follow/privacy/toggle',   auth, togglePrivacy);
router.patch('/follow/privacy/set',      auth, setPrivacy);
router.get('/follow/privacy/status',     auth, getPrivacyStatus);

// ─── NEW: FOLLOW REQUEST MANAGEMENT ───────────────────────────────────────
router.get('/follow/requests',                        auth, getFollowRequests);
router.post('/follow/requests/:requesterId/accept',   auth, acceptFollowRequest);
router.post('/follow/requests/:requesterId/decline',  auth, declineFollowRequest);
router.delete('/follow/request/:userId/cancel',       auth, cancelFollowRequest);

// ─── NEW: FOLLOWER MANAGEMENT ─────────────────────────────────────────────
router.delete('/follow/followers/:followerId/remove', auth, removeFollower);


// ════════════════════════════════════════════════════════════════════════════
// SWAGGER DOCS
// ════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * tags:
 *   - name: Follow
 *     description: Follow / Unfollow users
 *   - name: Account Privacy
 *     description: Make your account public or private (Instagram-style)
 *   - name: Follow Requests
 *     description: Manage incoming and outgoing follow requests for private accounts
 */

// ── Existing follow routes ────────────────────────────────────────────────

/**
 * @swagger
 * /api/follow:
 *   post:
 *     tags: [Follow]
 *     summary: Follow a user
 *     description: >
 *       If the target account is **public** — follows immediately.
 *       If the target account is **private** — sends a follow request instead.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [followedUserId]
 *             properties:
 *               followedUserId:
 *                 type: string
 *                 example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       200:
 *         description: Followed successfully or request sent
 *         content:
 *           application/json:
 *             examples:
 *               public_account:
 *                 summary: Public account — direct follow
 *                 value: { "followed": true, "alreadyFollowing": false }
 *               private_account:
 *                 summary: Private account — request sent
 *                 value: { "requested": true, "message": "Follow request sent" }
 *       400:
 *         description: Cannot follow yourself
 *       404:
 *         description: User not found
 *       409:
 *         description: Follow request already sent
 */

/**
 * @swagger
 * /api/unfollow:
 *   post:
 *     tags: [Follow]
 *     summary: Unfollow a user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [followedUserId]
 *             properties:
 *               followedUserId:
 *                 type: string
 *                 example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       200:
 *         description: Unfollowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 unfollowed:
 *                   type: boolean
 */

/**
 * @swagger
 * /api/follows/{userId}:
 *   post:
 *     tags: [Follow]
 *     summary: Follow a user by URL param
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
 *         description: Followed or request sent
 *       409:
 *         description: Already following or request already sent
 */

/**
 * @swagger
 * /api/users/{id}/followers:
 *   get:
 *     tags: [Follow]
 *     summary: Get followers of a user
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of followers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 */

/**
 * @swagger
 * /api/users/{id}/following:
 *   get:
 *     tags: [Follow]
 *     summary: Get users that a user is following
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of following
 */

// ── Account Privacy ───────────────────────────────────────────────────────

/**
 * @swagger
 * /api/follow/privacy/toggle:
 *   patch:
 *     tags: [Account Privacy]
 *     summary: Toggle account between public and private
 *     description: >
 *       Flips your account privacy.
 *       **Private → Public**: all pending follow requests are auto-accepted and counts updated.
 *       **Public → Private**: future followers must send a request first.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Privacy toggled
 *         content:
 *           application/json:
 *             examples:
 *               now_private:
 *                 summary: Account set to private
 *                 value:
 *                   success: true
 *                   isPrivate: true
 *                   message: "Account is now private"
 *               now_public:
 *                 summary: Account set to public (requests auto-accepted)
 *                 value:
 *                   success: true
 *                   isPrivate: false
 *                   message: "Account is now public — all pending requests accepted"
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/follow/privacy/set:
 *   patch:
 *     tags: [Account Privacy]
 *     summary: Set account privacy explicitly
 *     description: >
 *       Pass `isPrivate: true` to make private, `isPrivate: false` to make public.
 *       Going public auto-accepts all pending follow requests.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isPrivate]
 *             properties:
 *               isPrivate:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Privacy updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 isPrivate:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: isPrivate must be a boolean
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/follow/privacy/status:
 *   get:
 *     tags: [Account Privacy]
 *     summary: Get current privacy status
 *     description: Returns whether your account is private and how many follow requests are pending.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Privacy status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isPrivate:
 *                   type: boolean
 *                   example: true
 *                 pendingRequestsCount:
 *                   type: integer
 *                   example: 3
 *       401:
 *         description: Unauthorized
 */

// ── Follow Requests ───────────────────────────────────────────────────────

/**
 * @swagger
 * /api/follow/requests:
 *   get:
 *     tags: [Follow Requests]
 *     summary: Get all incoming follow requests
 *     description: Returns the list of users who have requested to follow your private account.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending follow requests
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   example: 2
 *                 requests:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       username:
 *                         type: string
 *                       profilePicture:
 *                         type: string
 *                       bio:
 *                         type: string
 *                       followers_count:
 *                         type: integer
 *                       following_count:
 *                         type: integer
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/follow/requests/{requesterId}/accept:
 *   post:
 *     tags: [Follow Requests]
 *     summary: Accept a follow request
 *     description: >
 *       Accepts the pending request from `requesterId`.
 *       Creates a Follow record, updates follower/following counts,
 *       and sends a notification to the requester.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requesterId
 *         required: true
 *         description: The user ID of the person who sent the follow request
 *         schema:
 *           type: string
 *           example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       200:
 *         description: Follow request accepted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Follow request accepted"
 *       400:
 *         description: Invalid requesterId
 *       404:
 *         description: No pending request from this user
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/follow/requests/{requesterId}/decline:
 *   post:
 *     tags: [Follow Requests]
 *     summary: Decline a follow request
 *     description: Silently removes the request. The requester is not notified.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requesterId
 *         required: true
 *         description: The user ID of the person whose request to decline
 *         schema:
 *           type: string
 *           example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       200:
 *         description: Follow request declined
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Follow request declined"
 *       400:
 *         description: Invalid requesterId
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/follow/request/{userId}/cancel:
 *   delete:
 *     tags: [Follow Requests]
 *     summary: Cancel a follow request you sent
 *     description: Withdraws a pending follow request that the logged-in user previously sent.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         description: The user ID of the person you sent the request to
 *         schema:
 *           type: string
 *           example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       200:
 *         description: Follow request cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Follow request cancelled"
 *       400:
 *         description: Invalid userId
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/follow/followers/{followerId}/remove:
 *   delete:
 *     tags: [Follow Requests]
 *     summary: Remove a follower
 *     description: >
 *       Removes someone from your followers list.
 *       They are **not notified**. They can send a new follow request afterwards.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: followerId
 *         required: true
 *         description: The user ID of the follower to remove
 *         schema:
 *           type: string
 *           example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       200:
 *         description: Follower removed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Follower removed"
 *       400:
 *         description: Invalid followerId
 *       404:
 *         description: This user is not following you
 *       401:
 *         description: Unauthorized
 */

module.exports = router;