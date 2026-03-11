const mongoose = require('mongoose');

const memberAdActionSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
  ad_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', required: true, index: true },
  event_type: {
    type: String,
    enum: ['like', 'dislike', 'undo-like', 'undo-dislike'],
    required: true
  },
  credit_delta: { type: Number, required: true },
}, { timestamps: true });

memberAdActionSchema.index({ user_id: 1, ad_id: 1, createdAt: 1 });

module.exports = mongoose.model('MemberAdAction', memberAdActionSchema);

