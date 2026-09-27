const mongoose = require('mongoose');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const ServiceBooking = require('../models/ServiceBooking');
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

// [start, end) overlap check for "HH:MM" strings (lexicographic compare is valid for same-format times)
const slotsOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

// ─── Create a booking & start payment ─────────────────────────────────────────
exports.createBooking = async (req, res) => {
  try {
    const { service_id, booking_date, time_slot, selected_subservices, customer_address, notes, payment_method } = req.body;

    if (!mongoose.Types.ObjectId.isValid(service_id)) {
      return res.status(400).json({ message: 'Invalid service_id' });
    }
    if (!['razorpay', 'wallet'].includes(payment_method)) {
      return res.status(400).json({ message: "payment_method must be 'razorpay' or 'wallet'" });
    }
    const date = new Date(booking_date);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ message: 'booking_date must be a valid date' });
    }
    if (date < new Date(new Date().toDateString())) {
      return res.status(400).json({ message: 'booking_date cannot be in the past' });
    }
    if (!time_slot?.start || !time_slot?.end) {
      return res.status(400).json({ message: 'time_slot.start and time_slot.end are required' });
    }
    if (time_slot.start >= time_slot.end) {
      return res.status(400).json({ message: 'time_slot.start must be before time_slot.end' });
    }

    const service = await InfluencerService.findOne({ _id: service_id, isDeleted: false, visible_to_customers: true });
    if (!service) return res.status(404).json({ message: 'Service not found or unavailable' });

    // ── Availability check: the requested slot must fit inside a published slot for that weekday ──
    const weekday = WEEKDAYS[date.getDay()];
    const dayAvailability = service.weekly_availability?.[weekday] || [];
    const fitsInAvailability = dayAvailability.some(
      (slot) => time_slot.start >= slot.start && time_slot.end <= slot.end
    );
    if (!fitsInAvailability) {
      return res.status(400).json({ message: `This service is not available on ${weekday} at that time` });
    }

    // ── Conflict check: no overlapping active booking for this service on the same date ──
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
    if (hasConflict) {
      return res.status(409).json({ message: 'That time slot is already booked' });
    }

    // ── Validate & price selected subservices against the authoritative list on the service ──
    let subservicesTotal = 0;
    const matchedSubservices = [];
    for (const requested of selected_subservices || []) {
      const match = service.subservices.find((s) => s.name === requested.name);
      if (!match) {
        return res.status(400).json({ message: `Unknown subservice: ${requested.name}` });
      }
      matchedSubservices.push({ name: match.name, hours: match.hours, price: match.price });
      subservicesTotal += match.price;
    }

    if (service.service_method === 'at_customer_location') {
      if (!customer_address?.address_line1 || !customer_address?.city || !customer_address?.pincode) {
        return res.status(400).json({ message: 'customer_address (address_line1, city, pincode) is required for this service' });
      }
    }

    const totalAmount = service.price + subservicesTotal;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const bookingBase = {
      booking_number: generateBookingNumber(),
      user_id: req.userId,
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
      total_amount: totalAmount,
      booking_date: dayStart,
      time_slot,
      customer_address: service.service_method === 'at_customer_location' ? customer_address : null,
      notes: notes || '',
    };

    if (payment_method === 'wallet') {
      const result = await runMongoTransaction({
        work: async (session) => {
          const wallet = await Wallet.findOne({ user_id: req.userId }).session(session);
          if (!wallet || wallet.balance < totalAmount) {
            const err = new Error(`Insufficient wallet balance. Required: ${totalAmount}, Available: ${wallet?.balance || 0}`);
            err.statusCode = 400;
            throw err;
          }

          const [booking] = await ServiceBooking.create([{
            ...bookingBase,
            payment_method: 'wallet',
            payment_status: 'paid',
            booking_status: 'confirmed',
            placed_at: new Date(),
          }], { session });

          await Wallet.updateOne({ user_id: req.userId }, { $inc: { balance: -totalAmount } }).session(session);

          const [txn] = await WalletTransaction.create([{
            user_id: req.userId,
            type: 'MARKETPLACE_ORDER_PAYMENT',
            amount: totalAmount,
            description: `Payment for booking ${booking.booking_number}`,
            status: 'SUCCESS',
          }], { session });

          booking.wallet_transaction_id = txn._id;
          await booking.save({ session });

          return booking;
        },
      });

      return res.status(201).json({ success: true, booking: result });
    }

    // ── Razorpay path ────────────────────────────────────────────────────────
    if (!razorpay) {
      return res.status(500).json({ message: 'Razorpay is not configured on the server' });
    }

    const booking = await ServiceBooking.create({
      ...bookingBase,
      payment_method: 'razorpay',
      payment_status: 'pending',
      booking_status: 'pending',
    });

    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100), // paise
      currency: 'INR',
      receipt: booking.booking_number,
      notes: { booking_id: String(booking._id), user_id: String(req.userId) },
    });

    booking.razorpay_order_id = rzpOrder.id;
    await booking.save();

    return res.status(201).json({
      success: true,
      booking,
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
    console.error('[createBooking]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Verify Razorpay payment & confirm the booking ───────────────────────────
exports.verifyPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid booking ID' });
    }
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required' });
    }

    const booking = await ServiceBooking.findOne({ _id: id, user_id: req.userId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.payment_method !== 'razorpay') {
      return res.status(400).json({ message: 'This booking is not a Razorpay booking' });
    }
    if (booking.payment_status === 'paid') {
      return res.json({ success: true, booking, message: 'Already verified' });
    }
    if (booking.razorpay_order_id !== razorpay_order_id) {
      return res.status(400).json({ message: 'razorpay_order_id does not match this booking' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      booking.payment_status = 'failed';
      await booking.save();
      return res.status(400).json({ message: 'Payment verification failed — invalid signature' });
    }

    booking.payment_status = 'paid';
    booking.booking_status = 'confirmed';
    booking.razorpay_payment_id = razorpay_payment_id;
    booking.razorpay_signature = razorpay_signature;
    booking.placed_at = new Date();
    await booking.save();

    return res.json({ success: true, booking });
  } catch (error) {
    console.error('[verifyPayment]', error);
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
      if (booking.payment_method === 'wallet') {
        await Wallet.updateOne({ user_id: booking.user_id }, { $inc: { balance: booking.total_amount } });
        await WalletTransaction.create({
          user_id: booking.user_id,
          type: 'MARKETPLACE_ORDER_REFUND',
          amount: booking.total_amount,
          description: `Refund for cancelled booking ${booking.booking_number}`,
          status: 'SUCCESS',
        });
        booking.payment_status = 'refunded';
      } else if (booking.payment_method === 'razorpay' && razorpay && booking.razorpay_payment_id) {
        try {
          await razorpay.payments.refund(booking.razorpay_payment_id, {
            amount: Math.round(booking.total_amount * 100),
          });
          booking.payment_status = 'refunded';
        } catch (refundErr) {
          console.error('[cancelBooking] Razorpay refund failed:', refundErr.message);
        }
      }
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
    const { booking_status } = req.body;
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
