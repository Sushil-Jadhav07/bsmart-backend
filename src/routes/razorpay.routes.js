'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { listAllPayments } = require('../controllers/razorpay.controller');

/**
 * @swagger
 * tags:
 *   - name: Razorpay
 *     description: Direct passthrough to Razorpay's own account-wide APIs (admin only)
 */

/**
 * @swagger
 * /api/razorpay/payments:
 *   get:
 *     summary: Get every Razorpay payment on the account (admin) — not scoped to any user
 *     description: |
 *       Direct proxy of Razorpay's own Payments API (https://api.razorpay.com/v1/payments).
 *       Returns the account's entire payment ledger, independent of this app's own
 *       WalletTransaction records. Razorpay caps results at 100 per call — page
 *       through with `skip` (increment by `count` each time) until `has_more` is false.
 *     tags: [Razorpay]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: count
 *         schema: { type: integer, default: 100, maximum: 100 }
 *       - in: query
 *         name: skip
 *         schema: { type: integer, default: 0 }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date, example: "2026-01-01" }
 *         description: Start date (inclusive)
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date, example: "2026-08-17" }
 *         description: End date (inclusive)
 *     responses:
 *       200:
 *         description: List of Razorpay payment objects
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               count: 2
 *               skip: 0
 *               limit: 100
 *               has_more: false
 *               data:
 *                 - id: "pay_XXXXXXXXXXXX"
 *                   amount: 50000
 *                   currency: "INR"
 *                   status: "captured"
 *                   order_id: "order_XXXXXXXXXXXX"
 *                   method: "upi"
 *                   email: "user@example.com"
 *                   contact: "+919999999999"
 *                   created_at: 1737100000
 *                   notes: { user_id: "664f...", recharge_amount: "500", coins_to_credit: "2000" }
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       500:
 *         description: Server error / Razorpay API error
 */
router.get('/payments', auth, requireRole('admin'), listAllPayments);

module.exports = router;
