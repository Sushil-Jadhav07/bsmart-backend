const mongoose = require('mongoose');

const subserviceSnapshotSchema = new mongoose.Schema({
  name:  { type: String, default: '' },
  hours: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  sqft:  { type: Number, default: 0 },
}, { _id: false });

const timeSlotSchema = new mongoose.Schema({
  start: { type: String, required: true }, // "09:00"
  end:   { type: String, required: true }, // "17:00"
}, { _id: false });

const customerAddressSchema = new mongoose.Schema({
  name:          { type: String, default: '' },
  phone:         { type: String, default: '' },
  address_line1: { type: String, default: '' },
  address_line2: { type: String, default: '' },
  city:          { type: String, default: '' },
  state:         { type: String, default: '' },
  pincode:       { type: String, default: '' },
  country:       { type: String, default: 'India' },
}, { _id: false });

// One line item = one service's worth of a multi-vendor checkout. Mirrors
// the per-booking fields on ServiceBooking (see that model) since each item
// becomes its own ServiceBooking once the order is created.
const orderItemSchema = new mongoose.Schema({
  service_id: { type: mongoose.Schema.Types.ObjectId, ref: 'InfluencerService', required: true },
  seller_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // snapshot of service.user_id
  booking_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceBooking', default: null },

  service_name:   { type: String, required: true },
  service_image:  { type: String, default: '' },
  service_method: { type: String, enum: ['at_customer_location', 'online', 'at_my_location'], required: true },
  rate_type:      { type: String, required: true },
  duration:       { type: String, required: true },

  selected_subservices: { type: [subserviceSnapshotSchema], default: [] },
  base_price:           { type: Number, required: true },
  subservices_total:    { type: Number, default: 0 },
  item_total:           { type: Number, required: true },

  booking_date: { type: Date, required: true },
  time_slot:    { type: timeSlotSchema, required: true },
  customer_address: { type: customerAddressSchema, default: null },
  notes:            { type: String, default: '' },
}, { _id: false });

const serviceOrderSchema = new mongoose.Schema({
  order_number: { type: String, required: true, unique: true, index: true },
  user_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  items: { type: [orderItemSchema], validate: v => v.length > 0, required: true },

  subtotal_amount: { type: Number, required: true },
  total_amount:    { type: Number, required: true }, // === subtotal_amount today; separate field in case fees are added later
  currency:        { type: String, default: 'INR' },

  // Coins are applied first; Razorpay only covers what's left. coins_used is
  // not deducted from the wallet until payment (including any Razorpay
  // remainder) is actually confirmed — see verifyServiceOrderPayment.
  payment_method: { type: String, enum: ['wallet', 'razorpay', 'hybrid'], required: true },
  coins_used:     { type: Number, default: 0 },
  razorpay_amount: { type: Number, default: 0 },

  payment_status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  razorpay_order_id:   { type: String, default: null },
  razorpay_payment_id: { type: String, default: null, index: true },
  razorpay_signature:  { type: String, default: null },
  wallet_transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },

  order_status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'pending',
  },

  placed_at: { type: Date, default: null },
}, { timestamps: true });

serviceOrderSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('ServiceOrder', serviceOrderSchema);
