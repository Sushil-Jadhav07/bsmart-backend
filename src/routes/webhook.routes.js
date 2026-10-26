const router = require('express').Router();
const { handleWebhook } = require('../controllers/listingSubscription.controller');

/**
 * @swagger
 * tags:
 *   name: Webhooks
 *   description: Server-to-server callbacks from third parties — never called by the app's own frontend
 */

/**
 * @swagger
 * /api/webhooks/razorpay:
 *   post:
 *     summary: Razorpay subscription lifecycle webhook (unauthenticated — verified by signature instead)
 *     description: |
 *       Configure this URL in the Razorpay dashboard (Settings > Webhooks),
 *       with the same secret as RAZORPAY_WEBHOOK_SECRET on the server.
 *       Enable at least: subscription.activated, subscription.charged,
 *       subscription.pending, subscription.halted, subscription.cancelled,
 *       subscription.completed.
 *     tags: [Webhooks]
 *     responses:
 *       200:
 *         description: Acknowledged (always 200, even on internal errors, so Razorpay doesn't retry indefinitely)
 *       400:
 *         description: Missing or invalid x-razorpay-signature
 */
router.post('/razorpay', handleWebhook);

module.exports = router;
