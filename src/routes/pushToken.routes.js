const express = require('express');
const router  = express.Router();
const verifyToken = require('../middleware/auth');
const {
  registerFcmToken,
  registerWebPushSubscription,
  clearPushTokens,
} = require('../services/pushNotification.service');

/**
 * POST /api/push/register-fcm
 * Body: { fcm_token: "..." }
 *
 * Called by the Android APK right after login, and again whenever
 * Firebase refreshes the token (onTokenRefresh callback).
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
 * POST /api/push/register-web
 * Body: { subscription: { endpoint, keys: { p256dh, auth } } }
 *
 * Called by the web app after the user grants notification permission
 * and the browser creates a PushManager subscription.
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
 * DELETE /api/push/unregister
 *
 * Called when the user logs out.
 * Clears FCM token, SNS endpoint ARN, and web push subscription
 * so no notifications are sent after logout.
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
