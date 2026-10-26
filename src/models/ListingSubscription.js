const mongoose = require('mongoose');

// Tracks the ₹99/month Razorpay auto-debit subscription that keeps an
// influencer account active. `listing_type` is 'influencer_account' with
// `listing_id` = the user's own id (kept generic/polymorphic in case a
// per-listing variant is ever added later alongside this account-level one).
const listingSubscriptionSchema = new mongoose.Schema({
  user_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  listing_type: { type: String, enum: ['influencer_account'], required: true },
  listing_id:   { type: mongoose.Schema.Types.ObjectId, required: true, index: true }, // === user_id for 'influencer_account'

  razorpay_customer_id:     { type: String, required: true },
  razorpay_subscription_id: { type: String, required: true, unique: true, index: true },
  razorpay_plan_id:         { type: String, required: true },

  // created   — subscription object exists at Razorpay, mandate not yet authorized
  // trialing  — mandate authorized, first charge deferred to trial_ends_at
  // active    — at least one successful charge has landed
  // past_due  — a renewal charge failed but Razorpay is still retrying
  // halted    — Razorpay gave up retrying; listing is hidden
  // cancelled — influencer or Razorpay cancelled it; listing is hidden
  status: {
    type: String,
    enum: ['created', 'trialing', 'active', 'past_due', 'halted', 'cancelled'],
    default: 'created',
    index: true,
  },

  trial_ends_at:     { type: Date, default: null },
  current_period_end: { type: Date, default: null },
  cancelled_at:       { type: Date, default: null },
}, { timestamps: true });

listingSubscriptionSchema.index({ listing_type: 1, listing_id: 1, createdAt: -1 });
listingSubscriptionSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('ListingSubscription', listingSubscriptionSchema);
