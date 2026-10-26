const mongoose = require('mongoose');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const ServiceBooking = require('../models/ServiceBooking');
const ServiceOrder = require('../models/ServiceOrder');
const InfluencerService = require('../models/InfluencerService');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const runMongoTransaction = require('../utils/runMongoTransaction');

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const razorpay = (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;

const resolveMediaUrl = (fileName, fileUrl, baseUrl) => {
  const cloudfront = (process.env.R2_PUBLIC_BASE_URL || process.env.CLOUDFRONT_BASE_URL)
    ? (process.env.R2_PUBLIC_BASE_URL || process.env.CLOUDFRONT_BASE_URL).replace(/\/+$/, '')
    : null;
  if (fileUrl && fileUrl.startsWith('http')) return fileUrl;
  if (fileName) {
    const key = fileName.replace(/^\/+/, '');
    if (cloudfront) return `${cloudfront}/${key.startsWith('uploads/') ? key : `uploads/${key}`}`;
    return `${baseUrl}/${key.startsWith('uploads/') ? key : `uploads/${key}`}`;
  }
  return '';
};

const generateBookingNumber = () =>
  `BKG-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

const generateOrderNumber = () =>
  `SVO-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

// [start, end) overlap check for "HH:MM" strings (lexicographic compare is valid for same-format times)
const slotsOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

// Validates one checkout item against its service (availability, slot
// conflicts, subservice pricing, address requirement) and returns the
// ServiceOrder item snapshot + its total. Throws { statusCode, message } on
// any validation failure — callers should catch and respond with that.
const prepareOrderItem = async (req, raw) => {
  const { service_id, booking_date, time_slot, selected_subservices, customer_address, notes } = raw || {};
  const fail = (statusCode, message) => { const err = new Error(message); err.statusCode = statusCode; throw err; };

  if (!mongoose.Types.ObjectId.isValid(service_id)) fail(400, 'Invalid service_id');

  const date = new Date(booking_date);
  if (isNaN(date.getTime())) fail(400, 'booking_date must be a valid date');
  if (date < new Date(new Date().toDateString())) fail(400, 'booking_date cannot be in the past');
  if (!time_slot?.start || !time_slot?.end) fail(400, 'time_slot.start and time_slot.end are required');
  if (time_slot.start >= time_slot.end) fail(400, 'time_slot.start must be before time_slot.end');

  const service = await InfluencerService.findOne({ _id: service_id, isDeleted: false, visible_to_customers: true });
  if (!service) fail(404, 'Service not found or unavailable');

  const weekday = WEEKDAYS[date.getDay()];
  const dayAvailability = service.weekly_availability?.[weekday] || [];
  const fitsInAvailability = dayAvailability.some(
    (slot) => time_slot.start >= slot.start && time_slot.end <= slot.end
  );
  if (!fitsInAvailability) fail(400, `${service.name} is not available on ${weekday} at that time`);

  const dayStart = new Date(date.toDateString());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const existingBookings = await ServiceBooking.find({
    service_id,
    booking_date: { $gte: dayStart, $lt: dayEnd },
    booking_status: { $in: ['pending', 'confirmed', 'in_progress'] },
  }).select('time_slot').lean();
  const hasConflict = existingBookings.some((b) =>
    slotsOverlap(time_slot.start, time_slot.end, b.time_slot.start, b.time_slot.end)
  );
  if (hasConflict) fail(409, `${service.name}: that time slot is already booked`);

  let subservicesTotal = 0;
  const matchedSubservices = [];
  for (const requested of selected_subservices || []) {
    const match = service.subservices.find((s) => s.name === requested.name);
    if (!match) fail(400, `Unknown subservice: ${requested.name}`);
    matchedSubservices.push({ name: match.name, hours: match.hours, price: match.price, sqft: match.sqft });
    subservicesTotal += match.price;
  }

  if (service.service_method === 'at_customer_location') {
    if (!customer_address?.address_line1 || !customer_address?.city || !customer_address?.pincode) {
      fail(400, `customer_address (address_line1, city, pincode) is required for ${service.name}`);
    }
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const itemTotal = service.price + subservicesTotal;

  return {
    service_id: service._id,
    seller_id: service.user_id,
    service_name: service.name,
    service_image: service.images?.[0] ? resolveMediaUrl(service.images[0].fileName, service.images[0].fileUrl, baseUrl) : '',
    service_method: service.service_method,
    rate_type: service.rate_type,
    duration: service.duration,
    selected_subservices: matchedSubservices,
    base_price: service.price,
    subservices_total: subservicesTotal,
    item_total: itemTotal,
    booking_date: dayStart,
    time_slot,
    customer_address: service.service_method === 'at_customer_location' ? customer_address : null,
    notes: notes || '',
  };
};

// Creates one ServiceBooking from an order item, for use inside the create
// and pay-now transactions below. `extra` carries the fields that differ
// between the fully-wallet-paid path and the pending-Razorpay path.
const bookingFromItem = (req, item, extra) => ({
  booking_number: generateBookingNumber(),
  user_id: req.userId,
  service_id: item.service_id,
  seller_id: item.seller_id,
  service_name: item.service_name,
  service_image: item.service_image,
  service_method: item.service_method,
  rate_type: item.rate_type,
  duration: item.duration,
  selected_subservices: item.selected_subservices,
  base_price: item.base_price,
  subservices_total: item.subservices_total,
  total_amount: item.item_total,
  booking_date: item.booking_date,
  time_slot: item.time_slot,
  customer_address: item.customer_address,
  notes: item.notes,
  ...extra,
});

// ─── Create a multi-service order & start payment ─────────────────────────────
// Body: { items: [{ service_id, booking_date, time_slot, selected_subservices,
// customer_address, notes }], coins_to_use }. Coins are applied first (capped
// server-side at the wallet balance and the order total); Razorpay only
// covers what's left. The wallet isn't actually debited until payment is
// fully confirmed — see verifyServiceOrderPayment — so an abandoned Razorpay
// sheet never leaves a user short of coins.
exports.createServiceOrder = async (req, res) => {
  try {
    const { items, coins_to_use } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items must be a non-empty array' });
    }

    const preparedItems = [];
    for (const raw of items) {
      preparedItems.push(await prepareOrderItem(req, raw));
    }
    const subtotal = preparedItems.reduce((sum, item) => sum + item.item_total, 0);

    const wallet = await Wallet.findOne({ user_id: req.userId });
    const walletBalance = wallet?.balance || 0;
    const requestedCoins = Math.max(0, Number(coins_to_use) || 0);
    const coinsToUse = Math.min(requestedCoins, walletBalance, subtotal);
    const remaining = Math.round((subtotal - coinsToUse) * 100) / 100;

    const orderNumber = generateOrderNumber();

    // ── Fully covered by wallet — confirm everything immediately ────────────
    if (remaining <= 0) {
      const result = await runMongoTransaction({
        work: async (session) => {
          const [order] = await ServiceOrder.create([{
            order_number: orderNumber,
            user_id: req.userId,
            items: preparedItems,
            subtotal_amount: subtotal,
            total_amount: subtotal,
            payment_method: 'wallet',
            coins_used: coinsToUse,
            razorpay_amount: 0,
            payment_status: 'paid',
            order_status: 'confirmed',
            placed_at: new Date(),
          }], { session });

          await Wallet.updateOne({ user_id: req.userId }, { $inc: { balance: -coinsToUse } }).session(session);
          const [txn] = await WalletTransaction.create([{
            user_id: req.userId,
            type: 'MARKETPLACE_ORDER_PAYMENT',
            amount: coinsToUse,
            description: `Payment for order ${order.order_number}`,
            status: 'SUCCESS',
          }], { session });

          for (const item of order.items) {
            const [booking] = await ServiceBooking.create([bookingFromItem(req, item, {
              service_order_id: order._id,
              payment_method: 'wallet',
              payment_status: 'paid',
              coins_used: item.item_total,
              razorpay_used: 0,
              wallet_transaction_id: txn._id,
              booking_status: 'confirmed',
              placed_at: new Date(),
            })], { session });
            item.booking_id = booking._id;
          }

          order.wallet_transaction_id = txn._id;
          await order.save({ session });
          return order;
        },
      });

      return res.status(201).json({ success: true, order: result });
    }

    // ── Hybrid or pure Razorpay — hold the slots as 'pending', wallet untouched ──
    if (!razorpay) {
      return res.status(500).json({ message: 'Razorpay is not configured on the server' });
    }
    const paymentMethod = coinsToUse > 0 ? 'hybrid' : 'razorpay';

    const order = await runMongoTransaction({
      work: async (session) => {
        const [order] = await ServiceOrder.create([{
          order_number: orderNumber,
          user_id: req.userId,
          items: preparedItems,
          subtotal_amount: subtotal,
          total_amount: subtotal,
          payment_method: paymentMethod,
          coins_used: coinsToUse,
          razorpay_amount: remaining,
          payment_status: 'pending',
          order_status: 'pending',
        }], { session });

        for (const item of order.items) {
          const [booking] = await ServiceBooking.create([bookingFromItem(req, item, {
            service_order_id: order._id,
            payment_method: paymentMethod,
            payment_status: 'pending',
            booking_status: 'pending',
          })], { session });
          item.booking_id = booking._id;
        }

        await order.save({ session });
        return order;
      },
    });

    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(remaining * 100), // paise
      currency: 'INR',
      receipt: order.order_number,
      notes: { service_order_id: String(order._id), user_id: String(req.userId) },
    });

    order.razorpay_order_id = rzpOrder.id;
    await order.save();

    return res.status(201).json({
      success: true,
      order,
      razorpay: {
        order_id: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        key_id: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('[createServiceOrder]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Verify Razorpay payment & confirm a hybrid/razorpay order ───────────────
// Only now — once the full payment (coins + Razorpay remainder) is actually
// confirmed — are coins deducted from the wallet.
exports.verifyServiceOrderPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required' });
    }

    const order = await ServiceOrder.findOne({ _id: id, user_id: req.userId });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!['razorpay', 'hybrid'].includes(order.payment_method)) {
      return res.status(400).json({ message: 'This order does not require Razorpay verification' });
    }
    if (order.payment_status === 'paid') {
      return res.json({ success: true, order, message: 'Already verified' });
    }
    if (order.razorpay_order_id !== razorpay_order_id) {
      return res.status(400).json({ message: 'razorpay_order_id does not match this order' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      order.payment_status = 'failed';
      await order.save();
      return res.status(400).json({ message: 'Payment verification failed — invalid signature' });
    }

    const result = await runMongoTransaction({
      work: async (session) => {
        let walletTxnId = null;

        if (order.coins_used > 0) {
          const wallet = await Wallet.findOne({ user_id: req.userId }).session(session);
          if (!wallet || wallet.balance < order.coins_used) {
            const err = new Error('Your wallet balance changed before payment completed — please retry.');
            err.statusCode = 409;
            throw err;
          }
          await Wallet.updateOne({ user_id: req.userId }, { $inc: { balance: -order.coins_used } }).session(session);
          const [txn] = await WalletTransaction.create([{
            user_id: req.userId,
            type: 'MARKETPLACE_ORDER_PAYMENT',
            amount: order.coins_used,
            description: `Payment for order ${order.order_number}`,
            status: 'SUCCESS',
            razorpay_order_id,
            razorpay_payment_id,
          }], { session });
          walletTxnId = txn._id;
        }

        order.payment_status = 'paid';
        order.order_status = 'confirmed';
        order.razorpay_payment_id = razorpay_payment_id;
        order.razorpay_signature = razorpay_signature;
        order.wallet_transaction_id = walletTxnId;
        order.placed_at = new Date();
        await order.save({ session });

        for (const item of order.items) {
          const itemCoins = order.coins_used > 0
            ? Math.round((item.item_total / order.subtotal_amount) * order.coins_used)
            : 0;
          await ServiceBooking.updateOne(
            { _id: item.booking_id },
            {
              payment_status: 'paid',
              booking_status: 'confirmed',
              placed_at: new Date(),
              razorpay_payment_id,
              razorpay_signature,
              wallet_transaction_id: walletTxnId,
              coins_used: itemCoins,
              razorpay_used: item.item_total - itemCoins,
            },
          ).session(session);
        }

        return order;
      },
    });

    return res.json({ success: true, order: result });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('[verifyServiceOrderPayment]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Buyer: list own bookings ─────────────────────────────────────────────────
exports.listMyBookings = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

    const [total, bookings] = await Promise.all([
      ServiceBooking.countDocuments({ user_id: req.userId }),
      ServiceBooking.find({ user_id: req.userId })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    return res.json({ success: true, total, page: pageNum, limit: limitNum, bookings });
  } catch (error) {
    console.error('[listMyBookings]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Buyer: get a single booking ──────────────────────────────────────────────
exports.getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid booking ID' });
    }

    const booking = await ServiceBooking.findOne({ _id: id, user_id: req.userId }).lean();
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    return res.json({ success: true, booking });
  } catch (error) {
    console.error('[getBookingById]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Buyer: cancel a booking ──────────────────────────────────────────────────
// Refunds whatever mix of coins/Razorpay this specific booking was actually
// paid with (coins_used / razorpay_used, set at verify time) — works the
// same whether the booking was paid by pure wallet, pure Razorpay, or hybrid.
exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid booking ID' });
    }

    const booking = await ServiceBooking.findOne({ _id: id, user_id: req.userId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (!['pending', 'confirmed'].includes(booking.booking_status)) {
      return res.status(400).json({ message: `Cannot cancel a booking that is already ${booking.booking_status}` });
    }

    booking.booking_status = 'cancelled';
    booking.cancelled_at = new Date();
    booking.cancelled_reason = reason || '';

    if (booking.payment_status === 'paid') {
      if (booking.coins_used > 0) {
        await Wallet.updateOne({ user_id: booking.user_id }, { $inc: { balance: booking.coins_used } });
        await WalletTransaction.create({
          user_id: booking.user_id,
          type: 'MARKETPLACE_ORDER_REFUND',
          amount: booking.coins_used,
          description: `Refund (coins) for cancelled booking ${booking.booking_number}`,
          status: 'SUCCESS',
        });
      }
      if (booking.razorpay_used > 0 && razorpay && booking.razorpay_payment_id) {
        try {
          await razorpay.payments.refund(booking.razorpay_payment_id, {
            amount: Math.round(booking.razorpay_used * 100),
          });
        } catch (refundErr) {
          console.error('[cancelBooking] Razorpay refund failed:', refundErr.message);
        }
      }
      booking.payment_status = 'refunded';
    }

    await booking.save();
    return res.json({ success: true, booking });
  } catch (error) {
    console.error('[cancelBooking]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Seller (influencer): list bookings for their services ──────────────────
exports.listSellerBookings = async (req, res) => {
  try {
    if (req.user.role !== 'influencer') {
      return res.status(403).json({ message: 'Only influencers can view seller bookings' });
    }

    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

    const query = { seller_id: req.userId };
    const [total, bookings] = await Promise.all([
      ServiceBooking.countDocuments(query),
      ServiceBooking.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    return res.json({ success: true, total, page: pageNum, limit: limitNum, bookings });
  } catch (error) {
    console.error('[listSellerBookings]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Seller/Admin: update booking fulfillment status ─────────────────────────
exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const booking_status = req.body.booking_status || req.body.status;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid booking ID' });
    }

    const allowed = ['confirmed', 'in_progress', 'completed'];
    if (!allowed.includes(booking_status)) {
      return res.status(400).json({ message: `booking_status must be one of: ${allowed.join(', ')}` });
    }

    const booking = await ServiceBooking.findById(id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const isSeller = String(booking.seller_id) === String(req.userId);
    const isAdmin = req.user.role === 'admin';
    if (!isSeller && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to update this booking' });
    }
    if (booking.booking_status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot update a cancelled booking' });
    }

    booking.booking_status = booking_status;
    await booking.save();

    return res.json({ success: true, booking });
  } catch (error) {
    console.error('[updateBookingStatus]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
