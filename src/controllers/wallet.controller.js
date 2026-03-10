const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const sendNotification = require('../utils/sendNotification');

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
