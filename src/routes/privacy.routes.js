const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const {
  getPrivacySettings,
  updateProfileVisibility,
  updateActivityStatus,
  updateFollowSettings,
  updateMessagingPrivacy,
  updateSearchDiscovery,
} = require('../controllers/privacy.controller');

/**
 * @swagger
 * tags:
 *   name: Privacy Settings
 *   description: Manage profile visibility, activity status, follow settings, messaging privacy, and search discovery
 */

// ─── Shared schema components ──────────────────────────────────────────────────

/**
 * @swagger
 * components:
 *   schemas:
 *     VisibilityValue:
 *       type: string
 *       enum: [everyone, followers_only, nobody]
 *       example: everyone
 *
 *     ProfileVisibility:
 *       type: object
 *       properties:
 *         profile:        { $ref: '#/components/schemas/VisibilityValue' }
 *         posts:          { $ref: '#/components/schemas/VisibilityValue' }
 *         stories:        { $ref: '#/components/schemas/VisibilityValue' }
 *         pulse:          { $ref: '#/components/schemas/VisibilityValue' }
 *         followers_list: { $ref: '#/components/schemas/VisibilityValue' }
 *         following_list: { $ref: '#/components/schemas/VisibilityValue' }
 *
 *     ActivityStatus:
 *       type: object
 *       properties:
 *         show_online_status:  { type: boolean, example: true }
 *         show_last_seen:      { type: boolean, example: true }
 *         show_read_receipts:  { type: boolean, example: true }
 *
 *     FollowSettings:
 *       type: object
 *       properties:
 *         allow_follow_requests:        { type: boolean, example: true }
 *         auto_approve_follow_requests: { type: boolean, example: false }
 *
 *     SearchDiscovery:
 *       type: object
 *       properties:
 *         allow_search_by_username: { type: boolean, example: true }
 *         allow_search_by_email:    { type: boolean, example: true }
 *         allow_search_by_phone:    { type: boolean, example: true }
 *         appear_in_suggestions:    { type: boolean, example: true }
 */

// ─────────────────────────────────────────────────────────────────────────────
// GET — all privacy settings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/privacy:
 *   get:
 *     summary: Get all privacy settings
 *     description: Returns the full privacy configuration for the authenticated user, with defaults applied for any unset fields.
 *     tags: [Privacy Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Full privacy settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile_visibility:
 *                   $ref: '#/components/schemas/ProfileVisibility'
 *                 activity_status:
 *                   $ref: '#/components/schemas/ActivityStatus'
 *                 follow_settings:
 *                   $ref: '#/components/schemas/FollowSettings'
 *                 messaging_privacy:
 *                   $ref: '#/components/schemas/VisibilityValue'
 *                 search_discovery:
 *                   $ref: '#/components/schemas/SearchDiscovery'
 *             example:
 *               profile_visibility:
 *                 profile: everyone
 *                 posts: everyone
 *                 stories: followers_only
 *                 pulse: everyone
 *                 followers_list: everyone
 *                 following_list: followers_only
 *               activity_status:
 *                 show_online_status: true
 *                 show_last_seen: true
 *                 show_read_receipts: false
 *               follow_settings:
 *                 allow_follow_requests: true
 *                 auto_approve_follow_requests: false
 *               messaging_privacy: followers_only
 *               search_discovery:
 *                 allow_search_by_username: true
 *                 allow_search_by_email: false
 *                 allow_search_by_phone: false
 *                 appear_in_suggestions: true
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/', auth, getPrivacySettings);

// ─────────────────────────────────────────────────────────────────────────────
// Profile Visibility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/privacy/profile-visibility:
 *   patch:
 *     summary: Update profile visibility settings
 *     description: |
 *       Controls who can view each section of your profile.
 *       Send only the fields you want to change — others are left unchanged.
 *
 *       **Visibility values:**
 *       | Value | Meaning |
 *       |---|---|
 *       | `everyone` | Visible to all users |
 *       | `followers_only` | Visible only to your followers |
 *       | `nobody` | Hidden from everyone |
 *     tags: [Privacy Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProfileVisibility'
 *           example:
 *             profile: everyone
 *             posts: followers_only
 *             stories: followers_only
 *             pulse: everyone
 *             followers_list: followers_only
 *             following_list: followers_only
 *     responses:
 *       200:
 *         description: Profile visibility updated
 *         content:
 *           application/json:
 *             example:
 *               message: "Profile visibility updated"
 *               profile_visibility:
 *                 profile: everyone
 *                 posts: followers_only
 *                 stories: followers_only
 *                 pulse: everyone
 *                 followers_list: followers_only
 *                 following_list: followers_only
 *       400:
 *         description: Invalid visibility value or no fields provided
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.patch('/profile-visibility', auth, updateProfileVisibility);

// ─────────────────────────────────────────────────────────────────────────────
// Activity Status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/privacy/activity-status:
 *   patch:
 *     summary: Update activity status settings
 *     description: |
 *       Controls whether other users can see your online status, last seen time, and read receipts.
 *       Send only the fields you want to change.
 *     tags: [Privacy Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ActivityStatus'
 *           example:
 *             show_online_status: true
 *             show_last_seen: false
 *             show_read_receipts: false
 *     responses:
 *       200:
 *         description: Activity status settings updated
 *         content:
 *           application/json:
 *             example:
 *               message: "Activity status updated"
 *               activity_status:
 *                 show_online_status: true
 *                 show_last_seen: false
 *                 show_read_receipts: false
 *       400:
 *         description: No valid fields provided
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.patch('/activity-status', auth, updateActivityStatus);

// ─────────────────────────────────────────────────────────────────────────────
// Follow Settings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/privacy/follow-settings:
 *   patch:
 *     summary: Update follow settings
 *     description: |
 *       Controls who can follow you and whether follow requests are approved automatically.
 *
 *       - **`allow_follow_requests`** — when `false`, nobody can send you follow requests.
 *       - **`auto_approve_follow_requests`** — when `true`, incoming follow requests are automatically accepted (no manual approval needed). Only applies when `isPrivate` is `true`.
 *     tags: [Privacy Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FollowSettings'
 *           example:
 *             allow_follow_requests: true
 *             auto_approve_follow_requests: false
 *     responses:
 *       200:
 *         description: Follow settings updated
 *         content:
 *           application/json:
 *             example:
 *               message: "Follow settings updated"
 *               follow_settings:
 *                 allow_follow_requests: true
 *                 auto_approve_follow_requests: false
 *       400:
 *         description: No valid fields provided
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.patch('/follow-settings', auth, updateFollowSettings);

// ─────────────────────────────────────────────────────────────────────────────
// Messaging Privacy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/privacy/messaging:
 *   patch:
 *     summary: Update messaging privacy
 *     description: |
 *       Controls who can send you direct messages.
 *
 *       **Visibility values:**
 *       | Value | Meaning |
 *       |---|---|
 *       | `everyone` | Anyone on the platform can message you |
 *       | `followers_only` | Only your followers can message you |
 *       | `nobody` | Direct messages are disabled |
 *     tags: [Privacy Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messaging_privacy
 *             properties:
 *               messaging_privacy:
 *                 $ref: '#/components/schemas/VisibilityValue'
 *           example:
 *             messaging_privacy: followers_only
 *     responses:
 *       200:
 *         description: Messaging privacy updated
 *         content:
 *           application/json:
 *             example:
 *               message: "Messaging privacy updated"
 *               messaging_privacy: followers_only
 *       400:
 *         description: Invalid or missing value
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.patch('/messaging', auth, updateMessagingPrivacy);

// ─────────────────────────────────────────────────────────────────────────────
// Search & Discovery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/privacy/search-discovery:
 *   patch:
 *     summary: Update search & discovery settings
 *     description: |
 *       Controls how other users can find your account.
 *       Send only the fields you want to change.
 *
 *       - **`allow_search_by_username`** — allows your account to appear in username search results.
 *       - **`allow_search_by_email`** — allows others to find you by your email address.
 *       - **`allow_search_by_phone`** — allows others to find you by your mobile number.
 *       - **`appear_in_suggestions`** — controls whether your account appears in "People you may know" suggestions.
 *     tags: [Privacy Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SearchDiscovery'
 *           example:
 *             allow_search_by_username: true
 *             allow_search_by_email: false
 *             allow_search_by_phone: false
 *             appear_in_suggestions: true
 *     responses:
 *       200:
 *         description: Search & discovery settings updated
 *         content:
 *           application/json:
 *             example:
 *               message: "Search & discovery settings updated"
 *               search_discovery:
 *                 allow_search_by_username: true
 *                 allow_search_by_email: false
 *                 allow_search_by_phone: false
 *                 appear_in_suggestions: true
 *       400:
 *         description: No valid fields provided
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.patch('/search-discovery', auth, updateSearchDiscovery);

module.exports = router;
