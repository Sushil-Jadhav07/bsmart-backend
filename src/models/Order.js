const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'InfluencerProduct', required: true },
  seller_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // snapshot of product.user_id

  // Snapshots — kept even if the product is later edited/deleted
  name:  { type: String, required: true },
  image: { type: String, default: '' },
  variant: {
    color: { type: String, default: '' },
    size:  { type: String, default: '' },
  },

  unit_price: { type: Number, required: true },
  quantity:   { type: Number, required: true, min: 1 },
  subtotal:   { type: Number, required: true },
}, { _id: false });

const addressSchema = new mongoose.Schema({
  name:          { type: String, default: '' },
  phone:         { type: String, default: '' },
  address_line1: { type: String, default: '' },
  address_line2: { type: String, default: '' },
  city:          { type: String, default: '' },
  state:         { type: String, default: '' },
  pincode:       { type: String, default: '' },
  country:       { type: String, default: 'India' },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  order_number: { type: String, required: true, unique: true, index: true },
  user_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  items: { type: [orderItemSchema], validate: v => v.length > 0, required: true },

  subtotal_amount: { type: Number, required: true },
  shipping_fee:    { type: Number, default: 0 },
  total_amount:    { type: Number, required: true },
  currency:        { type: String, default: 'INR' },

  payment_method: { type: String, enum: ['razorpay', 'wallet'], required: true },
  payment_status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  razorpay_order_id:   { type: String, default: null },
  razorpay_payment_id: { type: String, default: null, index: true },
  razorpay_signature:  { type: String, default: null },
  wallet_transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },

  order_status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
  },
  shipping_address: { type: addressSchema, required: true },

  placed_at:        { type: Date, default: null },
  cancelled_at:      { type: Date, default: null },
  cancelled_reason: { type: String, default: '' },
}, { timestamps: true });

orderSchema.index({ user_id: 1, createdAt: -1 });
orderSchema.index({ 'items.seller_id': 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
