'use strict';

/**
 * vendorProfileView.controller.js
 *
 * Handles rewarding members who view a vendor's profile for 3+ minutes.
 *
 * Rules:
 *  - Only members earn coins (vendors/admins are excluded).
 *  - A member cannot earn from their own profile (if they somehow have one).
 *  - The member earns 10 coins per qualifying view.
 *  - A qualifying view = the frontend calls this endpoint after the member
 *    has stayed on the vendor profile page for 3 minutes.
 *  - The same member can earn again from the same vendor after another 3 minutes
 *    (i.e., 3 minutes must have passed since last_rewarded_at).
 */

const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const VendorProfileView = require('../models/VendorProfileView');
const User = require('../models/User');
const runMongoTransaction = require('../utils/runMongoTransaction');

const PROFILE_VIEW_REWARD = 10;          // Coins given to member per qualifying view
const COOLDOWN_MINUTES = 3;              // Minutes between rewards for the same vendor
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;

/**
 * POST /api/vendors/:vendorUserId/profile-view
 *
 * Call this from the frontend after a member has been on the vendor profile
 * page for 3+ minutes.
 *
 * @access Private (member only)
 */
exports.recordVendorProfileView = async (req, res) => {
  try {
    const viewerUserId = String(req.userId);
    const { vendorUserId } = req.params;

    // Validate vendorUserId
    if (!mongoose.Types.ObjectId.isValid(vendorUserId)) {
      return res.status(400).json({ success: false, message: 'Invalid vendorUserId' });
    }

    // Only members can earn
    const viewer = req.user;
    if (!viewer || viewer.role !== 'member') {
      return res.status(403).json({
        success: false,
        message: 'Only members can earn coins from vendor profile views',
      });
    }

    // Can't view your own profile (edge case guard)
    if (viewerUserId === vendorUserId) {
      return res.status(400).json({ success: false, message: 'Cannot earn coins from your own profile' });
    }

    // Verify the target is actually a vendor
    const vendorUser = await User.findById(vendorUserId).select('role').lean();
    if (!vendorUser || vendorUser.role !== 'vendor') {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    // Check cooldown — find existing record
    const existing = await VendorProfileView.findOne({
      viewer_user_id: viewerUserId,
      vendor_user_id: vendorUserId,
    }).lean();

    const now = new Date();

    if (existing && existing.last_rewarded_at) {
      const elapsed = now.getTime() - new Date(existing.last_rewarded_at).getTime();
      if (elapsed < COOLDOWN_MS) {
        const waitSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({
          success: false,
          message: `You can earn coins from this profile again in ${waitSeconds} seconds`,
          next_eligible_in_seconds: waitSeconds,
        });
      }
    }

    // All checks passed — reward the member
    let newBalance = 0;

    await runMongoTransaction({
      work: async (session) => {
        const vendorWallet = await Wallet.findOneAndUpdate(
          { user_id: vendorUserId, balance: { $gte: PROFILE_VIEW_REWARD } },
          { $inc: { balance: -PROFILE_VIEW_REWARD } },
          { new: true, session }
        );
        if (!vendorWallet) {
          const err = new Error('Vendor wallet has insufficient balance for profile view reward');
          err.statusCode = 400;
          throw err;
        }

        // Credit member wallet
        const wallet = await Wallet.findOneAndUpdate(
          { user_id: viewerUserId },
          { $inc: { balance: PROFILE_VIEW_REWARD } },
          { new: true, upsert: true, session }
        );
        newBalance = wallet.balance;

        // Record wallet transaction
        await WalletTransaction.create([
          {
            user_id: viewerUserId,
            type: 'VENDOR_PROFILE_VIEW_REWARD',
            amount: PROFILE_VIEW_REWARD,
            status: 'SUCCESS',
            description: `Earned ${PROFILE_VIEW_REWARD} coins for viewing vendor profile for ${COOLDOWN_MINUTES}+ minutes`,
          },
          {
            user_id: vendorUserId,
            type: 'VENDOR_PROFILE_VIEW_DEDUCTION',
            amount: -PROFILE_VIEW_REWARD,
            status: 'SUCCESS',
            description: `Vendor charged ${PROFILE_VIEW_REWARD} coins for profile view reward`,
          },
        ], { session });

        // Upsert the VendorProfileView record
        await VendorProfileView.findOneAndUpdate(
          { viewer_user_id: viewerUserId, vendor_user_id: vendorUserId },
          {
            $inc: { view_count: existing ? 1 : 0, total_coins_earned: PROFILE_VIEW_REWARD },
            $set: { last_rewarded_at: now },
            $setOnInsert: { view_count: 1 },
          },
          { upsert: true, new: true, session }
        );
      },
      fallback: async () => {
        const vendorWallet = await Wallet.findOneAndUpdate(
          { user_id: vendorUserId, balance: { $gte: PROFILE_VIEW_REWARD } },
          { $inc: { balance: -PROFILE_VIEW_REWARD } },
          { new: true }
        );
        if (!vendorWallet) {
          const err = new Error('Vendor wallet has insufficient balance for profile view reward');
          err.statusCode = 400;
          throw err;
        }

        const wallet = await Wallet.findOneAndUpdate(
          { user_id: viewerUserId },
          { $inc: { balance: PROFILE_VIEW_REWARD } },
          { new: true, upsert: true }
        );
        newBalance = wallet.balance;

        await WalletTransaction.create([
          {
            user_id: viewerUserId,
            type: 'VENDOR_PROFILE_VIEW_REWARD',
            amount: PROFILE_VIEW_REWARD,
            status: 'SUCCESS',
            description: `Earned ${PROFILE_VIEW_REWARD} coins for viewing vendor profile for ${COOLDOWN_MINUTES}+ minutes`,
          },
          {
            user_id: vendorUserId,
            type: 'VENDOR_PROFILE_VIEW_DEDUCTION',
            amount: -PROFILE_VIEW_REWARD,
            status: 'SUCCESS',
            description: `Vendor charged ${PROFILE_VIEW_REWARD} coins for profile view reward`,
          },
        ]);

        await VendorProfileView.findOneAndUpdate(
          { viewer_user_id: viewerUserId, vendor_user_id: vendorUserId },
          {
            $inc: { total_coins_earned: PROFILE_VIEW_REWARD },
            $set: { last_rewarded_at: now },
            $setOnInsert: { view_count: 1 },
          },
          { upsert: true, new: true }
        );
      },
    });

    res.json({
      success: true,
      message: `You earned ${PROFILE_VIEW_REWARD} coins for viewing this vendor's profile!`,
      coins_earned: PROFILE_VIEW_REWARD,
      wallet: {
        new_balance: newBalance,
        currency: 'Coins',
      },
    });
  } catch (err) {
    const status = err?.statusCode || 500;
    if (status !== 500) {
      return res.status(status).json({ success: false, message: err.message });
    }
    console.error('[recordVendorProfileView]', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
