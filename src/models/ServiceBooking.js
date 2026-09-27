const mongoose = require('mongoose');

const subserviceSnapshotSchema = new mongoose.Schema({
  name:  { type: String, default: '' },
  hours: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
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

const serviceBookingSchema = new mongoose.Schema({
  booking_number: { type: String, required: true, unique: true, index: true },
  user_id:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  service_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'InfluencerService', required: true, index: true },
  seller_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // snapshot of service.user_id

  // Snapshots — kept even if the service is later edited/deleted
  service_name:   { type: String, required: true },
  service_image:  { type: String, default: '' },
  service_method: { type: String, enum: ['at_customer_location', 'online', 'at_my_location'], required: true },
  rate_type:      { type: String, required: true },
  duration:       { type: String, required: true },

  selected_subservices: { type: [subserviceSnapshotSchema], default: [] },
  base_price:           { type: Number, required: true },
  subservices_total:    { type: Number, default: 0 },
  total_amount:         { type: Number, required: true },
  currency:             { type: String, default: 'INR' },

  booking_date: { type: Date, required: true },
  time_slot:    { type: timeSlotSchema, required: true },

  customer_address: { type: customerAddressSchema, default: null }, // only when service_method === at_customer_location
  notes:            { type: String, default: '' },

  payment_method: { type: String, enum: ['razorpay', 'wallet'], required: true },
  payment_status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  razorpay_order_id:   { type: String, default: null },
  razorpay_payment_id: { type: String, default: null, index: true },
  razorpay_signature:  { type: String, default: null },
  wallet_transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },

  booking_status: {
    type: String,
    enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'],
    default: 'pending',
  },

  placed_at:        { type: Date, default: null },
  cancelled_at:     { type: Date, default: null },
  cancelled_reason: { type: String, default: '' },
}, { timestamps: true });

serviceBookingSchema.index({ user_id: 1, createdAt: -1 });
serviceBookingSchema.index({ seller_id: 1, createdAt: -1 });
serviceBookingSchema.index({ service_id: 1, booking_date: 1 });

module.exports = mongoose.model('ServiceBooking', serviceBookingSchema);
