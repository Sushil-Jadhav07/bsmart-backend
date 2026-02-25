const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');

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
    const { page = 1, limit = 20, type, user_id } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

    const filter = {};
    if (type) filter.type = type;
    if (user_id) filter.user_id = user_id;

    // Get paginated transactions
    const total = await WalletTransaction.countDocuments(filter);
    const transactions = await WalletTransaction.find(filter)
      .populate('user_id', 'username full_name avatar_url')
      .populate('ad_id', 'title')
      .populate('post_id', 'type')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    // Aggregate Summary (Global stats, not affected by pagination/filter for now, unless desired)
    // Here we return GLOBAL summary as requested
    const [summary] = await WalletTransaction.aggregate([
      {
        $match: {
          status: 'SUCCESS',
          type: { $in: ['AD_REWARD', 'REEL_VIEW_REWARD'] }
        }
      },
      {
        $group: {
          _id: null,
          total_coins_minted: { $sum: '$amount' },
          total_coins_from_ads: {
            $sum: {
              $cond: [{ $eq: ['$type', 'AD_REWARD'] }, '$amount', 0]
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

    // If no transactions yet, provide defaults
    const finalSummary = summary || {
      total_coins_minted: 0,
      total_coins_from_ads: 0,
      total_coins_from_reels: 0,
      total_transactions: 0
    };

    // Get total transactions count for pagination context (using the filter count)
    // The aggregate summary above counts *minting* transactions specifically.
    // Let's also add a total count of ALL transactions for the summary if needed, 
    // but the requirement said "total_transactions: count of all transactions" in summary context.
    // I will use the aggregation result for specific reward stats.
    
    // For the "total_transactions" field in summary, let's allow it to be the count of ALL types
    const totalTxCount = await WalletTransaction.countDocuments({});
    finalSummary.total_transactions = totalTxCount;

    res.json({
      summary: finalSummary,
      total,
      page: pageNum,
      limit: limitNum,
      transactions
    });
  } catch (error) {
    console.error('Get all wallets error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
