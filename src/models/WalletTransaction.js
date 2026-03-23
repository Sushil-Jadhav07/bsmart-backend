'use strict';

const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    vendor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      index: true,
    },
    post_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      index: true,
    },
    ad_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ad',
      index: true,
    },
    /**
     * Transaction Type Reference
     * ─────────────────────────────────────────────────────────
     * VENDOR WALLET (stored with vendor's user_id)
     *   VENDOR_REGISTRATION_CREDIT  – initial coins when vendor signs up
     *   VENDOR_RECHARGE             – admin tops up vendor wallet
     *   VENDOR_PACKAGE_PURCHASE     – vendor purchases a package; coins credited
     *   AD_BUDGET_DEDUCTION         – vendor creates ad; budget deducted
     *   AD_LIKE_BUDGET_REFUND       – user un-likes; budget refunded to vendor
     *   ADMIN_ADJUSTMENT            – manual admin credit/debit
     *
     * MEMBER WALLET (stored with member's user_id)
     *   AD_VIEW_REWARD              – member completes watching an ad (first view only)
     *   AD_LIKE_REWARD              – member likes an ad
     *   AD_LIKE_REWARD_REVERSAL     – member un-likes; coins deducted back
     *   AD_COMMENT_REWARD           – member comments on an ad
     *   AD_REPLY_REWARD             – member replies to a comment on an ad
     *   AD_SAVE_REWARD              – member saves an ad
     *   VENDOR_PROFILE_VIEW_REWARD  – member views vendor profile for 3+ min
     *   REEL_VIEW_REWARD            – member views a post/reel
     *   AD_REWARD                   – generic ad engagement reward
     *   ADMIN_ADJUSTMENT            – manual admin credit/debit
     *
     * AD BUDGET (stored with vendor's user_id, ad_id set)
     *   AD_VIEW_DEDUCTION           – ad budget spent when member views ad
     *   AD_LIKE_DEDUCTION           – ad budget spent when member likes ad
     *   AD_COMMENT_DEDUCTION        – ad budget spent when member comments
     *   AD_REPLY_DEDUCTION          – ad budget spent when member replies
     *   AD_SAVE_DEDUCTION           – ad budget spent when member saves ad
     */
    type: {
      type: String,
      enum: [
        // Vendor wallet
        'VENDOR_REGISTRATION_CREDIT',
        'VENDOR_RECHARGE',
        'VENDOR_PACKAGE_PURCHASE',        // ← NEW: vendor buys a package
        'AD_BUDGET_DEDUCTION',
        'AD_LIKE_BUDGET_REFUND',
        'VENDOR_PROFILE_VIEW_DEDUCTION',
        // Member wallet – rewards
        'REEL_VIEW_REWARD',
        'AD_REWARD',
        'AD_VIEW_REWARD',
        'AD_LIKE_REWARD',
        'AD_LIKE_REWARD_REVERSAL',
        'AD_COMMENT_REWARD',
        'AD_REPLY_REWARD',
        'AD_SAVE_REWARD',
        'VENDOR_PROFILE_VIEW_REWARD',
        // Ad budget – deductions (vendor's wallet)
        'AD_VIEW_DEDUCTION',
        'AD_LIKE_DEDUCTION',
        'AD_COMMENT_DEDUCTION',
        'AD_REPLY_DEDUCTION',
        'AD_SAVE_DEDUCTION',
        // Shared
        'ADMIN_ADJUSTMENT',
        // Legacy post actions
        'LIKE',
        'COMMENT',
        'REPLY',
        'SAVE',
      ],
      required: true,
    },
    amount: {
      type: Number,
      default: 10,
    },
    description: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED'],
      default: 'SUCCESS',
    },
    transactionDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// ─────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────

/**
 * IMPORTANT – unique index notes
 *
 * We use PARTIAL indexes so null ad_id / post_id doesn't cause E11000 errors.
 *
 * post-based actions: one per user per post
 */
walletTransactionSchema.index(
  { user_id: 1, post_id: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { post_id: { $type: 'objectId' } },
  }
);

/**
 * ad-based actions that should only happen once per user per ad
 * (view reward, budget deduction, comment, reply, save)
 */
walletTransactionSchema.index(
  { user_id: 1, ad_id: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      ad_id: { $type: 'objectId' },
      type: {
        $in: [
          'AD_VIEW_REWARD',
          'AD_VIEW_DEDUCTION',
          'AD_BUDGET_DEDUCTION',
          'AD_COMMENT_REWARD',
          'AD_COMMENT_DEDUCTION',
          'AD_REPLY_REWARD',
          'AD_REPLY_DEDUCTION',
          'AD_SAVE_REWARD',
          'AD_SAVE_DEDUCTION',
          'VENDOR_PROFILE_VIEW_REWARD',
        ],
      },
    },
  }
);

// Efficient history queries
walletTransactionSchema.index({ user_id: 1, createdAt: -1 });
walletTransactionSchema.index({ ad_id: 1, createdAt: -1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);