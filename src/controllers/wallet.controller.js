'use strict';

const mongoose = require('mongoose');
const Ad = require('../models/Ad');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const VendorPackagePurchase = require('../models/VendorPackagePurchase');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const sendNotification = require('../utils/sendNotification');
const runMongoTransaction = require('../utils/runMongoTransaction');
const { sendCoinsLowEmail } = require('./email.controller');

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DEBIT_TYPES = new Set([
  'AD_VIEW_DEDUCTION',
  'AD_LIKE_DEDUCTION',
  'AD_LIKE_REWARD_REVERSAL',
  'AD_COMMENT_DEDUCTION',
  'AD_REPLY_DEDUCTION',
  'AD_SAVE_DEDUCTION',
  'AD_BUDGET_DEDUCTION',
  'VENDOR_PROFILE_VIEW_DEDUCTION',
]);

const VENDOR_WALLET_TYPES = new Set([
  'VENDOR_REGISTRATION_CREDIT',
  'VENDOR_RECHARGE',
  'VENDOR_PACKAGE_PURCHASE',
  'AD_BUDGET_DEDUCTION',
  'AD_LIKE_BUDGET_REFUND',
  'VENDOR_PROFILE_VIEW_DEDUCTION',
  'ADMIN_ADJUSTMENT',
]);

const MEMBER_WALLET_TYPES = new Set([
  'AD_VIEW_REWARD',
  'AD_LIKE_REWARD',
  'AD_LIKE_REWARD_REVERSAL',
  'AD_COMMENT_REWARD',
  'AD_REPLY_REWARD',
  'AD_SAVE_REWARD',
  'REEL_VIEW_REWARD',
  'AD_REWARD',
  'VENDOR_PROFILE_VIEW_REWARD',
  'ADMIN_ADJUSTMENT',
]);

const LOW_COIN_THRESHOLD = 500;

const fireAndForget = (label, promise) => {
  promise.catch((err) => console.error(`[Email] ${label} failed:`, err.message));
};

const AD_DEDUCTION_TYPES = [
  'AD_VIEW_DEDUCTION',
  'AD_LIKE_DEDUCTION',
  'AD_COMMENT_DEDUCTION',
  'AD_REPLY_DEDUCTION',
  'AD_SAVE_DEDUCTION',
];

const TRANSACTION_LABELS = {
  VENDOR_REGISTRATION_CREDIT:    'Registration Credit',
  VENDOR_RECHARGE:               'Wallet Recharge',
  VENDOR_PACKAGE_PURCHASE:       'Package Purchase',
  ADMIN_ADJUSTMENT:              'Admin Adjustment',
  REEL_VIEW_REWARD:              'Reel View Reward',
  AD_REWARD:                     'Ad Reward',
  AD_VIEW_REWARD:                'Ad View Reward',
  AD_VIEW_DEDUCTION:             'Ad View Deduction',
  AD_LIKE_REWARD:                'Ad Like Reward',
  AD_LIKE_DEDUCTION:             'Ad Like Deduction',
  AD_LIKE_REWARD_REVERSAL:       'Like Reversed (Deducted)',
  AD_LIKE_BUDGET_REFUND:         'Like Reversed (Refund)',
  AD_COMMENT_REWARD:             'Ad Comment Reward',
  AD_COMMENT_DEDUCTION:          'Ad Comment Deduction',
  AD_REPLY_REWARD:               'Ad Reply Reward',
  AD_REPLY_DEDUCTION:            'Ad Reply Deduction',
  AD_SAVE_REWARD:                'Ad Save Reward',
  AD_SAVE_DEDUCTION:             'Ad Save Deduction',
  AD_BUDGET_DEDUCTION:           'Ad Budget Allocated',
  VENDOR_PROFILE_VIEW_REWARD:    'Vendor Profile View Reward',
  VENDOR_PROFILE_VIEW_DEDUCTION: 'Vendor Profile View Deduction',
  LIKE:    'Like',
  COMMENT: 'Comment',
  REPLY:   'Reply',
  SAVE:    'Save',
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const enrichTransaction = (t, adTitleField = 'caption') => {
  const rawAmount = Number(t.amount ?? 0);
  const amount = rawAmount > 0 && DEBIT_TYPES.has(t.type) ? -rawAmount : rawAmount;
  const direction = amount >= 0 ? 'credit' : 'debit';
  const createdAt = t.createdAt || t.transactionDate;
  const label = TRANSACTION_LABELS[t.type] || t.type;
  const adTitle = t.ad_id?.[adTitleField] ? String(t.ad_id[adTitleField]) : null;
  const description = t.description || (adTitle ? `${label} • ${adTitle}` : label);

  return {
    _id: t._id,
    type: t.type,
    amount,
    direction,
    label,
    description,
    status: t.status,
    ad: t.ad_id
      ? { _id: t.ad_id._id, title: t.ad_id[adTitleField] || t.ad_id.caption || '' }
      : null,
    user: t.user_id && typeof t.user_id === 'object'
      ? { _id: t.user_id._id, username: t.user_id.username, full_name: t.user_id.full_name, role: t.user_id.role, avatar_url: t.user_id.avatar_url }
      : { _id: t.user_id },
    created_at: createdAt,
  };
};

const getOrCreateWallet = async (userId, session) => {
  const opts = session ? { new: true, upsert: true, session } : { new: true, upsert: true };
  return Wallet.findOneAndUpdate(
    { user_id: userId },
    { $setOnInsert: { balance: 0, currency: 'Coins' } },
    opts
  );
};

const canAccessWallet = (requester, targetUserId) => {
  // Dashboard requirement: any authenticated user can read wallet history data.
  // Write/update routes remain protected by their own role checks.
  return !!requester;
};

// ─────────────────────────────────────────────────────────────
// Coin calculation for vendor self-recharge
//   Basic / Standard      → amount × 4
//   Premium / Enterprise  → amount × 4 + amount  (= amount × 5)
// ─────────────────────────────────────────────────────────────
const calculateRechargeCoins = (rechargeAmount, packageTier) => {
  const tier = (packageTier || '').toLowerCase();
  if (tier === 'premium' || tier === 'enterprise') {
    return rechargeAmount * 4 + rechargeAmount;
  }
  return rechargeAmount * 4;
};

// ─────────────────────────────────────────────────────────────
// GET /api/wallet/me
// ─────────────────────────────────────────────────────────────

exports.getMyWallet = async (req, res) => {
  try {
    const userId = req.userId;
    const wallet = await getOrCreateWallet(userId);

    const rawTx = await WalletTransaction.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('ad_id', 'caption title thumbnail_url')
      .populate('post_id', '_id type')
      .lean();

    const transactions = rawTx.map((t) => enrichTransaction(t, 'caption'));

    res.json({
      success: true,
      wallet: { balance: wallet.balance, currency: wallet.currency },
      total: transactions.length,
      transactions,
    });
  } catch (err) {
    console.error('[getMyWallet]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/wallet/recharge
// Vendor self-recharge — converts rupee amount to coins based on active package tier
// ─────────────────────────────────────────────────────────────

exports.rechargeWallet = async (req, res) => {
  try {
    const userId = req.userId;
    const { recharge_amount } = req.body;

    const amount = Number(recharge_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'recharge_amount must be a positive number' });
    }

    const user = await User.findById(userId).select('role username email full_name').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role !== 'vendor') {
      return res.status(403).json({ success: false, message: 'Only vendors can recharge their wallet' });
    }

    // Determine coin multiplier from active package tier
    const activePurchase = await VendorPackagePurchase.findOne({ user_id: userId, status: 'active' })
      .populate('package_id', 'tier name')
      .lean();

    const packageTier = activePurchase?.package_id?.tier || null;
    const packageName = activePurchase?.package_id?.name || 'No active package';
    const coinsToCredit = calculateRechargeCoins(amount, packageTier);

    let newBalance;
    await runMongoTransaction({
      work: async (session) => {
        const wallet = await Wallet.findOneAndUpdate(
          { user_id: userId },
          { $inc: { balance: coinsToCredit } },
          { new: true, upsert: true, session }
        );
        newBalance = wallet.balance;
        await WalletTransaction.create([{
          user_id: userId,
          type: 'VENDOR_RECHARGE',
          amount: coinsToCredit,
          status: 'SUCCESS',
          description: `Wallet recharged Rs.${amount} → ${coinsToCredit} coins (${packageName})`,
        }], { session });
      },
      fallback: async () => {
        const wallet = await Wallet.findOneAndUpdate(
          { user_id: userId },
          { $inc: { balance: coinsToCredit } },
          { new: true, upsert: true }
        );
        newBalance = wallet.balance;
        await WalletTransaction.create({
          user_id: userId,
          type: 'VENDOR_RECHARGE',
          amount: coinsToCredit,
          status: 'SUCCESS',
          description: `Wallet recharged Rs.${amount} → ${coinsToCredit} coins (${packageName})`,
        });
      },
    });

    try {
      await sendNotification(req.app, {
        recipient: userId,
        sender: null,
        type: 'coins_credited',
        message: `${coinsToCredit} coins have been added to your wallet`,
        link: '/wallet',
      });
    } catch (notifErr) {
      console.error('[rechargeWallet] notification error:', notifErr.message);
    }

    const isPremiumTier = (packageTier === 'premium' || packageTier === 'enterprise');
    res.json({
      success: true,
      message: 'Wallet recharged successfully',
      recharge: {
        recharge_amount: amount,
        coins_credited: coinsToCredit,
        package_tier: packageTier || 'none',
        package_name: packageName,
        formula: isPremiumTier
          ? `${amount} × 4 + ${amount} = ${coinsToCredit} coins`
          : `${amount} × 4 = ${coinsToCredit} coins`,
      },
      wallet: { user_id: userId, new_balance: newBalance, currency: 'Coins' },
    });
  } catch (err) {
    console.error('[rechargeWallet]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/wallet/recharge/history
// Current vendor's own recharge history
// ─────────────────────────────────────────────────────────────

exports.getMyRechargeHistory = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId).select('role username full_name avatar_url').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role !== 'vendor') {
      return res.status(403).json({ success: false, message: 'Only vendors have recharge history' });
    }

    const { limit = 50, page = 1, startDate, endDate } = req.query;
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 500);
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const skip     = (pageNum - 1) * limitNum;

    const match = {
      user_id: new mongoose.Types.ObjectId(String(userId)),
      type: 'VENDOR_RECHARGE',
    };

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) { const d = new Date(String(startDate)); if (!isNaN(d)) match.createdAt.$gte = d; }
      if (endDate)   { const d = new Date(String(endDate));   if (!isNaN(d)) { d.setHours(23, 59, 59, 999); match.createdAt.$lte = d; } }
    }

    const wallet = await getOrCreateWallet(userId);
    const total  = await WalletTransaction.countDocuments(match);

    const rawTx = await WalletTransaction.find(match)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const [agg] = await WalletTransaction.aggregate([
      { $match: match },
      { $group: { _id: null, total_recharged_coins: { $sum: '$amount' }, total_transactions: { $sum: 1 } } },
    ]);

    const transactions = rawTx.map((t) => ({
      _id:         t._id,
      type:        t.type,
      label:       'Wallet Recharge',
      amount:      t.amount,
      direction:   'credit',
      description: t.description,
      status:      t.status,
      created_at:  t.createdAt || t.transactionDate,
    }));

    res.json({
      success: true,
      user: { _id: user._id, username: user.username, full_name: user.full_name, avatar_url: user.avatar_url },
      wallet: { balance: wallet.balance, currency: wallet.currency },
      summary: {
        total_recharged_coins: agg?.total_recharged_coins ?? 0,
        total_transactions:    agg?.total_transactions    ?? 0,
      },
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
      transactions,
    });
  } catch (err) {
    console.error('[getMyRechargeHistory]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/wallet/recharge/history/:userId   (Admin only)
// Any vendor's recharge history
// ─────────────────────────────────────────────────────────────

exports.getVendorRechargeHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    const user = await User.findById(userId).select('role username full_name avatar_url').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role !== 'vendor') {
      return res.status(400).json({ success: false, message: 'User is not a vendor' });
    }

    const { limit = 50, page = 1, startDate, endDate } = req.query;
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 500);
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const skip     = (pageNum - 1) * limitNum;

    const match = {
      user_id: new mongoose.Types.ObjectId(userId),
      type: 'VENDOR_RECHARGE',
    };

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) { const d = new Date(String(startDate)); if (!isNaN(d)) match.createdAt.$gte = d; }
      if (endDate)   { const d = new Date(String(endDate));   if (!isNaN(d)) { d.setHours(23, 59, 59, 999); match.createdAt.$lte = d; } }
    }

    const wallet = await getOrCreateWallet(userId);
    const total  = await WalletTransaction.countDocuments(match);

    const rawTx = await WalletTransaction.find(match)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const [agg] = await WalletTransaction.aggregate([
      { $match: match },
      { $group: { _id: null, total_recharged_coins: { $sum: '$amount' }, total_transactions: { $sum: 1 } } },
    ]);

    const transactions = rawTx.map((t) => ({
      _id:         t._id,
      type:        t.type,
      label:       'Wallet Recharge',
      amount:      t.amount,
      direction:   'credit',
      description: t.description,
      status:      t.status,
      created_at:  t.createdAt || t.transactionDate,
    }));

    res.json({
      success: true,
      user: { _id: user._id, username: user.username, full_name: user.full_name, avatar_url: user.avatar_url, role: user.role },
      wallet: { balance: wallet.balance, currency: wallet.currency },
      summary: {
        total_recharged_coins: agg?.total_recharged_coins ?? 0,
        total_transactions:    agg?.total_transactions    ?? 0,
      },
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
      transactions,
    });
  } catch (err) {
    console.error('[getVendorRechargeHistory]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/wallet/member/:userId/history
// ─────────────────────────────────────────────────────────────

exports.getMemberWalletHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }
    if (!canAccessWallet(req.user, userId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const user = await User.findById(userId).select('role username full_name avatar_url').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role !== 'member') {
      return res.status(400).json({ success: false, message: 'User is not a member' });
    }

    const { startDate, endDate, type, limit = 100, page = 1 } = req.query;
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const skip     = (pageNum - 1) * limitNum;

    const match = {
      user_id: new mongoose.Types.ObjectId(userId),
      type: { $in: Array.from(MEMBER_WALLET_TYPES) },
    };

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) { const d = new Date(String(startDate)); if (!isNaN(d)) match.createdAt.$gte = d; }
      if (endDate)   { const d = new Date(String(endDate));   if (!isNaN(d)) { d.setHours(23, 59, 59, 999); match.createdAt.$lte = d; } }
    }

    if (type) {
      const requestedTypes = String(type).split(',').map((s) => s.trim()).filter(Boolean);
      const allowed = requestedTypes.filter((t) => MEMBER_WALLET_TYPES.has(t));
      if (allowed.length) match.type = { $in: allowed };
    }

    const wallet = await getOrCreateWallet(userId);
    const total  = await WalletTransaction.countDocuments(match);

    const rawTx = await WalletTransaction.find(match)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('ad_id', 'caption title thumbnail_url')
      .lean();

    const transactions = rawTx.map((t) => enrichTransaction(t, 'caption'));

    const [agg] = await WalletTransaction.aggregate([
      { $match: { user_id: new mongoose.Types.ObjectId(userId), type: { $in: Array.from(MEMBER_WALLET_TYPES) } } },
      { $group: { _id: null, total_earned: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } }, total_deducted: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } }, total_tx: { $sum: 1 }, by_type: { $push: { type: '$type', amount: '$amount' } } } },
    ]);

    const earningsByType = {};
    (agg?.by_type || []).forEach(({ type: txType, amount }) => {
      if (!earningsByType[txType]) earningsByType[txType] = { count: 0, total: 0 };
      earningsByType[txType].count += 1;
      earningsByType[txType].total += Math.abs(Number(amount));
    });

    res.json({
      success: true,
      user: { _id: user._id, username: user.username, full_name: user.full_name, avatar_url: user.avatar_url, role: user.role },
      wallet: { balance: wallet.balance, currency: wallet.currency },
      summary: { total_earned: agg?.total_earned ?? 0, total_deducted: agg?.total_deducted ?? 0, total_transactions: agg?.total_tx ?? 0, earnings_by_type: earningsByType },
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
      transactions,
    });
  } catch (err) {
    console.error('[getMemberWalletHistory]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/wallet/vendor/:userId/history
// Includes VENDOR_RECHARGE transactions + recharge summary section
// ─────────────────────────────────────────────────────────────

exports.getVendorWalletHistory = async (req, res) => {
  try {
    const { userId: rawUserId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(rawUserId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    // Accept either a vendor user id or a vendor profile id.
    let userId = rawUserId;
    let user = await User.findById(userId).select('role username full_name avatar_url').lean();
    if (!user || user.role !== 'vendor') {
      const vendor = await Vendor.findById(rawUserId).select('user_id').lean();
      if (vendor?.user_id && mongoose.Types.ObjectId.isValid(String(vendor.user_id))) {
        userId = String(vendor.user_id);
        user = await User.findById(userId).select('role username full_name avatar_url').lean();
      }
    }

    if (!canAccessWallet(req.user, userId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role !== 'vendor') {
      return res.status(400).json({ success: false, message: 'User is not a vendor' });
    }

    const { startDate, endDate, type, limit = 100, page = 1 } = req.query;
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const skip     = (pageNum - 1) * limitNum;

    // VENDOR_WALLET_TYPES already includes VENDOR_RECHARGE
    const match = {
      user_id: new mongoose.Types.ObjectId(userId),
      type: { $in: Array.from(VENDOR_WALLET_TYPES) },
    };

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) { const d = new Date(String(startDate)); if (!isNaN(d)) match.createdAt.$gte = d; }
      if (endDate)   { const d = new Date(String(endDate));   if (!isNaN(d)) { d.setHours(23, 59, 59, 999); match.createdAt.$lte = d; } }
    }

    if (type) {
      const requestedTypes = String(type).split(',').map((s) => s.trim()).filter(Boolean);
      const allowed = requestedTypes.filter((t) => VENDOR_WALLET_TYPES.has(t));
      if (allowed.length) match.type = { $in: allowed };
    }

    const wallet = await getOrCreateWallet(userId);
    const total  = await WalletTransaction.countDocuments(match);

    const rawTx = await WalletTransaction.find(match)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('ad_id', 'caption title thumbnail_url status')
      .lean();

    const transactions = rawTx.map((t) => enrichTransaction(t, 'caption'));

    const [agg] = await WalletTransaction.aggregate([
      { $match: { user_id: new mongoose.Types.ObjectId(userId), type: { $in: Array.from(VENDOR_WALLET_TYPES) } } },
      { $group: { _id: null, total_credited: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } }, total_debited: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } }, total_tx: { $sum: 1 } } },
    ]);

    const [adAgg] = await WalletTransaction.aggregate([
      { $match: { user_id: new mongoose.Types.ObjectId(userId), type: 'AD_BUDGET_DEDUCTION' } },
      { $group: { _id: null, count: { $sum: 1 }, total_budget_allocated: { $sum: { $abs: '$amount' } } } },
    ]);

    // Recharge-specific summary
    const [rechargeAgg] = await WalletTransaction.aggregate([
      { $match: { user_id: new mongoose.Types.ObjectId(userId), type: 'VENDOR_RECHARGE' } },
      { $group: { _id: null, total_recharge_count: { $sum: 1 }, total_recharged_coins: { $sum: '$amount' }, last_recharge_at: { $max: '$createdAt' } } },
    ]);

    res.json({
      success: true,
      user: { _id: user._id, username: user.username, full_name: user.full_name, avatar_url: user.avatar_url, role: user.role },
      wallet: { balance: wallet.balance, currency: wallet.currency },
      summary: {
        total_credited:            agg?.total_credited           ?? 0,
        total_debited:             agg?.total_debited            ?? 0,
        total_transactions:        agg?.total_tx                 ?? 0,
        total_ads_created:         adAgg?.count                  ?? 0,
        total_ad_budget_allocated: adAgg?.total_budget_allocated ?? 0,
        recharge: {
          total_recharge_count:  rechargeAgg?.total_recharge_count  ?? 0,
          total_recharged_coins: rechargeAgg?.total_recharged_coins ?? 0,
          last_recharge_at:      rechargeAgg?.last_recharge_at      ?? null,
        },
      },
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
      transactions,
    });
  } catch (err) {
    console.error('[getVendorWalletHistory]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/wallet/ads/:adId/history
// ─────────────────────────────────────────────────────────────

exports.getAdWalletHistory = async (req, res) => {
  try {
    const { adId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ success: false, message: 'Invalid adId' });
    }

    const ad = await Ad.findById(adId)
      .select('user_id vendor_id caption total_budget_coins total_coins_spent status')
      .lean();
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });

    const requester = req.user;
    if (!requester) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { startDate, endDate, type, userId, limit = 50, page = 1 } = req.query;
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const skip     = (pageNum - 1) * limitNum;

    const adObjectId = new mongoose.Types.ObjectId(adId);
    const match = { ad_id: adObjectId };

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) { const d = new Date(String(startDate)); if (isNaN(d.getTime())) return res.status(400).json({ success: false, message: 'Invalid startDate' }); match.createdAt.$gte = d; }
      if (endDate)   { const d = new Date(String(endDate));   if (isNaN(d.getTime())) return res.status(400).json({ success: false, message: 'Invalid endDate' });   d.setHours(23, 59, 59, 999); match.createdAt.$lte = d; }
    }
    if (type) { const types = String(type).split(',').map((s) => s.trim()).filter(Boolean); if (types.length) match.type = { $in: types }; }
    if (userId) { if (!mongoose.Types.ObjectId.isValid(String(userId))) return res.status(400).json({ success: false, message: 'Invalid userId' }); match.user_id = new mongoose.Types.ObjectId(String(userId)); }

    const total = await WalletTransaction.countDocuments(match);

    const rawTx = await WalletTransaction.find(match)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('user_id', 'username full_name avatar_url role')
      .populate('ad_id', 'caption title')
      .lean();

    let totalBudget = Number(ad.total_budget_coins ?? 0) || 0;
    if (!totalBudget) {
      const budgetTx = await WalletTransaction.findOne({ ad_id: adObjectId, type: 'AD_BUDGET_DEDUCTION' }).select('amount').lean();
      totalBudget = budgetTx ? Math.abs(Number(budgetTx.amount ?? 0)) : 0;
    }

    const AD_REFUND_TYPES = ['AD_LIKE_BUDGET_REFUND'];
    const [deductionsAgg] = await WalletTransaction.aggregate([{ $match: { ad_id: adObjectId, type: { $in: AD_DEDUCTION_TYPES } } }, { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }]);
    const [refundsAgg]    = await WalletTransaction.aggregate([{ $match: { ad_id: adObjectId, type: { $in: AD_REFUND_TYPES } } },  { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }]);
    const totalSpent = Math.max(0, (deductionsAgg?.total ?? 0) - (refundsAgg?.total ?? 0));

    const actionTypes = ['AD_VIEW_DEDUCTION', 'AD_LIKE_DEDUCTION', 'AD_COMMENT_DEDUCTION', 'AD_REPLY_DEDUCTION', 'AD_SAVE_DEDUCTION', 'AD_LIKE_BUDGET_REFUND'];
    const actionRows  = await WalletTransaction.aggregate([{ $match: { ad_id: adObjectId, type: { $in: actionTypes } } }, { $group: { _id: '$type', count: { $sum: 1 }, total_coins: { $sum: { $abs: '$amount' } } } }]);
    const actionMap = {};
    actionRows.forEach((r) => { actionMap[r._id] = { count: r.count, total_coins: r.total_coins }; });

    const [uniqueUsersAgg] = await WalletTransaction.aggregate([{ $match: { ad_id: adObjectId } }, { $group: { _id: '$user_id' } }, { $count: 'count' }]);

    res.json({
      success: true,
      ad: { _id: adId, caption: ad.caption, status: ad.status },
      budget: { total_budget_coins: totalBudget, total_coins_spent: totalSpent, balance_remaining: Math.max(0, totalBudget - totalSpent), spent_percentage: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0 },
      actions: {
        views:    actionMap['AD_VIEW_DEDUCTION']     || { count: 0, total_coins: 0 },
        likes:    actionMap['AD_LIKE_DEDUCTION']     || { count: 0, total_coins: 0 },
        comments: actionMap['AD_COMMENT_DEDUCTION']  || { count: 0, total_coins: 0 },
        replies:  actionMap['AD_REPLY_DEDUCTION']    || { count: 0, total_coins: 0 },
        saves:    actionMap['AD_SAVE_DEDUCTION']     || { count: 0, total_coins: 0 },
        refunds:  actionMap['AD_LIKE_BUDGET_REFUND'] || { count: 0, total_coins: 0 },
      },
      unique_users: uniqueUsersAgg?.count ?? 0,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
      transactions: rawTx.map((t) => enrichTransaction(t, 'caption')),
    });
  } catch (err) {
    console.error('[getAdWalletHistory]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/wallet/vendor/:userId/recharge  (Admin only)
// ─────────────────────────────────────────────────────────────

exports.rechargeVendorWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, description } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    const coins = Number(amount);
    if (!Number.isFinite(coins) || coins <= 0) {
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });
    }

    const user = await User.findById(userId).select('role username').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role !== 'vendor') {
      return res.status(400).json({ success: false, message: 'User is not a vendor' });
    }

    let newBalance;
    await runMongoTransaction({
      work: async (session) => {
        const wallet = await Wallet.findOneAndUpdate(
          { user_id: userId },
          { $inc: { balance: coins } },
          { new: true, upsert: true, session }
        );
        newBalance = wallet.balance;
        await WalletTransaction.create([{ user_id: userId, type: 'VENDOR_RECHARGE', amount: coins, status: 'SUCCESS', description: description || `Wallet recharged with ${coins} coins` }], { session });
      },
      fallback: async () => {
        const wallet = await Wallet.findOneAndUpdate({ user_id: userId }, { $inc: { balance: coins } }, { new: true, upsert: true });
        newBalance = wallet.balance;
        await WalletTransaction.create({ user_id: userId, type: 'VENDOR_RECHARGE', amount: coins, status: 'SUCCESS', description: description || `Wallet recharged with ${coins} coins` });
      },
    });

    try {
      await sendNotification(req.app, { recipient: userId, sender: null, type: 'coins_credited', message: `${coins} coins have been added to your wallet`, link: '/wallet' });
    } catch (notifErr) {
      console.error('[rechargeVendorWallet] Notification error:', notifErr);
    }

    res.json({
      success: true,
      message: `${coins} coins successfully added to vendor wallet`,
      wallet: { user_id: userId, new_balance: newBalance, currency: 'Coins' },
      transaction: { type: 'VENDOR_RECHARGE', amount: coins, direction: 'credit', description: description || `Wallet recharged with ${coins} coins` },
    });
  } catch (err) {
    console.error('[rechargeVendorWallet]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/wallet/admin/adjust  (Admin only)
// ─────────────────────────────────────────────────────────────

exports.updateWalletBalance = async (req, res) => {
  try {
    const { userId, amount, type, description } = req.body;

    if (!userId || amount === undefined || !type) {
      return res.status(400).json({ success: false, message: 'userId, amount, and type are required' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    const coins = Number(amount);
    if (!Number.isFinite(coins) || coins === 0) {
      return res.status(400).json({ success: false, message: 'amount must be a non-zero number' });
    }

    const wallet = await Wallet.findOneAndUpdate({ user_id: userId }, { $inc: { balance: coins } }, { new: true, upsert: true });
    await WalletTransaction.create({ user_id: userId, type: type || 'ADMIN_ADJUSTMENT', amount: coins, status: 'SUCCESS', description: description || 'Admin adjustment' });

    try {
      await sendNotification(req.app, { recipient: userId, sender: null, type: coins > 0 ? 'coins_credited' : 'coins_debited', message: coins > 0 ? `${coins} coins have been added to your wallet` : `${Math.abs(coins)} coins have been deducted from your wallet`, link: '/wallet' });
    } catch (notifErr) {
      console.error('[updateWalletBalance] Notification error:', notifErr);
    }

    if (coins < 0 && wallet.balance <= LOW_COIN_THRESHOLD) {
      const user = await User.findById(userId).select('email full_name username role').lean();
      if (user?.email && user.role === 'vendor') {
        fireAndForget('Coins low email', sendCoinsLowEmail({ email: user.email, full_name: user.full_name || user.username, current_balance: wallet.balance, threshold: LOW_COIN_THRESHOLD }));
      }
    }

    res.json({ success: true, message: 'Wallet updated successfully', wallet: { user_id: userId, new_balance: wallet.balance, currency: wallet.currency } });
  } catch (err) {
    console.error('[updateWalletBalance]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/wallet  (Admin only)
// ─────────────────────────────────────────────────────────────

exports.getAllWallets = async (req, res) => {
  try {
    const { page = 1, limit = 50, type, role, userId, startDate, endDate, direction } = req.query;
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const skip     = (pageNum - 1) * limitNum;
    const txMatch  = {};

    if (type) { const types = String(type).split(',').map((s) => s.trim()).filter(Boolean); if (types.length) txMatch.type = { $in: types }; }
    if (userId && mongoose.Types.ObjectId.isValid(String(userId))) txMatch.user_id = new mongoose.Types.ObjectId(String(userId));
    if (startDate || endDate) {
      txMatch.createdAt = {};
      if (startDate) { const d = new Date(String(startDate)); if (!isNaN(d)) txMatch.createdAt.$gte = d; }
      if (endDate)   { const d = new Date(String(endDate));   if (!isNaN(d)) { d.setHours(23, 59, 59, 999); txMatch.createdAt.$lte = d; } }
    }
    if (direction === 'credit') txMatch.amount = { $gt: 0 };
    else if (direction === 'debit') txMatch.amount = { $lt: 0 };
    if (role && role !== 'all') { const roleUsers = await User.find({ role: String(role) }).select('_id').lean(); txMatch.user_id = { $in: roleUsers.map((u) => u._id) }; }

    const total = await WalletTransaction.countDocuments(txMatch);
    const rawTx = await WalletTransaction.find(txMatch).sort({ createdAt: -1 }).skip(skip).limit(limitNum).populate('user_id', 'username full_name avatar_url role').populate('ad_id', 'caption title').lean();

    const [rewardSummary]  = await WalletTransaction.aggregate([{ $match: { status: 'SUCCESS', type: { $in: ['AD_REWARD', 'REEL_VIEW_REWARD', 'AD_VIEW_REWARD', 'AD_LIKE_REWARD', 'AD_COMMENT_REWARD', 'AD_REPLY_REWARD', 'AD_SAVE_REWARD', 'VENDOR_PROFILE_VIEW_REWARD'] } } }, { $group: { _id: null, total_coins_minted: { $sum: '$amount' }, total_transactions: { $sum: 1 } } }]);
    const [adSpendSummary] = await WalletTransaction.aggregate([{ $match: { status: 'SUCCESS', type: { $in: AD_DEDUCTION_TYPES } } }, { $group: { _id: null, total_ad_spend: { $sum: { $abs: '$amount' } } } }]);
    const [reelSummary]    = await WalletTransaction.aggregate([{ $match: { status: 'SUCCESS', type: 'REEL_VIEW_REWARD' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const [rechargeSummary]= await WalletTransaction.aggregate([{ $match: { status: 'SUCCESS', type: { $in: ['VENDOR_RECHARGE', 'VENDOR_REGISTRATION_CREDIT'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);

    const walletList = await Wallet.find({}).populate({ path: 'user_id', select: 'username full_name avatar_url role is_active email' }).sort({ balance: -1 }).lean();
    const walletUserIds = walletList.map((w) => w.user_id?._id).filter(Boolean);
    const txStats = await WalletTransaction.aggregate([{ $match: { user_id: { $in: walletUserIds } } }, { $group: { _id: '$user_id', tx_count: { $sum: 1 }, last_tx_at: { $max: '$createdAt' }, total_credited: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } }, total_debited: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } } } }]);
    const txStatsMap = {};
    txStats.forEach((s) => { txStatsMap[String(s._id)] = s; });

    const enrichedWallets = walletList
      .filter((w) => w.user_id)
      .filter((w) => !role || role === 'all' || w.user_id.role === role)
      .map((w) => {
        const stats = txStatsMap[String(w.user_id._id)] || {};
        return { wallet_id: w._id, user: { _id: w.user_id._id, username: w.user_id.username, full_name: w.user_id.full_name, avatar_url: w.user_id.avatar_url, role: w.user_id.role, is_active: w.user_id.is_active, email: w.user_id.email }, balance: w.balance, currency: w.currency, tx_count: stats.tx_count ?? 0, total_credited: stats.total_credited ?? 0, total_debited: stats.total_debited ?? 0, last_tx_at: stats.last_tx_at ?? null };
      });

    res.json({
      success: true,
      summary: { total_transactions: total, total_coins_minted: rewardSummary?.total_coins_minted ?? 0, total_coins_from_ads: (rewardSummary?.total_coins_minted ?? 0) - (reelSummary?.total ?? 0), total_coins_from_reels: reelSummary?.total ?? 0, total_ad_coins_spent: adSpendSummary?.total_ad_spend ?? 0, total_vendor_coins_recharged: rechargeSummary?.total ?? 0, total_wallets: enrichedWallets.length, member_wallets: enrichedWallets.filter((w) => w.user.role === 'member').length, vendor_wallets: enrichedWallets.filter((w) => w.user.role === 'vendor').length },
      wallets: enrichedWallets,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
      transactions: rawTx.map((t) => enrichTransaction(t, 'caption')),
    });
  } catch (err) {
    console.error('[getAllWallets]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
