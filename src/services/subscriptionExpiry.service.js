'use strict';

/**
 * subscriptionExpiry.service.js
 *
 * Checks vendor package subscriptions that are close to expiry or already
 * expired and fires in-app notifications to the vendor's user account.
 *
 * Call scheduleSubscriptionExpiryJob(app) once from your server entry point
 * (e.g. index.js / app.js) after the DB connection is established.
 *
 * The job runs every day at 08:00 AM server time by default.
 * It sends:
 *   • A "subscription_expiring" notification 7 days before expiry
 *   • A "subscription_expiring" notification 3 days before expiry
 *   • A "subscription_expiring" notification 1 day before expiry
 *   • A "subscription_expired"  notification on the expiry day (or just after)
 */

const cron = require('node-cron');
const VendorPackagePurchase = require('../models/VendorPackagePurchase');
const Vendor  = require('../models/Vendor');
const sendNotification = require('../utils/sendNotification');

// How many days before expiry we send "expiring soon" warnings
const WARNING_DAYS = [7, 3, 1];

/**
 * Core check — safe to call manually in tests or scripts.
 * @param {import('express').Application} app  Express app (for socket.io access)
 */
const runExpiryCheck = async (app) => {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight today

  // ── 1. "Expiring soon" warnings ─────────────────────────────────────────
  for (const daysLeft of WARNING_DAYS) {
    // Target window: purchases that expire exactly `daysLeft` days from today
    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() + daysLeft);

    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 1); // exclusive upper bound

    const expiringPurchases = await VendorPackagePurchase.find({
      status:     'active',
      expires_at: { $gte: windowStart, $lt: windowEnd },
    })
      .populate({
        path:   'vendor_id',
        select: 'user_id business_name',
      })
      .lean();

    for (const purchase of expiringPurchases) {
      const vendor = purchase.vendor_id;
      if (!vendor || !vendor.user_id) continue;

      const packageName = purchase.package_snapshot?.name || 'your subscription';
      const expiresDate = purchase.expires_at
        ? new Date(purchase.expires_at).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
          })
        : 'soon';

      await sendNotification(app, {
        recipient: vendor.user_id,
        sender:    null, // system notification — no sender
        type:      'subscription_expiring',
        message:   `Your plan "${packageName}" expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''} (${expiresDate}). Renew now to keep your benefits.`,
        link:      '/vendor/subscription',
      }).catch(err =>
        console.error('[ExpiryJob] sendNotification (expiring) error:', err.message)
      );
    }
  }

  // ── 2. "Expired today" notification ─────────────────────────────────────
  const expiredWindowEnd = new Date(today);
  expiredWindowEnd.setDate(expiredWindowEnd.getDate() + 1); // up to tomorrow midnight

  // Find purchases that expired on or before now but haven't been marked yet.
  // We use a 24-hour look-back so we catch any that were missed.
  const dayAgo = new Date(today);
  dayAgo.setDate(dayAgo.getDate() - 1);

  const expiredPurchases = await VendorPackagePurchase.find({
    status:     'active',           // still active in DB → expired but not updated yet
    expires_at: { $gte: dayAgo, $lt: now },
  })
    .populate({
      path:   'vendor_id',
      select: 'user_id business_name',
    })
    .lean();

  for (const purchase of expiredPurchases) {
    const vendor = purchase.vendor_id;
    if (!vendor || !vendor.user_id) continue;

    const packageName = purchase.package_snapshot?.name || 'your subscription';

    await sendNotification(app, {
      recipient: vendor.user_id,
      sender:    null,
      type:      'subscription_expired',
      message:   `Your plan "${packageName}" has expired. Please renew to continue using vendor features.`,
      link:      '/vendor/subscription',
    }).catch(err =>
      console.error('[ExpiryJob] sendNotification (expired) error:', err.message)
    );

    // Mark the purchase as expired so we don't fire again tomorrow
    await VendorPackagePurchase.findByIdAndUpdate(purchase._id, { status: 'expired' });
  }

  console.log(`[ExpiryJob] Completed at ${now.toISOString()}`);
};

/**
 * Schedules the daily cron job.
 * @param {import('express').Application} app
 */
const scheduleSubscriptionExpiryJob = (app) => {
  // Runs every day at 08:00 AM  (cron: minute hour day month weekday)
  cron.schedule('0 8 * * *', async () => {
    console.log('[ExpiryJob] Running subscription expiry check …');
    try {
      await runExpiryCheck(app);
    } catch (err) {
      console.error('[ExpiryJob] Unhandled error:', err);
    }
  });

  console.log('[ExpiryJob] Subscription expiry job scheduled (daily at 08:00)');
};

module.exports = { scheduleSubscriptionExpiryJob, runExpiryCheck };
