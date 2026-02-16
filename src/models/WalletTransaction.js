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
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['REEL_VIEW_REWARD', 'LIKE', 'COMMENT', 'REPLY', 'SAVE'],
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

walletTransactionSchema.index({ user_id: 1, post_id: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
