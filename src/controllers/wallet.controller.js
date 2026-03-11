'use strict';

const mongoose = require('mongoose');
const Ad = require('../models/Ad');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const sendNotification = require('../utils/sendNotification');
const runMongoTransaction = require('../utils/runMongoTransaction');

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** Transaction types that represent money going OUT of a wallet (debit) */
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

/** Transaction types that belong to the Vendor's own wallet activity */
const VENDOR_WALLET_TYPES = new Set([
  'VENDOR_REGISTRATION_CREDIT',
  'VENDOR_RECHARGE',
  'AD_BUDGET_DEDUCTION',
  'AD_LIKE_BUDGET_REFUND',
  'VENDOR_PROFILE_VIEW_DEDUCTION',
  'ADMIN_ADJUSTMENT',
]);

/** Transaction types that belong to the Member's own wallet activity */
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

/** Deduction types that reduce ad budget (used for budget math) */
const AD_DEDUCTION_TYPES = [
  'AD_VIEW_DEDUCTION',
  'AD_LIKE_DEDUCTION',
  'AD_COMMENT_DEDUCTION',
  'AD_REPLY_DEDUCTION',
  'AD_SAVE_DEDUCTION',
];

const TRANSACTION_LABELS = {
  VENDOR_REGISTRATION_CREDIT:  'Registration Credit',
  VENDOR_RECHARGE:             'Wallet Recharge',
  ADMIN_ADJUSTMENT:            'Admin Adjustment',
  REEL_VIEW_REWARD:            'Reel View Reward',
  AD_REWARD:                   'Ad Reward',
  AD_VIEW_REWARD:              'Ad View Reward',
  AD_VIEW_DEDUCTION:           'Ad View Deduction',
  AD_LIKE_REWARD:              'Ad Like Reward',
  AD_LIKE_DEDUCTION:           'Ad Like Deduction',
  AD_LIKE_REWARD_REVERSAL:     'Like Reversed (Deducted)',
  AD_LIKE_BUDGET_REFUND:       'Like Reversed (Refund)',
  AD_COMMENT_REWARD:           'Ad Comment Reward',
  AD_COMMENT_DEDUCTION:        'Ad Comment Deduction',
  AD_REPLY_REWARD:             'Ad Reply Reward',
  AD_REPLY_DEDUCTION:          'Ad Reply Deduction',
  AD_SAVE_REWARD:              'Ad Save Reward',
  AD_SAVE_DEDUCTION:           'Ad Save Deduction',
  AD_BUDGET_DEDUCTION:         'Ad Budget Allocated',
  VENDOR_PROFILE_VIEW_REWARD:  'Vendor Profile View Reward',
  VENDOR_PROFILE_VIEW_DEDUCTION: 'Vendor Profile View Deduction',
  LIKE:                        'Like',
  COMMENT:                     'Comment',
  REPLY:                       'Reply',
  SAVE:                        'Save',
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Enrich a raw transaction document with a clean `ui` block and corrected
 * signed amount (debit types always negative).
 */
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

/** Upsert a wallet, returning the existing or newly created doc. */
const getOrCreateWallet = async (userId, session) => {
  const opts = session ? { new: true, upsert: true, session } : { new: true, upsert: true };
  return Wallet.findOneAndUpdate(
    { user_id: userId },
    { $setOnInsert: { balance: 0, currency: 'Coins' } },
    opts
  );
};

const canAccessWallet = (requester, targetUserId) => {
  if (!requester) return false;
  if (requester.role === 'admin') return true;
  return String(requester._id) === String(targetUserId);
};

// ─────────────────────────────────────────────────────────────
// Controllers
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/wallet/me
 * Returns the authenticated user's own wallet balance + recent transactions.
 */
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
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency,
      },
      total: transactions.length,
      transactions,
    });
  } catch (err) {
    console.error('[getMyWallet]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/wallet/vendor/:userId/history
 * Shows ONLY vendor-side wallet transactions:
 *   - VENDOR_REGISTRATION_CREDIT (initial credits on signup)
 *   - VENDOR_RECHARGE (admin/manual top-ups)
 *   - AD_BUDGET_DEDUCTION (coins spent when creating an ad)
 *   - AD_LIKE_BUDGET_REFUND (coins refunded when a user un-likes)
 *   - ADMIN_ADJUSTMENT
 */
exports.getVendorWalletHistory = async (req, res) => {
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
    if (user.role !== 'vendor') {
      return res.status(400).json({ success: false, message: 'User is not a vendor' });
    }

    const wallet = await getOrCreateWallet(userId);

    // Vendor wallet transactions are stored with user_id = vendor's user_id
    const rawTx = await WalletTransaction.find({
      user_id: userId,
      type: { $in: Array.from(VENDOR_WALLET_TYPES) },
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('ad_id', 'caption title thumbnail_url status')
      .lean();

    const transactions = rawTx.map((t) => enrichTransaction(t, 'caption'));

    // Summary stats
    const totalCredited = transactions
      .filter((t) => t.direction === 'credit')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalDebited = transactions
      .filter((t) => t.direction === 'debit')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    res.json({
      success: true,
      user: {
        _id: user._id,
        username: user.username,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        role: user.role,
      },
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency,
      },
      summary: {
        total_credited: totalCredited,
        total_debited: totalDebited,
        total_transactions: transactions.length,
      },
      transactions,
    });
  } catch (err) {
    console.error('[getVendorWalletHistory]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/wallet/member/:userId/history
 * Shows ONLY member-side wallet transactions — rewards earned from engaging with ads.
 */
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

    const wallet = await getOrCreateWallet(userId);

    const rawTx = await WalletTransaction.find({
      user_id: userId,
      type: { $in: Array.from(MEMBER_WALLET_TYPES) },
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('ad_id', 'caption title thumbnail_url')
      .lean();

    const transactions = rawTx.map((t) => enrichTransaction(t, 'caption'));

    const totalEarned = transactions
      .filter((t) => t.direction === 'credit')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalDeducted = transactions
      .filter((t) => t.direction === 'debit')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    res.json({
      success: true,
      user: {
        _id: user._id,
        username: user.username,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        role: user.role,
      },
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency,
      },
      summary: {
        total_earned: totalEarned,
        total_deducted: totalDeducted,
        total_transactions: transactions.length,
      },
      transactions,
    });
  } catch (err) {
    console.error('[getMemberWalletHistory]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/wallet/ads/:adId/history
 * Shows all coin flows for a specific ad (rewards paid to users + deductions from ad budget).
 * Accessible by the vendor who owns the ad, or an admin.
 *
 * Query params:
 *   startDate  – ISO date (filter from)
 *   endDate    – ISO date (filter until)
 *   type       – comma-separated transaction types
 *   userId     – filter by user
 *   limit      – max results (default 50, max 200)
 */
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
    const isAdmin = requester?.role === 'admin';
    const isOwner = requester?.role === 'vendor' && String(requester._id) === String(ad.user_id);
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { startDate, endDate, type, userId, limit = 50 } = req.query;
    const adObjectId = new mongoose.Types.ObjectId(adId);
    const match = { ad_id: adObjectId };

    // Date filters
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) {
        const d = new Date(String(startDate));
        if (isNaN(d.getTime())) return res.status(400).json({ success: false, message: 'Invalid startDate' });
        match.createdAt.$gte = d;
      }
      if (endDate) {
        const d = new Date(String(endDate));
        if (isNaN(d.getTime())) return res.status(400).json({ success: false, message: 'Invalid endDate' });
        match.createdAt.$lte = d;
      }
    }

    // Type filter
    if (type) {
      const types = String(type).split(',').map((s) => s.trim()).filter(Boolean);
      if (types.length) match.type = { $in: types };
    }

    // User filter
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(String(userId))) {
        return res.status(400).json({ success: false, message: 'Invalid userId' });
      }
      match.user_id = new mongoose.Types.ObjectId(String(userId));
    }

    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);

    const rawTx = await WalletTransaction.find(match)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .populate('user_id', 'username full_name avatar_url role')
      .populate('ad_id', 'caption title')
      .lean();

    // Budget figures — prefer Ad document fields, fall back to aggregation for legacy ads
    let totalBudget = Number(ad.total_budget_coins ?? 0) || 0;
    let totalSpent = 0;

    if (!totalBudget) {
      const budgetTx = await WalletTransaction.findOne({
        ad_id: adObjectId,
        type: 'AD_BUDGET_DEDUCTION',
      }).select('amount').lean();
      totalBudget = budgetTx ? Math.abs(Number(budgetTx.amount ?? 0)) : 0;
    }

    const AD_REFUND_TYPES = ['AD_LIKE_BUDGET_REFUND'];

    const [deductionsAgg] = await WalletTransaction.aggregate([
      { $match: { ad_id: adObjectId, type: { $in: AD_DEDUCTION_TYPES } } },
      { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
    ]);
    const [refundsAgg] = await WalletTransaction.aggregate([
      { $match: { ad_id: adObjectId, type: { $in: AD_REFUND_TYPES } } },
      { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
    ]);

    const totalDeductions = deductionsAgg?.total ?? 0;
    const totalRefunds = refundsAgg?.total ?? 0;
    totalSpent = Math.max(0, totalDeductions - totalRefunds);

    const actionTypes = ['AD_VIEW_DEDUCTION', 'AD_LIKE_DEDUCTION', 'AD_LIKE_BUDGET_REFUND'];
    const actionRows = await WalletTransaction.aggregate([
      { $match: { ad_id: adObjectId, type: { $in: actionTypes } } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          total_coins: { $sum: { $abs: '$amount' } },
        },
      },
    ]);
    const actionMap = {};
    actionRows.forEach((r) => { actionMap[r._id] = { count: r.count, total_coins: r.total_coins }; });

    const transactions = rawTx.map((t) => enrichTransaction(t, 'caption'));

    res.json({
      success: true,
      ad: {
        _id: adId,
        caption: ad.caption,
        status: ad.status,
      },
      budget: {
        total_budget_coins: totalBudget,
        total_coins_spent: totalSpent,
        balance_remaining: Math.max(0, totalBudget - totalSpent),
        spent_percentage: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
      },
      actions: {
        views: actionMap['AD_VIEW_DEDUCTION'] || { count: 0, total_coins: 0 },
        likes: actionMap['AD_LIKE_DEDUCTION'] || { count: 0, total_coins: 0 },
        dislikes: actionMap['AD_LIKE_BUDGET_REFUND'] || { count: 0, total_coins: 0 },
      },
      total: transactions.length,
      transactions,
    });
  } catch (err) {
    console.error('[getAdWalletHistory]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * POST /api/wallet/vendor/:userId/recharge
 * Admin-only: Add coins to a vendor's wallet.
 *
 * Body: { amount: number, description?: string }
 */
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

        await WalletTransaction.create([{
          user_id: userId,
          type: 'VENDOR_RECHARGE',
          amount: coins,
          status: 'SUCCESS',
          description: description || `Wallet recharged with ${coins} coins`,
        }], { session });
      },
      fallback: async () => {
        const wallet = await Wallet.findOneAndUpdate(
          { user_id: userId },
          { $inc: { balance: coins } },
          { new: true, upsert: true }
        );
        newBalance = wallet.balance;

        await WalletTransaction.create({
          user_id: userId,
          type: 'VENDOR_RECHARGE',
          amount: coins,
          status: 'SUCCESS',
          description: description || `Wallet recharged with ${coins} coins`,
        });
      },
    });

    try {
      await sendNotification(req.app, {
        recipient: userId,
        sender: null,
        type: 'coins_credited',
        message: `${coins} coins have been added to your wallet`,
        link: '/wallet',
      });
    } catch (notifErr) {
      console.error('[rechargeVendorWallet] Notification error:', notifErr);
    }

    res.json({
      success: true,
      message: `${coins} coins successfully added to vendor wallet`,
      wallet: {
        user_id: userId,
        new_balance: newBalance,
        currency: 'Coins',
      },
      transaction: {
        type: 'VENDOR_RECHARGE',
        amount: coins,
        direction: 'credit',
        description: description || `Wallet recharged with ${coins} coins`,
      },
    });
  } catch (err) {
    console.error('[rechargeVendorWallet]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * POST /api/wallet/vendor/:vendorUserId/admin-adjust
 * Admin-only: Generic credit or debit adjustment on any user's wallet.
 *
 * Body: { amount: number, description?: string }
 *   Positive amount → credit, Negative amount → debit
 */
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

    const wallet = await Wallet.findOneAndUpdate(
      { user_id: userId },
      { $inc: { balance: coins } },
      { new: true, upsert: true }
    );

    await WalletTransaction.create({
      user_id: userId,
      type: type || 'ADMIN_ADJUSTMENT',
      amount: coins,
      status: 'SUCCESS',
      description: description || 'Admin adjustment',
    });

    try {
      if (coins > 0) {
        await sendNotification(req.app, {
          recipient: userId,
          sender: null,
          type: 'coins_credited',
          message: `${coins} coins have been added to your wallet`,
          link: '/wallet',
        });
      } else {
        await sendNotification(req.app, {
          recipient: userId,
          sender: null,
          type: 'coins_debited',
          message: `${Math.abs(coins)} coins have been deducted from your wallet`,
          link: '/wallet',
        });
      }
    } catch (notifErr) {
      console.error('[updateWalletBalance] Notification error:', notifErr);
    }

    res.json({
      success: true,
      message: 'Wallet updated successfully',
      wallet: {
        user_id: userId,
        new_balance: wallet.balance,
        currency: wallet.currency,
      },
    });
  } catch (err) {
    console.error('[updateWalletBalance]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/wallet (Admin only)
 * Returns all wallet transactions across all users + high-level summary.
 */
exports.getAllWallets = async (req, res) => {
  try {
    const transactions = await WalletTransaction.find({})
      .populate('user_id', 'username full_name avatar_url role')
      .populate('ad_id', 'caption title')
      .sort({ createdAt: -1 })
      .lean();

    const [summary] = await WalletTransaction.aggregate([
      {
        $match: {
          status: 'SUCCESS',
          type: {
            $in: [
              'AD_REWARD', 'REEL_VIEW_REWARD',
              'AD_VIEW_REWARD', 'AD_LIKE_REWARD',
              'AD_COMMENT_REWARD', 'AD_REPLY_REWARD',
              'AD_SAVE_REWARD', 'VENDOR_PROFILE_VIEW_REWARD',
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          total_coins_rewarded_to_members: { $sum: '$amount' },
          total_transactions: { $sum: 1 },
        },
      },
    ]);

    const [spendSummary] = await WalletTransaction.aggregate([
      {
        $match: { status: 'SUCCESS', type: { $in: AD_DEDUCTION_TYPES } },
      },
      { $group: { _id: null, total_ad_spend: { $sum: { $abs: '$amount' } } } },
    ]);

    res.json({
      success: true,
      summary: {
        total_transactions: transactions.length,
        total_coins_rewarded_to_members: summary?.total_coins_rewarded_to_members ?? 0,
        total_ad_coins_spent: spendSummary?.total_ad_spend ?? 0,
      },
      transactions: transactions.map((t) => enrichTransaction(t, 'caption')),
    });
  } catch (err) {
    console.error('[getAllWallets]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
