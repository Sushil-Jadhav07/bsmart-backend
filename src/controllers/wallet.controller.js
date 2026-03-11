const mongoose = require('mongoose');
const Ad = require('../models/Ad');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const sendNotification = require('../utils/sendNotification');

const DEBIT_TYPES = new Set([
  'AD_VIEW_DEDUCTION',
  'AD_LIKE_DEDUCTION',
  'AD_COMMENT_DEDUCTION',
  'AD_REPLY_DEDUCTION',
  'AD_SAVE_DEDUCTION',
  'AD_BUDGET_DEDUCTION'
]);

/**
 * Get my wallet balance and recent transactions
 * @route GET /api/wallet/me
 * @access Private
 */
exports.getMyWallet = async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get or create wallet
    let wallet = await Wallet.findOne({ user_id: userId });
    if (!wallet) {
      wallet = await Wallet.findOneAndUpdate(
        { user_id: userId },
        { $setOnInsert: { balance: 0, currency: 'Coins' } },
        { new: true, upsert: true }
      );
    }

    // Get recent transactions
    const transactions = await WalletTransaction.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('ad_id', 'title thumbnail_url')
      .populate('post_id', '_id type');

    res.json({
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency
      },
      transactions
    });
  } catch (error) {
    console.error('Get my wallet error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get all wallets and transactions (Admin)
 * @route GET /api/wallet
 * @access Private (Admin)
 */
exports.getAllWallets = async (req, res) => {
  try {
    // Fetch ALL transactions without pagination or filters
    const transactions = await WalletTransaction.find({})
      .populate('user_id', 'username full_name avatar_url gender location')
      .populate('ad_id', 'title')
      .populate('post_id', 'type')
      .sort({ createdAt: -1 });

    const total = transactions.length;

    // Aggregate global summary
    const [summary] = await WalletTransaction.aggregate([
      {
        $match: {
          status: 'SUCCESS',
          type: { $in: ['AD_REWARD', 'REEL_VIEW_REWARD', 'AD_VIEW_REWARD', 'AD_LIKE_REWARD', 'AD_COMMENT_REWARD', 'AD_REPLY_REWARD', 'AD_SAVE_REWARD'] }
        }
      },
      {
        $group: {
          _id: null,
          total_coins_minted: { $sum: '$amount' },
          total_coins_from_ads: {
            $sum: {
              $cond: [
                { $in: ['$type', ['AD_REWARD', 'AD_VIEW_REWARD', 'AD_LIKE_REWARD', 'AD_COMMENT_REWARD', 'AD_REPLY_REWARD', 'AD_SAVE_REWARD']] },
                '$amount',
                0
              ]
            }
          },
          total_coins_from_reels: {
            $sum: {
              $cond: [{ $eq: ['$type', 'REEL_VIEW_REWARD'] }, '$amount', 0]
            }
          },
          total_transactions: { $sum: 1 }
        }
      }
    ]);

    // Defaults if no transactions yet
    const finalSummary = summary || {
      total_coins_minted: 0,
      total_coins_from_ads: 0,
      total_coins_from_reels: 0,
      total_transactions: 0
    };

    // Ensure total_transactions counts ALL transactions
    const totalTxCount = await WalletTransaction.countDocuments({});
    finalSummary.total_transactions = totalTxCount;

    res.json({
      summary: finalSummary,
      total,
      transactions
    });
  } catch (error) {
    console.error('Get all wallets error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getWalletHistoryForUser = async ({ userId, limit = 50 }) => {
  let wallet = await Wallet.findOne({ user_id: userId });
  if (!wallet) {
    wallet = await Wallet.findOneAndUpdate(
      { user_id: userId },
      { $setOnInsert: { balance: 0, currency: 'Coins' } },
      { new: true, upsert: true }
    );
  }

  const transactions = await WalletTransaction.find({ user_id: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('ad_id', 'title thumbnail_url')
    .populate('post_id', '_id type')
    .lean();

  const enrichedTransactions = transactions.map((t) => {
    const rawAmount = Number(t.amount || 0);
    const amount = (rawAmount > 0 && DEBIT_TYPES.has(t.type)) ? -rawAmount : rawAmount;
    const direction = amount >= 0 ? 'credit' : 'debit';
    const createdAt = t.createdAt || t.transactionDate;

    const titles = {
      VENDOR_REGISTRATION_CREDIT: 'Registration Credit',
      ADMIN_ADJUSTMENT: 'Admin Adjustment',
      REEL_VIEW_REWARD: 'Reel View Reward',
      AD_REWARD: 'Ad Reward',
      AD_VIEW_REWARD: 'Ad View Reward',
      AD_VIEW_DEDUCTION: 'Ad View Deduction',
      AD_LIKE_REWARD: 'Ad Like Reward',
      AD_LIKE_DEDUCTION: 'Ad Like Deduction',
      AD_LIKE_REWARD_REVERSAL: 'Like Reversal (User Debit)',
      AD_LIKE_BUDGET_REFUND: 'Like Reversal (Ad Budget Refund)',
      AD_COMMENT_REWARD: 'Ad Comment Reward',
      AD_COMMENT_DEDUCTION: 'Ad Comment Deduction',
      AD_REPLY_REWARD: 'Ad Reply Reward',
      AD_REPLY_DEDUCTION: 'Ad Reply Deduction',
      AD_SAVE_REWARD: 'Ad Save Reward',
      AD_SAVE_DEDUCTION: 'Ad Save Deduction',
      AD_BUDGET_DEDUCTION: 'Ad Budget Deduction',
      LIKE: 'Like',
      COMMENT: 'Comment',
      REPLY: 'Reply',
      SAVE: 'Save'
    };

    const title = titles[t.type] || t.type;
    const refTitle = t.ad_id?.title ? String(t.ad_id.title) : '';
    const description = t.description || (refTitle ? `${title} • ${refTitle}` : title);

    return {
      ...t,
      amount,
      ui: {
        title,
        description,
        direction,
        amount,
        created_at: createdAt
      }
    };
  });

  if (enrichedTransactions.length === 0 && Number(wallet.balance || 0) > 0) {
    const amount = Number(wallet.balance || 0);
    const createdAt = wallet.createdAt || new Date();
    const title = 'Registration Credit';
    const description = 'Initial credits added on vendor registration';
    return {
      wallet,
      transactions: [
        {
          _id: null,
          user_id: userId,
          type: 'VENDOR_REGISTRATION_CREDIT',
          amount,
          status: 'SUCCESS',
          description,
          transactionDate: createdAt,
          createdAt,
          updatedAt: createdAt,
          synthetic: true,
          ui: {
            title,
            description,
            direction: 'credit',
            amount,
            created_at: createdAt
          }
        }
      ]
    };
  }

  return { wallet, transactions: enrichedTransactions };
};

const canAccessUserWallet = (requester, targetUserId) => {
  if (!requester) return false;
  if (requester.role === 'admin') return true;
  return requester._id && requester._id.toString() === String(targetUserId);
};

exports.getMemberWalletHistoryByUserId = async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }
    if (!canAccessUserWallet(req.user, userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const user = await User.findById(userId).select('role');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.role !== 'member') {
      return res.status(400).json({ message: 'User is not a member' });
    }

    const { wallet, transactions } = await getWalletHistoryForUser({ userId });
    res.json({ user_id: userId, wallet: { balance: wallet.balance, currency: wallet.currency }, transactions });
  } catch (error) {
    console.error('Get member wallet history error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getVendorWalletHistoryByUserId = async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }
    if (!canAccessUserWallet(req.user, userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const user = await User.findById(userId).select('role');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.role !== 'vendor') {
      return res.status(400).json({ message: 'User is not a vendor' });
    }

    const wallet = await Wallet.findOne({ user_id: userId }) || { balance: 0, currency: 'Coins' };

    const vendor = await mongoose.model('Vendor').findOne({ user_id: userId }).select('_id').lean();
    const vendorId = vendor?._id;

    const userTx = await WalletTransaction.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .populate('ad_id', 'title thumbnail_url')
      .populate('post_id', '_id type')
      .lean();

    let vendorAdTx = [];
    if (vendorId) {
      vendorAdTx = await WalletTransaction.find({ vendor_id: vendorId })
        .sort({ createdAt: -1 })
        .populate('ad_id', 'title thumbnail_url')
        .populate('post_id', '_id type')
        .lean();
    }

    const map = new Map();
    [...userTx, ...vendorAdTx].forEach(t => map.set(String(t._id), t));
    const merged = Array.from(map.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const titles = {
      VENDOR_REGISTRATION_CREDIT: 'Registration Credit',
      ADMIN_ADJUSTMENT: 'Admin Adjustment',
      REEL_VIEW_REWARD: 'Reel View Reward',
      AD_REWARD: 'Ad Reward',
      AD_VIEW_REWARD: 'Ad View Reward',
      AD_VIEW_DEDUCTION: 'Ad View Deduction',
      AD_LIKE_REWARD: 'Ad Like Reward',
      AD_LIKE_DEDUCTION: 'Ad Like Deduction',
      AD_LIKE_REWARD_REVERSAL: 'Like Reversal (User Debit)',
      AD_LIKE_BUDGET_REFUND: 'Like Reversal (Ad Budget Refund)',
      AD_COMMENT_REWARD: 'Ad Comment Reward',
      AD_COMMENT_DEDUCTION: 'Ad Comment Deduction',
      AD_REPLY_REWARD: 'Ad Reply Reward',
      AD_REPLY_DEDUCTION: 'Ad Reply Deduction',
      AD_SAVE_REWARD: 'Ad Save Reward',
      AD_SAVE_DEDUCTION: 'Ad Save Deduction',
      AD_BUDGET_DEDUCTION: 'Ad Budget Deduction',
      LIKE: 'Like',
      COMMENT: 'Comment',
      REPLY: 'Reply',
      SAVE: 'Save'
    };

    const enriched = merged.map((t) => {
      const rawAmount = Number(t.amount || 0);
      const amount = (rawAmount > 0 && DEBIT_TYPES.has(t.type)) ? -rawAmount : rawAmount;
      const direction = amount >= 0 ? 'credit' : 'debit';
      const createdAt = t.createdAt || t.transactionDate;
      const title = titles[t.type] || t.type;
      const refTitle = t.ad_id?.title ? String(t.ad_id.title) : '';
      const description = t.description || (refTitle ? `${title} • ${refTitle}` : title);
      return {
        ...t,
        amount,
        ui: {
          title,
          description,
          direction,
          amount,
          created_at: createdAt
        }
      };
    });

    if (enriched.length === 0 && Number(wallet.balance || 0) > 0) {
      const amount = Number(wallet.balance || 0);
      const createdAt = wallet.createdAt || new Date();
      const title = 'Registration Credit';
      const description = 'Initial credits added on vendor registration';
      enriched.push({
        _id: null,
        user_id: userId,
        type: 'VENDOR_REGISTRATION_CREDIT',
        amount,
        status: 'SUCCESS',
        description,
        transactionDate: createdAt,
        createdAt,
        updatedAt: createdAt,
        synthetic: true,
        ui: {
          title,
          description,
          direction: 'credit',
          amount,
          created_at: createdAt
        }
      });
    }

    res.json({ user_id: userId, wallet: { balance: wallet.balance, currency: wallet.currency }, transactions: enriched });
  } catch (error) {
    console.error('Get vendor wallet history error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getAdWalletHistory = async (req, res) => {
  try {
    const adId = req.params.adId;
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid adId' });
    }

    const requester = req.user;
    const ad = await Ad.findById(adId).select('user_id').lean();
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    const isAdmin = requester?.role === 'admin';
    const isVendorOwner = requester?.role === 'vendor' && requester?._id?.toString() === ad.user_id.toString();
    if (!isAdmin && !isVendorOwner) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { startDate, endDate, type, userId } = req.query || {};
    const match = { ad_id: adId };

    if (type) {
      const types = String(type).split(',').map(s => s.trim()).filter(Boolean);
      if (types.length) match.type = { $in: types };
    }

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(String(userId))) {
        return res.status(400).json({ message: 'Invalid userId' });
      }
      match.user_id = String(userId);
    }

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) {
        const d = new Date(String(startDate));
        if (Number.isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid startDate' });
        match.createdAt.$gte = d;
      }
      if (endDate) {
        const d = new Date(String(endDate));
        if (Number.isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid endDate' });
        match.createdAt.$lte = d;
      }
    }

    const transactions = await WalletTransaction.find(match)
      .sort({ createdAt: -1 })
      .populate('user_id', 'username full_name avatar_url role')
      .populate('ad_id', 'caption')
      .lean();

    const adMeta = await Ad.findById(adId).select('total_budget_coins total_coins_spent').lean();
    let total_budget_coins = Number(adMeta?.total_budget_coins ?? 0) || 0;
    let total_coins_spent = Number(adMeta?.total_coins_spent ?? 0) || 0;

    if (!total_budget_coins) {
      const budgetTx = transactions.find((t) => t.type === 'AD_BUDGET_DEDUCTION');
      const budgetAmount = Number(budgetTx?.amount ?? 0) || 0;
      total_budget_coins = Math.abs(budgetAmount);
    }

    if (!total_coins_spent) {
      const rewardTypes = new Set([
        'AD_REWARD',
        'AD_VIEW_REWARD',
        'AD_LIKE_REWARD',
        'AD_COMMENT_REWARD',
        'AD_REPLY_REWARD',
        'AD_SAVE_REWARD'
      ]);
      total_coins_spent = transactions.reduce((sum, t) => {
        const amt = Number(t.amount ?? 0) || 0;
        if (!rewardTypes.has(t.type)) return sum;
        return sum + (amt > 0 ? amt : 0);
      }, 0);
    }

    const balance_left = Math.max(0, total_budget_coins - total_coins_spent);

    const titles = {
      VENDOR_REGISTRATION_CREDIT: 'Registration Credit',
      ADMIN_ADJUSTMENT: 'Admin Adjustment',
      REEL_VIEW_REWARD: 'Reel View Reward',
      AD_REWARD: 'Ad Reward',
      AD_VIEW_REWARD: 'Ad View Reward',
      AD_VIEW_DEDUCTION: 'Ad View Deduction',
      AD_LIKE_REWARD: 'Ad Like Reward',
      AD_LIKE_DEDUCTION: 'Ad Like Deduction',
      AD_LIKE_REWARD_REVERSAL: 'Like Reversal (User Debit)',
      AD_LIKE_BUDGET_REFUND: 'Like Reversal (Ad Budget Refund)',
      AD_COMMENT_REWARD: 'Ad Comment Reward',
      AD_COMMENT_DEDUCTION: 'Ad Comment Deduction',
      AD_REPLY_REWARD: 'Ad Reply Reward',
      AD_REPLY_DEDUCTION: 'Ad Reply Deduction',
      AD_SAVE_REWARD: 'Ad Save Reward',
      AD_SAVE_DEDUCTION: 'Ad Save Deduction',
      AD_BUDGET_DEDUCTION: 'Ad Budget Deduction',
      LIKE: 'Like',
      COMMENT: 'Comment',
      REPLY: 'Reply',
      SAVE: 'Save'
    };

    const enriched = transactions.map((t) => {
      const rawAmount = Number(t.amount || 0);
      const amount = (rawAmount > 0 && DEBIT_TYPES.has(t.type)) ? -rawAmount : rawAmount;
      const direction = amount >= 0 ? 'credit' : 'debit';
      const createdAt = t.createdAt || t.transactionDate;
      const title = titles[t.type] || t.type;
      const refTitle = t.ad_id?.caption ? String(t.ad_id.caption) : '';
      const description = t.description || (refTitle ? `${title} • ${refTitle}` : title);
      return {
        ...t,
        amount,
        ui: {
          title,
          description,
          direction,
          amount,
          created_at: createdAt
        }
      };
    });

    res.json({ ad_id: adId, total_budget_coins, balance_left, total: enriched.length, transactions: enriched });
  } catch (error) {
    console.error('Get ad wallet history error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateWalletBalance = async (req, res) => {
  try {
    const { userId, amount, type, description } = req.body;

    if (!userId || !amount || !type) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Determine transaction type based on amount sign if not strictly provided
    // Assuming 'type' is 'CREDIT' or 'DEBIT' from admin panel
    // But transaction model uses specific enums like 'AD_REWARD', etc.
    // Let's use 'ADMIN_ADJUSTMENT' for manual changes or stick to provided type.
    
    // Update wallet
    const wallet = await Wallet.findOneAndUpdate(
      { user_id: userId },
      { $inc: { balance: Number(amount) } },
      { new: true, upsert: true }
    );

    // Create transaction record
    await WalletTransaction.create({
      user_id: userId,
      type: type || 'ADMIN_ADJUSTMENT',
      amount: Number(amount),
      status: 'SUCCESS',
      description: description || 'Admin adjustment'
    });

    // Send Notification
    try {
      const numAmount = Number(amount);
      if (numAmount > 0) {
        await sendNotification(req.app, {
          recipient: userId,
          sender: null,
          type: 'coins_credited',
          message: `${numAmount} coins have been added to your wallet`,
          link: '/wallet'
        });
      } else if (numAmount < 0) {
        await sendNotification(req.app, {
          recipient: userId,
          sender: null,
          type: 'coins_debited',
          message: `${Math.abs(numAmount)} coins have been deducted from your wallet`,
          link: '/wallet'
        });
      }
    } catch (notifErr) {
      console.error('Coins credited/debited notification error:', notifErr);
    }

    res.json({ message: 'Wallet updated successfully', balance: wallet.balance });
  } catch (error) {
    console.error('Update wallet error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
