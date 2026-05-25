const express = require('express');
const router  = express.Router();
const verifyToken = require('../middleware/auth');
const {
  registerFcmToken,
  registerWebPushSubscription,
  clearPushTokens,
} = require('../services/pushNotification.service');

/**
 * @swagger
 * tags:
 *   name: Push Notifications
 *   description: Register and manage push notification tokens for Android APK and Web browser
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     FcmTokenRequest:
 *       type: object
 *       required:
 *         - fcm_token
 *       properties:
 *         fcm_token:
 *           type: string
 *           description: Firebase Cloud Messaging token from the Android device
 *           example: "dGhpcyBpcyBhIHNhbXBsZSBGQ00gdG9rZW4..."
 *
 *     WebPushSubscription:
 *       type: object
 *       required:
 *         - subscription
 *       properties:
 *         subscription:
 *           type: object
 *           required:
 *             - endpoint
 *             - keys
 *           properties:
 *             endpoint:
 *               type: string
 *               description: Browser push endpoint URL
 *               example: "https://fcm.googleapis.com/fcm/send/abc123..."
 *             keys:
 *               type: object
 *               required:
 *                 - p256dh
 *                 - auth
 *               properties:
 *                 p256dh:
 *                   type: string
 *                   description: Public key for encryption
 *                   example: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlzkls..."
 *                 auth:
 *                   type: string
 *                   description: Auth secret
 *                   example: "tBHItJI5svbpez7KI4CCXg=="
 *
 *     PushSuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "FCM token registered"
 *
 *     PushErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Server error"
 *         error:
 *           type: string
 *           example: "fcm_token is required"
 */

/**
 * @swagger
 * /api/push/register-fcm:
 *   post:
 *     summary: Register Android FCM token
 *     description: >
 *       Called by the Android APK right after login and again whenever
 *       Firebase refreshes the token (onTokenRefresh callback).
 *       Creates an AWS SNS endpoint ARN and saves it on the user document.
 *     tags: [Push Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FcmTokenRequest'
 *           example:
 *             fcm_token: "dGhpcyBpcyBhIHNhbXBsZSBGQ00gdG9rZW4..."
 *     responses:
 *       200:
 *         description: FCM token registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PushSuccessResponse'
 *             example:
 *               success: true
 *               message: "FCM token registered"
 *       400:
 *         description: Missing fcm_token in request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PushErrorResponse'
 *             example:
 *               message: "fcm_token is required"
 *       401:
 *         description: Unauthorized — invalid or missing Bearer token
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PushErrorResponse'
 */
router.post('/register-fcm', verifyToken, async (req, res) => {
  try {
    const { fcm_token } = req.body;
    if (!fcm_token) {
      return res.status(400).json({ message: 'fcm_token is required' });
    }
    await registerFcmToken(req.user._id, fcm_token);
    res.json({ success: true, message: 'FCM token registered' });
  } catch (err) {
    console.error('[Push Route] register-fcm error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/**
 * @swagger
 * /api/push/register-web:
 *   post:
 *     summary: Register browser Web Push subscription
 *     description: >
 *       Called by the web app after the user grants notification permission
 *       and the browser creates a PushManager subscription object.
 *       The subscription is saved on the user document for future web push delivery.
 *     tags: [Push Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WebPushSubscription'
 *           example:
 *             subscription:
 *               endpoint: "https://fcm.googleapis.com/fcm/send/abc123xyz"
 *               keys:
 *                 p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlzkls..."
 *                 auth: "tBHItJI5svbpez7KI4CCXg=="
 *     responses:
 *       200:
 *         description: Web push subscription registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PushSuccessResponse'
 *             example:
 *               success: true
 *               message: "Web push subscription registered"
 *       400:
 *         description: Missing or invalid subscription object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PushErrorResponse'
 *             example:
 *               message: "subscription object is required"
 *       401:
 *         description: Unauthorized — invalid or missing Bearer token
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PushErrorResponse'
 */
router.post('/register-web', verifyToken, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ message: 'subscription object is required' });
    }
    await registerWebPushSubscription(req.user._id, subscription);
    res.json({ success: true, message: 'Web push subscription registered' });
  } catch (err) {
    console.error('[Push Route] register-web error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/**
 * @swagger
 * /api/push/unregister:
 *   delete:
 *     summary: Unregister all push tokens
 *     description: >
 *       Called when the user logs out.
 *       Clears FCM token, AWS SNS endpoint ARN, and web push subscription
 *       from the user document so no notifications are sent after logout.
 *       Also deletes the SNS endpoint from AWS.
 *     tags: [Push Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Push tokens cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PushSuccessResponse'
 *             example:
 *               success: true
 *               message: "Push tokens cleared"
 *       401:
 *         description: Unauthorized — invalid or missing Bearer token
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PushErrorResponse'
 */
router.delete('/unregister', verifyToken, async (req, res) => {
  try {
    await clearPushTokens(req.user._id);
    res.json({ success: true, message: 'Push tokens cleared' });
  } catch (err) {
    console.error('[Push Route] unregister error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;