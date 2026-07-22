'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const {
  createOrder,
  getMyOrders,
  cancelOrder,
  adminGetAllOrders,
  adminStartProcessing,
  adminCompleteOrder,
} = require('../controllers/giftCardOrder.controller');

/**
 * @swagger
 * tags:
 *   - name: GiftCardOrders
 *     description: Members redeem coins for gift cards; admin/sales fulfil the orders
 */

// ─────────────────────────────────────────────────────────────────────────────
// MEMBER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/gift-card-orders:
 *   post:
 *     summary: Buy a gift card denomination with coins
 *     description: |
 *       Balance must be equal to or greater than the denomination's bcoins — never less.
 *       Coins are deducted immediately and atomically, recorded in wallet transaction
 *       history (type COIN_REDEMPTION), and the order is created with status "pending".
 *     tags: [GiftCardOrders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [gift_card_id, bcoins]
 *             properties:
 *               gift_card_id:
 *                 type: string
 *                 description: The GiftCard catalog item id
 *               bcoins:
 *                 type: number
 *                 description: Must exactly match one of the card's denominations.bcoins values
 *                 example: 50000
 *     responses:
 *       201:
 *         description: Order placed
 *       400:
 *         description: Invalid denomination or insufficient balance
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Insufficient balance. You need 50000 coins for this gift card."
 *               bcoins_required: 50000
 *               bcoins_balance: 30000
 *               shortfall: 20000
 *       404:
 *         description: Gift card not found
 */
router.post('/', auth, createOrder);

/**
 * @swagger
 * /api/gift-card-orders/my:
 *   get:
 *     summary: Get my gift card order history
 *     tags: [GiftCardOrders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, processing, completed, cancelled] }
 *     responses:
 *       200:
 *         description: My orders
 */
router.get('/my', auth, getMyOrders);

/**
 * @swagger
 * /api/gift-card-orders/{id}/cancel:
 *   patch:
 *     summary: Cancel a pending order — coins are refunded to the wallet immediately
 *     description: Only allowed while status is "pending". Callable by the order owner or by admin/sales.
 *     tags: [GiftCardOrders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order cancelled and refunded
 *       400:
 *         description: Order is not in "pending" status
 *       403:
 *         description: Not the order owner and not admin/sales
 *       404:
 *         description: Order not found
 */
router.patch('/:id/cancel', auth, cancelOrder);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN / SALES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/gift-card-orders/admin/all:
 *   get:
 *     summary: List all gift card orders (admin, sales)
 *     tags: [GiftCardOrders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, processing, completed, cancelled] }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated list of orders
 */
router.get('/admin/all', auth, requireRole('admin', 'sales'), adminGetAllOrders);

/**
 * @swagger
 * /api/gift-card-orders/admin/{id}/processing:
 *   patch:
 *     summary: Start processing a pending order (admin, sales)
 *     tags: [GiftCardOrders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order moved to processing
 *       400:
 *         description: Order is not in "pending" status
 *       404:
 *         description: Order not found
 */
router.patch('/admin/:id/processing', auth, requireRole('admin', 'sales'), adminStartProcessing);

/**
 * @swagger
 * /api/gift-card-orders/admin/{id}/complete:
 *   patch:
 *     summary: Complete an order — deliver the voucher (admin, sales)
 *     description: Only allowed while status is "processing". voucher_code and expiry_date are required.
 *     tags: [GiftCardOrders]
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
 *             required: [voucher_code, expiry_date]
 *             properties:
 *               voucher_code: { type: string, example: "AMZN-XXXX-XXXX" }
 *               voucher_pin:  { type: string, example: "1234" }
 *               expiry_date:  { type: string, format: date, example: "2027-07-22" }
 *               redeem_steps:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["Go to amazon.in/gc", "Enter the code at checkout", "Balance applies automatically"]
 *     responses:
 *       200:
 *         description: Order completed and voucher delivered
 *       400:
 *         description: Missing required fields or order not in "processing" status
 *       404:
 *         description: Order not found
 */
router.patch('/admin/:id/complete', auth, requireRole('admin', 'sales'), adminCompleteOrder);

module.exports = router;
