const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'InfluencerProduct', required: true },
  quantity:   { type: Number, required: true, min: 1, default: 1 },
  variant: {
    color: { type: String, default: '' },
    size:  { type: String, default: '' },
  },
  added_at: { type: Date, default: Date.now },
}, { _id: false });

const cartSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items:   { type: [cartItemSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('Cart', cartSchema);
