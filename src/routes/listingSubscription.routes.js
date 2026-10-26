const router = require('express').Router();
const auth = require('../middleware/auth');
const {
  createAccountSubscription,
  upgradeAccountSubscription,
  getMyAccountSubscription,
  cancelAccountSubscription,
} = require('../controllers/listingSubscription.controller');

/**
 * @swagger
 * tags:
 *   name: Listing Subscriptions
 *   description: 7-day free trial vs ₹99/month auto-debit subscription to become (and stay) an influencer
 */

/**
 * @swagger
 * /api/listing-subscriptions/account:
 *   post:
 *     summary: Start becoming an influencer — 7-day free trial or pay ₹99/month now
 *     description: |
 *       Authorizes a Razorpay auto-debit mandate today either way — the only
 *       difference is whether the first ₹99 charge happens today
 *       (start_trial: false) or after the 7-day trial window
 *       (start_trial: true). Does NOT switch the caller's role; the frontend
 *       does that via the existing PATCH /users/:id/role once Razorpay
 *       confirms the mandate was authorized (see the returned
 *       razorpay.subscription_id, used to open Checkout in subscription mode).
 *     tags: [Listing Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [start_trial]
 *             properties:
 *               start_trial: { type: boolean }
 *     responses:
 *       201:
 *         description: "{ subscription, razorpay: { subscription_id, key_id } }"
 *       409:
 *         description: Already has an active or pending store subscription
 */
router.post('/account', auth, createAccountSubscription);

/**
 * @swagger
 * /api/listing-subscriptions/account/upgrade:
 *   post:
 *     summary: Skip the rest of a free trial and start billing ₹99/month today
 *     description: |
 *       Cancels the trialing subscription (never charged) and creates a new
 *       one with billing starting today — requires a fresh Razorpay Checkout
 *       authorization, same as the initial pay-now path.
 *     tags: [Listing Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: "{ subscription, razorpay: { subscription_id, key_id } }"
 *       400:
 *         description: No active free trial to upgrade
 */
router.post('/account/upgrade', auth, upgradeAccountSubscription);

/**
 * @swagger
 * /api/listing-subscriptions/account/me:
 *   get:
 *     summary: Get my own store subscription status (trial countdown / next billing date)
 *     tags: [Listing Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "{ subscription } — null if never subscribed"
 */
router.get('/account/me', auth, getMyAccountSubscription);

/**
 * @swagger
 * /api/listing-subscriptions/{id}/cancel:
 *   post:
 *     summary: Cancel the store subscription — reverts the account to a plain member
 *     tags: [Listing Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Subscription cancelled, role reverted to member
 *       404:
 *         description: Subscription not found
 */
router.post('/:id/cancel', auth, cancelAccountSubscription);

module.exports = router;
