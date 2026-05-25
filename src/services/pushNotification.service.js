const { SNSClient, CreatePlatformEndpointCommand, PublishCommand, DeleteEndpointCommand } = require('@aws-sdk/client-sns');
const webpush = require('web-push');
const User = require('../models/User');

// ── SNS client (same region/credentials as your existing S3 setup) ────────────
const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ── Web Push (VAPID) setup ────────────────────────────────────────────────────
// Only initialise if all three VAPID vars are present in .env
const VAPID_READY = (
  process.env.VAPID_MAILTO &&
  process.env.VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY
);
if (VAPID_READY) {
  webpush.setVapidDetails(
    process.env.VAPID_MAILTO,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('[Push] VAPID keys not set — web push notifications disabled until .env is updated.');
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Register or refresh a device FCM token for a user.
 * Called when the Android APK sends a token on login or token refresh.
 * Creates an SNS platform endpoint ARN and saves it on the User document.
 *
 * @param {string} userId    - User._id (string or ObjectId)
 * @param {string} fcmToken  - FCM registration token from the Android device
 */
const registerFcmToken = async (userId, fcmToken) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    // Skip if token hasn't changed and endpoint already exists
    if (user.fcm_token === fcmToken && user.sns_endpoint_arn) return;

    // If an old endpoint exists for a different token, delete it first
    if (user.sns_endpoint_arn && user.fcm_token !== fcmToken) {
      try {
        await snsClient.send(new DeleteEndpointCommand({ EndpointArn: user.sns_endpoint_arn }));
      } catch (_) { /* ignore — endpoint may already be gone */ }
    }

    // Create a new SNS platform endpoint for this device token
    const command = new CreatePlatformEndpointCommand({
      PlatformApplicationArn: process.env.SNS_PLATFORM_APP_ARN_ANDROID,
      Token: fcmToken,
    });
    const response = await snsClient.send(command);
    const endpointArn = response.EndpointArn;

    // Persist both the token and its SNS ARN on the user
    await User.findByIdAndUpdate(userId, {
      fcm_token: fcmToken,
      sns_endpoint_arn: endpointArn,
    });

    console.log(`[Push] FCM token registered for user ${userId}`);
  } catch (err) {
    console.error('[Push] registerFcmToken error:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Register a Web Push subscription object for a user.
 * Called when the browser sends a new subscription after the user
 * grants notification permission.
 *
 * @param {string} userId       - User._id
 * @param {object} subscription - { endpoint, keys: { p256dh, auth } }
 */
const registerWebPushSubscription = async (userId, subscription) => {
  try {
    await User.findByIdAndUpdate(userId, { web_push_subscription: subscription });
    console.log(`[Push] Web push subscription registered for user ${userId}`);
  } catch (err) {
    console.error('[Push] registerWebPushSubscription error:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Clear all push tokens for a user (called on logout).
 *
 * @param {string} userId - User._id
 */
const clearPushTokens = async (userId) => {
  try {
    const user = await User.findById(userId).select('sns_endpoint_arn');
    if (user?.sns_endpoint_arn) {
      try {
        await snsClient.send(new DeleteEndpointCommand({ EndpointArn: user.sns_endpoint_arn }));
      } catch (_) { /* ignore */ }
    }
    await User.findByIdAndUpdate(userId, {
      fcm_token: null,
      sns_endpoint_arn: null,
      web_push_subscription: null,
    });
    console.log(`[Push] Cleared push tokens for user ${userId}`);
  } catch (err) {
    console.error('[Push] clearPushTokens error:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Send a push notification to a user.
 * Tries FCM (via SNS) for Android APK and Web Push for browsers.
 * Both run independently — one failing does not stop the other.
 *
 * @param {string} recipientId  - User._id as string
 * @param {object} payload      - { title, body, link, type }
 */
const sendPushNotification = async (recipientId, payload) => {
  try {
    const user = await User.findById(recipientId).select(
      'fcm_token sns_endpoint_arn web_push_subscription'
    );
    if (!user) return;

    const {
      title        = 'Bsmart',
      body         = '',
      link         = '/',
      type         = 'general',
      senderName   = '',
      senderAvatar = '',
    } = payload;

    // ── 1. Android APK — FCM via AWS SNS ─────────────────────────────────────
    if (user.sns_endpoint_arn) {
      try {
        const message = JSON.stringify({
          GCM: JSON.stringify({
            notification: {
              title,
              body,
              click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
            data: { link, type, title, body, senderName, senderAvatar },
          }),
        });

        await snsClient.send(new PublishCommand({
          TargetArn: user.sns_endpoint_arn,
          Message: message,
          MessageStructure: 'json',
        }));

        console.log(`[Push] FCM sent to user ${recipientId}`);
      } catch (err) {
        console.error('[Push] FCM send error:', err.message);
        // If endpoint is disabled/invalid, clean it up from the user
        if (err.message?.includes('EndpointDisabled') || err.message?.includes('InvalidParameter')) {
          await User.findByIdAndUpdate(recipientId, {
            fcm_token: null,
            sns_endpoint_arn: null,
          }).catch(() => {});
        }
      }
    }

    // ── 2. Web Browser — VAPID Web Push ──────────────────────────────────────
    if (VAPID_READY && user.web_push_subscription) {
      try {
        const webPayload = JSON.stringify({ title, body, link, type, senderName, senderAvatar });
        await webpush.sendNotification(user.web_push_subscription, webPayload);
        console.log(`[Push] Web push sent to user ${recipientId}`);
      } catch (err) {
        console.error('[Push] Web push send error:', err.message);
        // 410 Gone means subscription is expired — clean it up
        if (err.statusCode === 410) {
          await User.findByIdAndUpdate(recipientId, {
            web_push_subscription: null,
          }).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('[Push] sendPushNotification error:', err.message);
  }
};

module.exports = {
  registerFcmToken,
  registerWebPushSubscription,
  clearPushTokens,
  sendPushNotification,
};