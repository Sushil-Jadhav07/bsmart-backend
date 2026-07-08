'use strict';

const express     = require('express');
const router      = express.Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const {
  getCatalog,
  getVoucherDetail,
  redeemVoucher,
  getMyRedemptions,
  getRedemptionDetail,
  adminGetAllRedemptions,
  adminUpdateRedemptionStatus,
  adminGetStats,
} = require('../controllers/voucher.controller');

/**
 * @swagger
 * tags:
 *   - name: Vouchers
 *     description: Xoxoday gift voucher redemption with member coins
 */

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN (registered before member routes to avoid /:id clash on "admin")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vouchers/admin/stats:
 *   get:
 *     summary: Redemption summary stats for admin dashboard
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats object
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               coins_per_rupee: 100
 *               stats:
 *                 total_redemptions: 42
 *                 total_coins_spent: 420000
 *                 total_face_value: 4200
 *                 completed: 38
 *                 pending: 3
 *                 failed: 1
 */
router.get('/admin/stats', auth, requireRole('admin', 'sales'), adminGetStats);

/**
 * @swagger
 * /api/vouchers/admin/all:
 *   get:
 *     summary: List all voucher redemptions (admin/sales)
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, COMPLETED, FAILED] }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *         description: Filter by specific member
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Paginated list of redemptions
 */
router.get('/admin/all', auth, requireRole('admin', 'sales'), adminGetAllRedemptions);

/**
 * @swagger
 * /api/vouchers/admin/{id}/status:
 *   patch:
 *     summary: Manually update a redemption's status (admin)
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:         { type: string, enum: [PENDING, COMPLETED, FAILED] }
 *               voucher_code:   { type: string }
 *               voucher_pin:    { type: string }
 *               failure_reason: { type: string }
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Invalid id or status
 *       404:
 *         description: Redemption not found
 */
router.patch('/admin/:id/status', auth, requireRole('admin'), adminUpdateRedemptionStatus);

// ─────────────────────────────────────────────────────────────────────────────
// MEMBER — catalog (public browse, auth optional)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vouchers/catalog:
 *   get:
 *     summary: Browse available gift vouchers from Xoxoday
 *     tags: [Vouchers]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Brand name or voucher name keyword
 *         example: Amazon
 *       - in: query
 *         name: country
 *         schema: { type: string, default: IN }
 *       - in: query
 *         name: min_price
 *         schema: { type: number }
 *         description: Minimum voucher face value in INR
 *       - in: query
 *         name: max_price
 *         schema: { type: number }
 *         description: Maximum voucher face value in INR
 *     responses:
 *       200:
 *         description: Voucher catalog with coins_required per voucher
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               coins_per_rupee: 100
 *               page: 1
 *               limit: 20
 *               total: 150
 *               vouchers:
 *                 - product_id: "amazon-in-500"
 *                   name: "Amazon Gift Card"
 *                   brand_name: "Amazon"
 *                   image_url: "https://..."
 *                   face_value: 500
 *                   currency: "INR"
 *                   currency_symbol: "₹"
 *                   coins_required: 50000
 */
router.get('/catalog', getCatalog);

/**
 * @swagger
 * /api/vouchers/catalog/{productId}:
 *   get:
 *     summary: Get single voucher detail including terms and coins required
 *     tags: [Vouchers]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *         example: amazon-in-500
 *     responses:
 *       200:
 *         description: Voucher detail
 */
router.get('/catalog/:productId', getVoucherDetail);

// ─────────────────────────────────────────────────────────────────────────────
// MEMBER — authenticated
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vouchers/redeem:
 *   post:
 *     summary: Redeem member coins for a gift voucher
 *     description: |
 *       Deducts coins from the member's wallet and places a voucher order on Xoxoday.
 *       The voucher is delivered to the member's email (or the delivery_email provided).
 *
 *       **Coins formula:** `face_value × coins_per_rupee` (default 100 coins = ₹1)
 *       Example: ₹500 voucher → 50,000 coins required
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [product_id, face_value]
 *             properties:
 *               product_id:
 *                 type: string
 *                 description: Xoxoday product/voucher ID from the catalog
 *                 example: "amazon-in-500"
 *               face_value:
 *                 type: number
 *                 description: Voucher face value in INR (must match the product's price)
 *                 example: 500
 *               delivery_email:
 *                 type: string
 *                 format: email
 *                 description: Optional — defaults to member's registered email
 *                 example: "user@example.com"
 *     responses:
 *       201:
 *         description: Voucher redeemed successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "₹500 gift voucher redeemed successfully! Check user@example.com for delivery."
 *               redemption:
 *                 _id: "664f..."
 *                 product_id: "amazon-in-500"
 *                 face_value: 500
 *                 coins_spent: 50000
 *                 delivery_email: "user@example.com"
 *                 xoxoday_order_id: "ord_XXXXXXXXX"
 *                 voucher_code: "AMZN-XXXX-XXXX"
 *                 status: "COMPLETED"
 *               wallet:
 *                 previous_balance: 100000
 *                 coins_deducted: 50000
 *                 new_balance: 50000
 *       400:
 *         description: Missing fields, invalid face_value, or insufficient coins
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Insufficient coins. You need 50000 coins for a ₹500 voucher."
 *               coins_required: 50000
 *               coins_balance: 30000
 *               shortfall: 20000
 *       403:
 *         description: Only members can redeem vouchers
 *       502:
 *         description: Xoxoday order failed — coins refunded
 */
router.post('/redeem', auth, redeemVoucher);

/**
 * @swagger
 * /api/vouchers/my-redemptions:
 *   get:
 *     summary: Get my voucher redemption history
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, COMPLETED, FAILED] }
 *     responses:
 *       200:
 *         description: My redemptions
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               pagination: { page: 1, limit: 20, total: 5, pages: 1 }
 *               redemptions:
 *                 - _id: "664f..."
 *                   product_id: "amazon-in-500"
 *                   voucher_name: "Amazon Gift Card"
 *                   face_value: 500
 *                   coins_spent: 50000
 *                   status: "COMPLETED"
 *                   createdAt: "2026-07-01T10:00:00.000Z"
 */
router.get('/my-redemptions', auth, getMyRedemptions);

/**
 * @swagger
 * /api/vouchers/my-redemptions/{id}:
 *   get:
 *     summary: Get single redemption detail (member's own only)
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Redemption detail with optional live Xoxoday status
 *       404:
 *         description: Redemption not found
 */
router.get('/my-redemptions/:id', auth, getRedemptionDetail);

module.exports = router;
