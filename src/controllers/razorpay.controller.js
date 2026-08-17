'use strict';

const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// GET /api/razorpay/payments — every payment on the Razorpay account (not
// scoped to any one user), directly proxying Razorpay's own Payments API.
// https://api.razorpay.com/v1/payments
exports.listAllPayments = async (req, res) => {
  try {
    const count = Math.min(Math.max(parseInt(req.query.count, 10) || 100, 1), 100);
    const skip  = Math.max(parseInt(req.query.skip, 10) || 0, 0);

    const options = { count, skip };

    if (req.query.from) {
      const from = Math.floor(new Date(req.query.from).getTime() / 1000);
      if (Number.isFinite(from)) options.from = from;
    }
    if (req.query.to) {
      const to = Math.floor(new Date(req.query.to).getTime() / 1000);
      if (Number.isFinite(to)) options.to = to;
    }

    const result = await razorpay.payments.all(options);

    return res.json({
      success: true,
      count: result.items?.length || 0,
      skip,
      limit: count,
      has_more: (result.items?.length || 0) === count,
      data: result.items || [],
    });
  } catch (err) {
    console.error('[Razorpay] listAllPayments error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch payments from Razorpay', error: err.message });
  }
};
