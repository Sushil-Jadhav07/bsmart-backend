const mongoose = require('mongoose');

const wishlistItemSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'InfluencerProduct', required: true },
  added_at:   { type: Date, default: Date.now },
}, { _id: false });

const wishlistSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items:   { type: [wishlistItemSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('Wishlist', wishlistSchema);
