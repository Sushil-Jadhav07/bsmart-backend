'use strict';

const mongoose = require('mongoose');
const crypto   = require('crypto');

const Wallet             = require('../models/Wallet');
const WalletTransaction  = require('../models/WalletTransaction');
const VoucherRedemption  = require('../models/VoucherRedemption');
const User               = require('../models/User');
const runMongoTransaction = require('../utils/runMongoTransaction');
const xoxoday            = require('../services/xoxoday.service');

// ─── Config ──────────────────────────────────────────────────────────────────
// How many member coins equal ₹1 of face value.
// Default: 100 coins = ₹1 → to redeem ₹100 voucher, member needs 10,000 coins.
const COINS_PER_RUPEE = Number(process.env.XOXODAY_COINS_PER_RUPEE || 100);

const coinsToRupees = (coins) => Math.floor(coins / COINS_PER_RUPEE);
const rupeesToCoins = (rupees) => Math.ceil(rupees * COINS_PER_RUPEE);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — Member endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/vouchers/catalog
 * Lists available gift vouchers from Xoxoday.
 * Query: page, limit, search, country (default IN), min_price, max_price
 */
exports.getCatalog = async (req, res) => {
  try {
    const limit  = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const page   = Math.max(1, Number(req.query.page || 1));
    const offset = (page - 1) * limit;

    const data = await xoxoday.getVouchers({
      limit,
      offset,
      search:    req.query.search || '',
      country:   req.query.country || 'IN',
      min_price: req.query.min_price ? Number(req.query.min_price) : undefined,
      max_price: req.query.max_price ? Number(req.query.max_price) : undefined,
    });

    // Normalise response — add coins_required for each voucher so frontend can show affordability
    const vouchers = (data?.vouchers || []).map((v) => ({
      product_id:    v.productId   || v.product_id || v.id,
      name:          v.name        || v.voucherName,
      brand_name:    v.brandName   || v.brand || '',
      description:   v.description || '',
      image_url:     v.imageUrl    || v.image_url || '',
      face_value:    v.price       || v.denomination || 0,
      currency:      v.currencyCode || 'INR',
      currency_symbol: v.currencySymbol || '₹',
      min_price:     v.minPrice    || v.price || 0,
      max_price:     v.maxPrice    || v.price || 0,
      coins_required: rupeesToCoins(v.price || v.denomination || 0),
    }));

    return res.json({
      success: true,
      coins_per_rupee: COINS_PER_RUPEE,
      page,
      limit,
      total: data?.total || vouchers.length,
      vouchers,
    });
  } catch (err) {
    console.error('[voucher] getCatalog error:', err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to fetch voucher catalog' });
  }
};

/**
 * GET /api/vouchers/catalog/:productId
 * Single voucher detail with coins_required.
 */
exports.getVoucherDetail = async (req, res) => {
  try {
    const v = await xoxoday.getVoucherById(req.params.productId);

    return res.json({
      success: true,
      coins_per_rupee: COINS_PER_RUPEE,
      voucher: {
        product_id:      v.productId   || v.product_id || v.id,
        name:            v.name        || v.voucherName,
        brand_name:      v.brandName   || v.brand || '',
        description:     v.description || '',
        image_url:       v.imageUrl    || v.image_url || '',
        face_value:      v.price       || v.denomination || 0,
        currency:        v.currencyCode || 'INR',
        currency_symbol: v.currencySymbol || '₹',
        min_price:       v.minPrice    || v.price || 0,
        max_price:       v.maxPrice    || v.price || 0,
        coins_required:  rupeesToCoins(v.price || v.denomination || 0),
        terms:           v.terms       || v.termsAndConditions || '',
        expiry_days:     v.expiryInMonths ? v.expiryInMonths * 30 : null,
      },
    });
  } catch (err) {
    console.error('[voucher] getVoucherDetail error:', err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to fetch voucher' });
  }
};

/**
 * POST /api/vouchers/redeem
 * Deducts member coins and places the order on Xoxoday.
 *
 * Body: { product_id, face_value, delivery_email? }
 *
 * Flow:
 *   1. Check member has enough coins (face_value × COINS_PER_RUPEE)
 *   2. Deduct coins via runMongoTransaction (atomic)
 *   3. Call Xoxoday placeOrder
 *   4. Save VoucherRedemption record
 *   5. If Xoxoday fails after deduction → refund coins + mark FAILED
 */
exports.redeemVoucher = async (req, res) => {
  const userId = req.userId;
  const { product_id, face_value, delivery_email } = req.body;

  if (!product_id || !face_value) {
    return res.status(400).json({ success: false, message: 'product_id and face_value are required' });
  }
  if (typeof face_value !== 'number' || face_value <= 0) {
    return res.status(400).json({ success: false, message: 'face_value must be a positive number (INR)' });
  }

  const coinsNeeded = rupeesToCoins(face_value);

  try {
    const user   = await User.findById(userId).select('email full_name role').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role !== 'member') return res.status(403).json({ success: false, message: 'Only members can redeem vouchers' });

    const wallet = await Wallet.findOne({ user_id: userId }).lean();
    if (!wallet || wallet.balance < coinsNeeded) {
      return res.status(400).json({
        success: false,
        message: `Insufficient coins. You need ${coinsNeeded} coins for a ₹${face_value} voucher.`,
        coins_required: coinsNeeded,
        coins_balance:  wallet?.balance || 0,
        shortfall:      coinsNeeded - (wallet?.balance || 0),
      });
    }

    const poNumber    = `bsmart_${userId.toString().slice(-8)}_${Date.now()}`;
    const emailToUse  = delivery_email || user.email;

    // ── Step 1: Deduct coins atomically ──────────────────────────────────────
    let walletTxId;
    await runMongoTransaction(async (session) => {
      const updatedWallet = await Wallet.findOneAndUpdate(
        { user_id: userId, balance: { $gte: coinsNeeded } },
        { $inc: { balance: -coinsNeeded } },
        { new: true, session }
      );
      if (!updatedWallet) throw new Error('Insufficient coins or wallet not found');

      const tx = await WalletTransaction.create([{
        user_id:     userId,
        type:        'COIN_REDEMPTION',
        amount:      coinsNeeded,
        description: `Gift voucher redemption — ₹${face_value} (${poNumber})`,
        status:      'SUCCESS',
      }], { session });

      walletTxId = tx[0]._id;
    });

    // ── Step 2: Place order on Xoxoday ───────────────────────────────────────
    let xoxodayResult;
    let redemptionStatus = 'PENDING';
    let failureReason    = '';

    try {
      xoxodayResult = await xoxoday.placeOrder({
        poNumber,
        email:     emailToUse,
        productId: product_id,
        quantity:  1,
        price:     face_value,
        name:      user.full_name || '',
      });
      redemptionStatus = 'COMPLETED';
    } catch (xoxoErr) {
      console.error('[voucher] Xoxoday placeOrder failed:', xoxoErr.message);
      failureReason = xoxoErr.message;
      redemptionStatus = 'FAILED';

      // Refund coins since Xoxoday call failed
      await Wallet.findOneAndUpdate({ user_id: userId }, { $inc: { balance: coinsNeeded } });
      await WalletTransaction.create({
        user_id:     userId,
        type:        'ADMIN_ADJUSTMENT',
        amount:      coinsNeeded,
        description: `Refund — Xoxoday order failed (${poNumber})`,
        status:      'SUCCESS',
      });
    }

    // ── Step 3: Save redemption record ───────────────────────────────────────
    const xoxodayOrder = xoxodayResult?.order || xoxodayResult;
    const voucherInfo  = xoxodayOrder?.vouchers?.[0] || {};

    const redemption = await VoucherRedemption.create({
      user_id:               userId,
      product_id,
      face_value,
      coins_spent:           coinsNeeded,
      delivery_email:        emailToUse,
      xoxoday_order_id:      xoxodayOrder?.orderId   || xoxodayOrder?.order_id  || null,
      xoxoday_po_number:     poNumber,
      voucher_code:          voucherInfo?.code        || voucherInfo?.voucherCode || null,
      voucher_pin:           voucherInfo?.pin         || null,
      expires_at:            voucherInfo?.expiryDate  ? new Date(voucherInfo.expiryDate) : null,
      status:                redemptionStatus,
      failure_reason:        failureReason,
      wallet_transaction_id: walletTxId || null,
    });

    if (redemptionStatus === 'FAILED') {
      return res.status(502).json({
        success:  false,
        message:  'Voucher order failed — your coins have been refunded.',
        coins_refunded: coinsNeeded,
        failure_reason: failureReason,
        redemption_id:  redemption._id,
      });
    }

    const newBalance = (wallet.balance - coinsNeeded);
    return res.status(201).json({
      success: true,
      message: `₹${face_value} gift voucher redeemed successfully! Check ${emailToUse} for delivery.`,
      redemption: {
        _id:              redemption._id,
        product_id,
        face_value,
        coins_spent:      coinsNeeded,
        delivery_email:   emailToUse,
        xoxoday_order_id: redemption.xoxoday_order_id,
        voucher_code:     redemption.voucher_code,
        voucher_pin:      redemption.voucher_pin,
        expires_at:       redemption.expires_at,
        status:           redemptionStatus,
      },
      wallet: {
        previous_balance: wallet.balance,
        coins_deducted:   coinsNeeded,
        new_balance:      newBalance,
      },
    });
  } catch (err) {
    console.error('[voucher] redeemVoucher error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};

/**
 * GET /api/vouchers/my-redemptions
 * Member's own redemption history.
 */
exports.getMyRedemptions = async (req, res) => {
  try {
    const userId = req.userId;
    const page   = Math.max(1, Number(req.query.page || 1));
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const skip   = (page - 1) * limit;

    const filter = { user_id: userId };
    if (req.query.status) filter.status = req.query.status;

    const [total, redemptions] = await Promise.all([
      VoucherRedemption.countDocuments(filter),
      VoucherRedemption.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v')
        .lean(),
    ]);

    return res.json({
      success: true,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      redemptions,
    });
  } catch (err) {
    console.error('[voucher] getMyRedemptions error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET /api/vouchers/my-redemptions/:id
 * Single redemption detail + live Xoxoday status check.
 */
exports.getRedemptionDetail = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid redemption id' });
    }

    const redemption = await VoucherRedemption.findOne({ _id: id, user_id: userId }).lean();
    if (!redemption) return res.status(404).json({ success: false, message: 'Redemption not found' });

    // Optionally refresh from Xoxoday if still PENDING
    let liveStatus = null;
    if (redemption.status === 'PENDING' && redemption.xoxoday_order_id) {
      try {
        liveStatus = await xoxoday.getOrderStatus(redemption.xoxoday_order_id);
      } catch {
        // Non-critical — don't fail the request
      }
    }

    return res.json({ success: true, redemption, xoxoday_live: liveStatus });
  } catch (err) {
    console.error('[voucher] getRedemptionDetail error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/vouchers/admin/all
 * All redemptions across all members. Admin/sales only.
 * Query: page, limit, status, userId, startDate, endDate
 */
exports.adminGetAllRedemptions = async (req, res) => {
  try {
    const page  = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.userId && mongoose.Types.ObjectId.isValid(req.query.userId)) {
      filter.user_id = req.query.userId;
    }
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate)   filter.createdAt.$lte = new Date(req.query.endDate + 'T23:59:59');
    }

    const [total, redemptions] = await Promise.all([
      VoucherRedemption.countDocuments(filter),
      VoucherRedemption.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user_id', 'full_name username email avatar_url')
        .select('-__v')
        .lean(),
    ]);

    return res.json({
      success: true,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      redemptions,
    });
  } catch (err) {
    console.error('[voucher] adminGetAllRedemptions error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * PATCH /api/vouchers/admin/:id/status
 * Manually update redemption status (e.g., mark COMPLETED after manual fulfilment).
 * Body: { status, voucher_code?, voucher_pin?, failure_reason? }
 */
exports.adminUpdateRedemptionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid redemption id' });
    }

    const { status, voucher_code, voucher_pin, failure_reason } = req.body;
    const VALID = ['PENDING', 'COMPLETED', 'FAILED'];
    if (!VALID.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${VALID.join(', ')}` });
    }

    const updates = { status };
    if (voucher_code    !== undefined) updates.voucher_code    = voucher_code;
    if (voucher_pin     !== undefined) updates.voucher_pin     = voucher_pin;
    if (failure_reason  !== undefined) updates.failure_reason  = failure_reason;

    const redemption = await VoucherRedemption.findByIdAndUpdate(id, { $set: updates }, { new: true });
    if (!redemption) return res.status(404).json({ success: false, message: 'Redemption not found' });

    return res.json({ success: true, message: 'Redemption status updated', redemption });
  } catch (err) {
    console.error('[voucher] adminUpdateRedemptionStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET /api/vouchers/admin/stats
 * Summary stats for admin dashboard.
 */
exports.adminGetStats = async (req, res) => {
  try {
    const [agg] = await VoucherRedemption.aggregate([
      {
        $group: {
          _id: null,
          total_redemptions:  { $sum: 1 },
          total_coins_spent:  { $sum: '$coins_spent' },
          total_face_value:   { $sum: '$face_value' },
          completed:  { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
          pending:    { $sum: { $cond: [{ $eq: ['$status', 'PENDING']   }, 1, 0] } },
          failed:     { $sum: { $cond: [{ $eq: ['$status', 'FAILED']    }, 1, 0] } },
        },
      },
    ]);

    return res.json({
      success: true,
      coins_per_rupee: COINS_PER_RUPEE,
      stats: agg || {
        total_redemptions: 0, total_coins_spent: 0, total_face_value: 0,
        completed: 0, pending: 0, failed: 0,
      },
    });
  } catch (err) {
    console.error('[voucher] adminGetStats error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
