const Razorpay = require('razorpay');
const ListingSubscription = require('../models/ListingSubscription');
const User = require('../models/User');

const razorpay = (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;

const TRIAL_DAYS = 7;
// Razorpay requires a finite total_count for a subscription even when it's
// meant to run indefinitely — 120 monthly cycles is 10 years, same approach
// most integrations use for "no real end date".
const TOTAL_BILLING_CYCLES = 120;

// Reuses the member's existing Razorpay Customer if they already have one
// (e.g. from a previous subscription attempt), otherwise creates one.
const getOrCreateRazorpayCustomer = async (user) => {
  if (user.razorpay_customer_id) return user.razorpay_customer_id;
  const customer = await razorpay.customers.create({
    name: user.full_name || user.username,
    email: user.email || undefined,
    contact: user.phone || undefined,
    fail_existing: 0, // if a customer with this email/contact already exists at Razorpay, reuse it instead of erroring
  });
  user.razorpay_customer_id = customer.id;
  await user.save();
  return customer.id;
};

// ─── Start becoming an influencer: 7-day free trial or pay now ───────────────
// Body: { start_trial }. Authorizes a ₹99/month Razorpay mandate today either
// way — the only difference is whether the first charge happens today or
// after the 7-day trial window. The caller's role is NOT switched here; the
// frontend does that (via the existing PATCH /users/:id/role, with the store
// details) only after Razorpay confirms the mandate was actually authorized,
// so an abandoned checkout never grants influencer access for free.
exports.createAccountSubscription = async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(500).json({ message: 'Razorpay is not configured on the server' });
    }
    const { start_trial } = req.body;

    const existing = await ListingSubscription.findOne({
      listing_type: 'influencer_account',
      listing_id: req.userId,
      status: { $in: ['created', 'trialing', 'active', 'past_due'] },
    });
    if (existing) {
      return res.status(409).json({ message: 'You already have an active or pending store subscription' });
    }

    const user = await User.findById(req.userId);
    const customerId = await getOrCreateRazorpayCustomer(user);

    const now = Math.floor(Date.now() / 1000);
    const trialEndsAtUnix = now + TRIAL_DAYS * 24 * 60 * 60;
    const startAt = start_trial ? trialEndsAtUnix : now;

    const rzpSubscription = await razorpay.subscriptions.create({
      plan_id: process.env.RAZORPAY_PUBLISHING_PLAN_ID,
      customer_id: customerId,
      customer_notify: 1,
      total_count: TOTAL_BILLING_CYCLES,
      start_at: startAt,
      notes: { user_id: String(req.userId), purpose: 'influencer_account' },
    });

    const subscription = await ListingSubscription.create({
      user_id: req.userId,
      listing_type: 'influencer_account',
      listing_id: req.userId,
      razorpay_customer_id: customerId,
      razorpay_subscription_id: rzpSubscription.id,
      razorpay_plan_id: process.env.RAZORPAY_PUBLISHING_PLAN_ID,
      status: start_trial ? 'trialing' : 'created',
      trial_ends_at: start_trial ? new Date(trialEndsAtUnix * 1000) : null,
    });

    return res.status(201).json({
      success: true,
      subscription,
      razorpay: {
        subscription_id: rzpSubscription.id,
        key_id: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error('[createAccountSubscription]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Upgrade: skip the rest of a free trial and start billing today ──────────
// Razorpay doesn't support changing an existing subscription's start_at, so
// this cancels the trialing subscription (its mandate was never charged
// anyway) and creates a fresh one with start_at = now, requiring a new
// Checkout authorization — same mechanics as createAccountSubscription's
// pay-now path, just re-entered mid-trial.
exports.upgradeAccountSubscription = async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(500).json({ message: 'Razorpay is not configured on the server' });
    }

    const current = await ListingSubscription.findOne({
      listing_type: 'influencer_account',
      listing_id: req.userId,
      status: 'trialing',
    });
    if (!current) {
      return res.status(400).json({ message: 'No active free trial to upgrade' });
    }

    try {
      await razorpay.subscriptions.cancel(current.razorpay_subscription_id);
    } catch (rzpErr) {
      console.error('[upgradeAccountSubscription] cancel old subscription failed:', rzpErr.message);
    }
    current.status = 'cancelled';
    current.cancelled_at = new Date();
    await current.save();

    const user = await User.findById(req.userId);
    const customerId = await getOrCreateRazorpayCustomer(user);
    const now = Math.floor(Date.now() / 1000);

    const rzpSubscription = await razorpay.subscriptions.create({
      plan_id: process.env.RAZORPAY_PUBLISHING_PLAN_ID,
      customer_id: customerId,
      customer_notify: 1,
      total_count: TOTAL_BILLING_CYCLES,
      start_at: now,
      notes: { user_id: String(req.userId), purpose: 'influencer_account', upgraded_from: String(current._id) },
    });

    const subscription = await ListingSubscription.create({
      user_id: req.userId,
      listing_type: 'influencer_account',
      listing_id: req.userId,
      razorpay_customer_id: customerId,
      razorpay_subscription_id: rzpSubscription.id,
      razorpay_plan_id: process.env.RAZORPAY_PUBLISHING_PLAN_ID,
      status: 'created',
      trial_ends_at: null,
    });

    return res.status(201).json({
      success: true,
      subscription,
      razorpay: {
        subscription_id: rzpSubscription.id,
        key_id: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error('[upgradeAccountSubscription]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Status for the account/dashboard UI (trial countdown / next billing date) ─
exports.getMyAccountSubscription = async (req, res) => {
  try {
    const subscription = await ListingSubscription.findOne({
      listing_type: 'influencer_account',
      listing_id: req.userId,
    }).sort({ createdAt: -1 }).lean();

    return res.json({ success: true, subscription: subscription || null });
  } catch (error) {
    console.error('[getMyAccountSubscription]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Influencer cancels — reverts the account to a plain member ──────────────
exports.cancelAccountSubscription = async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(500).json({ message: 'Razorpay is not configured on the server' });
    }
    const { id } = req.params;

    const subscription = await ListingSubscription.findOne({ _id: id, user_id: req.userId });
    if (!subscription) return res.status(404).json({ message: 'Subscription not found' });
    if (subscription.status === 'cancelled') {
      return res.json({ success: true, subscription, message: 'Already cancelled' });
    }

    try {
      await razorpay.subscriptions.cancel(subscription.razorpay_subscription_id);
    } catch (rzpErr) {
      // Already cancelled/expired at Razorpay's end — proceed to reflect that locally.
      console.error('[cancelAccountSubscription] Razorpay cancel failed:', rzpErr.message);
    }

    subscription.status = 'cancelled';
    subscription.cancelled_at = new Date();
    await subscription.save();

    await User.updateOne({ _id: subscription.user_id }, { role: 'member' });

    return res.json({ success: true, subscription });
  } catch (error) {
    console.error('[cancelAccountSubscription]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Razorpay webhook — subscription lifecycle events ─────────────────────────
// Unauthenticated (Razorpay calls this directly). Signature is verified
// against the RAW request body — see the `verify` callback added to
// express.json() in server.js, which populates req.rawBody.
exports.handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!signature || !secret || !req.rawBody) {
      return res.status(400).json({ message: 'Missing signature or webhook not configured' });
    }

    let valid;
    try {
      valid = Razorpay.validateWebhookSignature(req.rawBody.toString(), signature, secret);
    } catch (err) {
      valid = false;
    }
    if (!valid) {
      console.warn('[razorpay webhook] invalid signature');
      return res.status(400).json({ message: 'Invalid signature' });
    }

    const event = req.body.event;
    const rzpSub = req.body.payload?.subscription?.entity;
    if (!rzpSub?.id) {
      // Not a subscription event (e.g. a payment event) — acknowledge and ignore.
      return res.json({ success: true, ignored: true });
    }

    const subscription = await ListingSubscription.findOne({ razorpay_subscription_id: rzpSub.id });
    if (!subscription) {
      // Could be a subscription from before this feature existed, or a test
      // event — nothing local to update, but still acknowledge so Razorpay
      // doesn't keep retrying.
      return res.json({ success: true, ignored: true });
    }

    switch (event) {
      case 'subscription.activated':
      case 'subscription.charged': {
        subscription.status = 'active';
        if (rzpSub.current_end) {
          subscription.current_period_end = new Date(rzpSub.current_end * 1000);
        }
        await subscription.save();
        break;
      }
      case 'subscription.pending': {
        // A renewal charge failed but Razorpay is still retrying — don't
        // revoke access yet, just flag it so the UI can warn the user.
        subscription.status = 'past_due';
        await subscription.save();
        break;
      }
      case 'subscription.halted':
      case 'subscription.cancelled':
      case 'subscription.completed': {
        subscription.status = event === 'subscription.halted' ? 'halted' : 'cancelled';
        subscription.cancelled_at = new Date();
        await subscription.save();
        // Billing lapsed — revoke the influencer role (and with it, access
        // to My Store) until they resubscribe via "Create Store" again.
        await User.updateOne({ _id: subscription.user_id }, { role: 'member' });
        break;
      }
      default:
        break; // other events (e.g. subscription.authenticated) need no local action
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[handleWebhook]', error);
    // Still 200 — a 5xx here just makes Razorpay retry a request that may
    // keep failing for the same reason; log and move on.
    return res.status(200).json({ success: false });
  }
};
