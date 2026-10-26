const router = require('express').Router();
const auth = require('../middleware/auth');
const {
  createServiceOrder,
  verifyServiceOrderPayment,
  listMyBookings,
  getBookingById,
  cancelBooking,
  listSellerBookings,
  updateBookingStatus,
} = require('../controllers/serviceBooking.controller');

/**
 * @swagger
 * tags:
 *   name: Service Bookings
 *   description: Booking, payment, and fulfillment for influencer services
 */

/**
 * @swagger
 * /api/service-bookings/orders:
 *   post:
 *     summary: Check out one or more services (optionally from different sellers) in a single payment
 *     description: |
 *       Each entry in `items` is validated independently (availability, slot
 *       conflicts, subservice pricing, address requirement) the same way a
 *       single booking always was. Coins are applied first — `coins_to_use`
 *       is clamped server-side to the wallet balance and the order total —
 *       and any remainder is charged via Razorpay.
 *
 *       If coins alone cover the total, the order and all its bookings come
 *       back already `paid`/`confirmed`. Otherwise a Razorpay order is
 *       created for just the remainder; the wallet is NOT debited until
 *       `POST /api/service-bookings/orders/{id}/verify-payment` succeeds, so
 *       an abandoned Razorpay sheet never costs the user coins.
 *     tags: [Service Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [service_id, booking_date, time_slot]
 *                   properties:
 *                     service_id: { type: string }
 *                     booking_date: { type: string, format: date, example: "2026-10-05" }
 *                     time_slot:
 *                       type: object
 *                       required: [start, end]
 *                       properties:
 *                         start: { type: string, example: "10:00" }
 *                         end: { type: string, example: "12:00" }
 *                     selected_subservices:
 *                       type: array
 *                       description: Must match names from that service's own subservices list — price and sqft are looked up server-side, not trusted from the client
 *                       items:
 *                         type: object
 *                         properties:
 *                           name: { type: string }
 *                     customer_address:
 *                       type: object
 *                       description: Required only when that item's service method is at_customer_location
 *                     notes: { type: string }
 *               coins_to_use:
 *                 type: number
 *                 description: How many wallet coins to apply toward the order total (clamped server-side)
 *     responses:
 *       201:
 *         description: Order created (fully wallet-covered — paid immediately; otherwise awaiting Razorpay payment)
 *       400:
 *         description: Invalid slot, unavailable time, or unknown subservice
 *       404:
 *         description: A service was not found or unavailable
 *       409:
 *         description: A requested time slot is already booked
 */
router.post('/orders', auth, createServiceOrder);

/**
 * @swagger
 * /api/service-bookings/orders/{id}/verify-payment:
 *   post:
 *     summary: Verify a completed Razorpay payment and confirm a hybrid/razorpay order
 *     tags: [Service Bookings]
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
 *         description: Order (and all its bookings) confirmed
 *       400:
 *         description: Invalid signature or mismatched order
 *       404:
 *         description: Order not found
 *       409:
 *         description: Wallet balance changed before payment completed
 */
router.post('/orders/:id/verify-payment', auth, verifyServiceOrderPayment);

/**
 * @swagger
 * /api/service-bookings/seller/mine:
 *   get:
 *     summary: Influencer — list bookings made for their services
 *     tags: [Service Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bookings for this seller's services
 *       403:
 *         description: Only influencers can view seller bookings
 */
router.get('/seller/mine', auth, listSellerBookings);

/**
 * @swagger
 * /api/service-bookings:
 *   get:
 *     summary: Get the logged-in buyer's own bookings
 *     tags: [Service Bookings]
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
 *         description: Paginated booking history
 */
router.get('/', auth, listMyBookings);

/**
 * @swagger
 * /api/service-bookings/{id}:
 *   get:
 *     summary: Get a single booking (buyer only)
 *     tags: [Service Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Booking details
 *       404:
 *         description: Booking not found
 */
router.get('/:id', auth, getBookingById);

/**
 * @swagger
 * /api/service-bookings/{id}/cancel:
 *   patch:
 *     summary: Cancel a booking (buyer only, before it starts) — refunds if already paid
 *     tags: [Service Bookings]
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
 *         description: Booking cancelled (and refunded if applicable)
 *       400:
 *         description: Booking can no longer be cancelled
 */
router.patch('/:id/cancel', auth, cancelBooking);

/**
 * @swagger
 * /api/service-bookings/{id}/status:
 *   patch:
 *     summary: Seller or admin — update booking fulfillment status
 *     tags: [Service Bookings]
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
 *             required: [booking_status]
 *             properties:
 *               booking_status: { type: string, enum: [confirmed, in_progress, completed] }
 *     responses:
 *       200:
 *         description: Booking status updated
 *       403:
 *         description: Not authorized
 */
router.patch('/:id/status', auth, updateBookingStatus);

module.exports = router;
