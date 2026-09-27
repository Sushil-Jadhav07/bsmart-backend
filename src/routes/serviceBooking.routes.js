const router = require('express').Router();
const auth = require('../middleware/auth');
const {
  createBooking,
  verifyPayment,
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
 * /api/service-bookings:
 *   post:
 *     summary: Book a service at a specific date/time slot and start payment
 *     description: |
 *       Validates the requested `time_slot` against the service's `weekly_availability`
 *       for that weekday, and rejects it if it overlaps an existing active booking for
 *       the same service.
 *
 *       For `payment_method: "wallet"` — coins are deducted immediately and the booking
 *       comes back already `paid`/`confirmed`.
 *
 *       For `payment_method: "razorpay"` — a Razorpay order is created and returned
 *       alongside the local booking (status `pending`). The frontend opens Razorpay
 *       checkout, then calls `POST /api/service-bookings/{id}/verify-payment`.
 *     tags: [Service Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [service_id, booking_date, time_slot, payment_method]
 *             properties:
 *               service_id: { type: string }
 *               booking_date: { type: string, format: date, example: "2026-10-05" }
 *               time_slot:
 *                 type: object
 *                 required: [start, end]
 *                 properties:
 *                   start: { type: string, example: "10:00" }
 *                   end: { type: string, example: "12:00" }
 *               selected_subservices:
 *                 type: array
 *                 description: Must match names from the service's own subservices list — price is looked up server-side, not trusted from the client
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *               customer_address:
 *                 type: object
 *                 description: Required only when the service's method is at_customer_location
 *                 properties:
 *                   name: { type: string }
 *                   phone: { type: string }
 *                   address_line1: { type: string }
 *                   address_line2: { type: string }
 *                   city: { type: string }
 *                   state: { type: string }
 *                   pincode: { type: string }
 *                   country: { type: string, default: India }
 *               notes: { type: string }
 *               payment_method: { type: string, enum: [razorpay, wallet] }
 *     responses:
 *       201:
 *         description: Booking created (wallet — paid immediately; razorpay — awaiting payment)
 *       400:
 *         description: Invalid slot, unavailable time, or insufficient wallet balance
 *       404:
 *         description: Service not found or unavailable
 *       409:
 *         description: That time slot is already booked
 */
router.post('/', auth, createBooking);

/**
 * @swagger
 * /api/service-bookings/{id}/verify-payment:
 *   post:
 *     summary: Verify a completed Razorpay payment and confirm the booking
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
 *         description: Booking confirmed
 *       400:
 *         description: Invalid signature or mismatched booking
 *       404:
 *         description: Booking not found
 */
router.post('/:id/verify-payment', auth, verifyPayment);

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
