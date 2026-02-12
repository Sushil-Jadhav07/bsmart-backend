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
    enum: ['REEL_VIEW_REWARD'],
    required: true
  },
  amount: {
    type: Number,
    default: 20
  },
  status: {
    type: String,
    enum: ['SUCCESS'],
    default: 'SUCCESS'
  }
}, {
  timestamps: true
});

walletTransactionSchema.index({ user_id: 1, post_id: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
