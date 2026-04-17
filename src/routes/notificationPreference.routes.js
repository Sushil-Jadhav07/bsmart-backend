'use strict';

const express = require('express');
const router  = express.Router();
const verifyToken = require('../middleware/auth');
const {
  toggleUserNotification,
  toggleVendorNotification,
  getUserNotificationStatus,
  getVendorNotificationStatus,
} = require('../controllers/notificationPreference.controller');

/**
 * @swagger
 * tags:
 *   name: NotificationPreferences
 *   description: Turn on / off post & reel notifications for a user or vendor profile
 */

// ─────────────────────────────────────────────────────────────────────────────
// USER NOTIFICATION PREFERENCES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/notification-preferences/users/{targetUserId}/toggle:
 *   post:
 *     summary: Toggle post/reel notifications for a user profile
 *     description: >
 *       If the logged-in user has NOT turned on notifications for the target user,
 *       this endpoint turns them ON. If they are already on, it turns them OFF.
 *       The response indicates the new state.
 *     tags: [NotificationPreferences]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: targetUserId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the user whose notifications to toggle
 *         example: "664f1a2b3c4d5e6f7a8b9c0d"
 *     responses:
 *       200:
 *         description: Notification preference toggled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                   description: true = notifications are now ON, false = now OFF
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Notifications turned on for @john_doe"
 *       400:
 *         description: Invalid ID or self-subscription attempt
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Target user not found
 *       500:
 *         description: Server error
 */
router.post(
  '/users/:targetUserId/toggle',
  verifyToken,
  toggleUserNotification
);

/**
 * @swagger
 * /api/notification-preferences/users/{targetUserId}/status:
 *   get:
 *     summary: Check if notifications are turned on for a user profile
 *     tags: [NotificationPreferences]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: targetUserId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the user to check
 *         example: "664f1a2b3c4d5e6f7a8b9c0d"
 *     responses:
 *       200:
 *         description: Notification status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                   example: false
 *       400:
 *         description: Invalid ID
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get(
  '/users/:targetUserId/status',
  verifyToken,
  getUserNotificationStatus
);

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR NOTIFICATION PREFERENCES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/notification-preferences/vendors/{targetVendorId}/toggle:
 *   post:
 *     summary: Toggle post notifications for a vendor profile
 *     description: >
 *       If the logged-in user has NOT turned on notifications for the target vendor,
 *       this endpoint turns them ON. If they are already on, it turns them OFF.
 *     tags: [NotificationPreferences]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: targetVendorId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the Vendor document
 *         example: "664f1a2b3c4d5e6f7a8b9c0d"
 *     responses:
 *       200:
 *         description: Notification preference toggled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Notifications turned on for Acme Corp"
 *       400:
 *         description: Invalid ID or self-subscription attempt
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Vendor not found
 *       500:
 *         description: Server error
 */
router.post(
  '/vendors/:targetVendorId/toggle',
  verifyToken,
  toggleVendorNotification
);

/**
 * @swagger
 * /api/notification-preferences/vendors/{targetVendorId}/status:
 *   get:
 *     summary: Check if notifications are turned on for a vendor profile
 *     tags: [NotificationPreferences]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: targetVendorId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the Vendor document
 *         example: "664f1a2b3c4d5e6f7a8b9c0d"
 *     responses:
 *       200:
 *         description: Notification status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid ID
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get(
  '/vendors/:targetVendorId/status',
  verifyToken,
  getVendorNotificationStatus
);

module.exports = router;
