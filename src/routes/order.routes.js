const router = require('express').Router();
const auth = require('../middleware/auth');
const {
  checkout,
  verifyPayment,
  listMyOrders,
  getOrderById,
  cancelOrder,
  listSellerOrders,
  updateOrderStatus,
} = require('../controllers/order.controller');

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Checkout, payment, and order fulfillment for the influencer marketplace
 */

/**
 * @swagger
 * /api/orders/checkout:
 *   post:
 *     summary: Create an order from the current cart and start payment
 *     description: |
 *       For `payment_method: "wallet"` — coins are deducted immediately and the order
 *       comes back already `paid`/`confirmed`.
 *
 *       For `payment_method: "razorpay"` — a Razorpay order is created and returned
 *       alongside the local order (status `pending`). The frontend opens Razorpay
 *       checkout with the returned `razorpay.order_id`/`key_id`, then calls
 *       `POST /api/orders/{id}/verify-payment` with the result.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payment_method, shipping_address]
 *             properties:
 *               payment_method: { type: string, enum: [razorpay, wallet] }
 *               shipping_address:
 *                 type: object
 *                 required: [address_line1, city, pincode]
 *                 properties:
 *                   name: { type: string }
 *                   phone: { type: string }
 *                   address_line1: { type: string }
 *                   address_line2: { type: string }
 *                   city: { type: string }
 *                   state: { type: string }
 *                   pincode: { type: string }
 *                   country: { type: string, default: India }
 *     responses:
 *       201:
 *         description: Order created (wallet — paid immediately; razorpay — awaiting payment)
 *       400:
 *         description: Empty cart, insufficient stock, or insufficient wallet balance
 */
router.post('/checkout', auth, checkout);

/**
 * @swagger
 * /api/orders/{id}/verify-payment:
 *   post:
 *     summary: Verify a completed Razorpay payment and finalize the order
 *     tags: [Orders]
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
 *             required: [razorpay_order_id, razorpay_payment_id, razorpay_signature]
 *             properties:
 *               razorpay_order_id: { type: string }
 *               razorpay_payment_id: { type: string }
 *               razorpay_signature: { type: string }
 *     responses:
 *       200:
 *         description: Order confirmed
 *       400:
 *         description: Invalid signature or mismatched order
 *       404:
 *         description: Order not found
 */
router.post('/:id/verify-payment', auth, verifyPayment);

/**
 * @swagger
 * /api/orders/seller/mine:
 *   get:
 *     summary: Influencer — list orders containing their own products
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Orders scoped to this seller's line items
 *       403:
 *         description: Only influencers can view seller orders
 */
router.get('/seller/mine', auth, listSellerOrders);

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Get the logged-in buyer's own orders
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated order history
 */
router.get('/', auth, listMyOrders);

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Get a single order (buyer only)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order details
 *       404:
 *         description: Order not found
 */
router.get('/:id', auth, getOrderById);

/**
 * @swagger
 * /api/orders/{id}/cancel:
 *   patch:
 *     summary: Cancel an order (buyer only, before it ships) — refunds if already paid
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Order cancelled (and refunded if applicable)
 *       400:
 *         description: Order can no longer be cancelled
 */
router.patch('/:id/cancel', auth, cancelOrder);

/**
 * @swagger
 * /api/orders/{id}/status:
 *   patch:
 *     summary: Seller or admin — update order fulfillment status
 *     description: |
 *       Also accepts the "Fulfill order" panel's fields alongside the status change —
 *       send whichever ones changed. `courier` and `tracking_number` are **required**
 *       when transitioning to `shipped` (either in this same call, or already saved on
 *       the order from an earlier call).
 *
 *       On success, this:
 *       - Broadcasts a `order-status-updated` Socket.io event (`{order_id, order_number,
 *         order_status, courier, tracking_number, updated_at}`) to the buyer and to every
 *         seller on the order — this is what powers the "Live updates" panel.
 *       - Sends the buyer an in-app + push notification, unless `notify_customer` is false.
 *     tags: [Orders]
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
 *             required: [order_status]
 *             properties:
 *               order_status: { type: string, enum: [confirmed, processing, shipped, delivered] }
 *               confirmed_items: { type: boolean }
 *               packed: { type: boolean }
 *               courier: { type: string, example: "Blue Dart" }
 *               tracking_number: { type: string, example: "BD123456789IN" }
 *               notify_customer: { type: boolean, default: true }
 *     responses:
 *       200:
 *         description: Order updated — returns the full order
 *       400:
 *         description: Invalid order_status, or missing courier/tracking_number when marking shipped
 *       403:
 *         description: Not authorized
 */
router.patch('/:id/status', auth, updateOrderStatus);

module.exports = router;
