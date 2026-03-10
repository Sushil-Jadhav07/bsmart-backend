const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  post_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: false,
    index: true
  },
  ad_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ad',
    required: false,
    index: true
  },
  type: {
    type: String,
    // AD_REWARD: coins rewarded to a user for engaging with/viewing an ad (minting)
    // AD_BUDGET_DEDUCTION: coins deducted from vendor wallet when creating an ad (spend)
    enum: [
      'REEL_VIEW_REWARD',
      'LIKE', 'COMMENT', 'REPLY', 'SAVE',
      'AD_REWARD',
      'AD_VIEW_REWARD',
      'AD_VIEW_DEDUCTION',
      'AD_LIKE_REWARD',
      'AD_LIKE_DEDUCTION',
      'AD_BUDGET_DEDUCTION'
    ],
    required: true
  },
  amount: {
    type: Number,
    default: 10
  },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED'],
    default: 'SUCCESS'
  },
  transactionDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

/**
 * IMPORTANT (MongoDB index notes)
 *
 * Your production DB previously had a UNIQUE index on { user_id, post_id, type }.
 * That breaks ad transactions because ads don't always have post_id (null), causing
 * E11000 duplicate key errors.
 *
 * Fix strategy:
 * - Keep uniqueness for post-related actions ONLY when post_id exists.
 * - Keep uniqueness for ad-related actions ONLY when ad_id exists.
 *
 * This allows:
 * - One LIKE/COMMENT/etc per user per post (if you use it that way)
 * - One AD_REWARD per user per ad (reward once)
 * - One AD_BUDGET_DEDUCTION per vendor per ad (deduct once)
 */

// Unique for post-based transactions (only when post_id is present)
walletTransactionSchema.index(
  { user_id: 1, post_id: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { post_id: { $type: 'objectId' } }
  }
);

// Unique for ad-based transactions (only when ad_id is present)
walletTransactionSchema.index(
  { user_id: 1, ad_id: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { ad_id: { $type: 'objectId' } }
  }
);

// For fetching user history efficiently
walletTransactionSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
