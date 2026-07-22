'use strict';

const mongoose = require('mongoose');
const GiftCard            = require('../models/GiftCard');
const GiftCardOrder       = require('../models/GiftCardOrder');
const Wallet              = require('../models/Wallet');
const WalletTransaction   = require('../models/WalletTransaction');
const runMongoTransaction = require('../utils/runMongoTransaction');

const VALID_STATUSES = ['pending', 'processing', 'completed', 'cancelled'];

// ─── MEMBER ──────────────────────────────────────────────────────────────────

// POST /api/gift-card-orders — buy a gift card denomination with coins
exports.createOrder = async (req, res) => {
  try {
    const userId = req.userId;
    const { gift_card_id, bcoins } = req.body;

    if (!gift_card_id || !mongoose.Types.ObjectId.isValid(gift_card_id)) {
      return res.status(400).json({ success: false, message: 'A valid gift_card_id is required' });
    }
    const bcoinsNum = Number(bcoins);
    if (!Number.isFinite(bcoinsNum) || bcoinsNum <= 0) {
      return res.status(400).json({ success: false, message: 'bcoins must be a positive number matching one of this card\'s denominations' });
    }

    const giftCard = await GiftCard.findById(gift_card_id);
    if (!giftCard) {
      return res.status(404).json({ success: false, message: 'Gift card not found' });
    }
    if (giftCard.card_status !== 'active') {
      return res.status(400).json({ success: false, message: 'This gift card is not currently available' });
    }

    const denomination = giftCard.denominations.find((d) => d.bcoins === bcoinsNum);
    if (!denomination) {
      return res.status(400).json({ success: false, message: 'bcoins does not match any available denomination for this card' });
    }

    const wallet = await Wallet.findOne({ user_id: userId }).lean();
    const currentBalance = wallet?.balance || 0;
    if (currentBalance < bcoinsNum) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. You need ${bcoinsNum} coins for this gift card.`,
        bcoins_required: bcoinsNum,
        bcoins_balance:  currentBalance,
        shortfall:       bcoinsNum - currentBalance,
      });
    }

    let order;
    await runMongoTransaction({
      work: async (session) => {
        // Atomic guard — balance can be equal to or greater than bcoins, never less
        const updatedWallet = await Wallet.findOneAndUpdate(
          { user_id: userId, balance: { $gte: bcoinsNum } },
          { $inc: { balance: -bcoinsNum } },
          { new: true, session }
        );
        if (!updatedWallet) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        const [tx] = await WalletTransaction.create(
          [{
            user_id:     userId,
            type:        'COIN_REDEMPTION',
            amount:      bcoinsNum,
            description: `Gift card order — ${giftCard.title} (₹${denomination.amount})`,
            status:      'SUCCESS',
          }],
          { session }
        );

        const [createdOrder] = await GiftCardOrder.create(
          [{
            user_id:      userId,
            gift_card_id: giftCard._id,
            title:        giftCard.title,
            vendor:       giftCard.vendor,
            media:        giftCard.media || null,
            bcoins:       bcoinsNum,
            amount:       denomination.amount,
            status:       'pending',
            wallet_transaction_id: tx._id,
          }],
          { session }
        );

        order = createdOrder;
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Gift card order placed successfully',
      data: order,
    });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }
    console.error('[createOrder]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/gift-card-orders/my — member's own order list
exports.getMyOrders = async (req, res) => {
  try {
    const userId = req.userId;
    const filter = { user_id: userId };
    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const orders = await GiftCardOrder.find(filter).sort({ createdAt: -1 });
    return res.json({ success: true, total: orders.length, data: orders });
  } catch (err) {
    console.error('[getMyOrders]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/gift-card-orders/:id/cancel — cancel a pending order, refund coins to wallet
exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const order = await GiftCardOrder.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const isOwner = String(order.user_id) === String(req.userId);
    const isStaff = ['admin', 'sales'].includes(req.user?.role);
    if (!isOwner && !isStaff) {
      return res.status(403).json({ success: false, message: 'Not authorized to cancel this order' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Only pending orders can be cancelled (current status: ${order.status})`,
      });
    }

    await runMongoTransaction({
      work: async (session) => {
        await Wallet.findOneAndUpdate(
          { user_id: order.user_id },
          { $inc: { balance: order.bcoins } },
          { upsert: true, session }
        );

        const [refundTx] = await WalletTransaction.create(
          [{
            user_id:     order.user_id,
            type:        'ADMIN_ADJUSTMENT',
            amount:      order.bcoins,
            description: `Gift card order cancelled — refund (${order.title})`,
            status:      'SUCCESS',
          }],
          { session }
        );

        order.status               = 'cancelled';
        order.cancelled_at         = new Date();
        order.refund_transaction_id = refundTx._id;
        await order.save({ session });
      },
    });

    return res.json({ success: true, message: 'Order cancelled and coins refunded to wallet', data: order });
  } catch (err) {
    console.error('[cancelOrder]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── ADMIN / SALES ───────────────────────────────────────────────────────────

// GET /api/gift-card-orders/admin/all — list every order
exports.adminGetAllOrders = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (req.query.userId && mongoose.Types.ObjectId.isValid(req.query.userId)) {
      filter.user_id = req.query.userId;
    }

    const page  = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const skip  = (page - 1) * limit;

    const [total, orders] = await Promise.all([
      GiftCardOrder.countDocuments(filter),
      GiftCardOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user_id', 'full_name username email')
        .populate('processed_by', 'full_name email'),
    ]);

    return res.json({
      success: true,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      data: orders,
    });
  } catch (err) {
    console.error('[adminGetAllOrders]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/gift-card-orders/admin/:id/processing — pending → processing
exports.adminStartProcessing = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const order = await GiftCardOrder.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Only pending orders can move to processing (current status: ${order.status})`,
      });
    }

    order.status = 'processing';
    order.processed_by = req.user._id;
    await order.save();

    return res.json({ success: true, message: 'Order is now processing', data: order });
  } catch (err) {
    console.error('[adminStartProcessing]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/gift-card-orders/admin/:id/complete — processing → completed, delivers the voucher
exports.adminCompleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const { voucher_code, voucher_pin, expiry_date, redeem_steps } = req.body;

    if (!voucher_code || typeof voucher_code !== 'string' || !voucher_code.trim()) {
      return res.status(400).json({ success: false, message: 'voucher_code is required' });
    }
    if (!expiry_date || Number.isNaN(new Date(expiry_date).getTime())) {
      return res.status(400).json({ success: false, message: 'A valid expiry_date is required' });
    }

    const order = await GiftCardOrder.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.status !== 'processing') {
      return res.status(400).json({
        success: false,
        message: `Only orders in processing can be completed (current status: ${order.status})`,
      });
    }

    order.status       = 'completed';
    order.voucher_code = voucher_code.trim();
    order.voucher_pin  = typeof voucher_pin === 'string' && voucher_pin.trim() ? voucher_pin.trim() : null;
    order.expiry_date  = new Date(expiry_date);
    order.redeem_steps = Array.isArray(redeem_steps)
      ? redeem_steps.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
      : [];
    order.processed_by = req.user._id;
    await order.save();

    return res.json({ success: true, message: 'Order completed — voucher delivered', data: order });
  } catch (err) {
    console.error('[adminCompleteOrder]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
