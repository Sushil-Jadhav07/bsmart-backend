'use strict';

const mongoose = require('mongoose');
const Vendor                 = require('../models/Vendor');
const Wallet                 = require('../models/Wallet');
const WalletTransaction      = require('../models/WalletTransaction');
const VendorPackage          = require('../models/VendorPackage');
const VendorPackagePurchase  = require('../models/VendorPackagePurchase');
const runMongoTransaction    = require('../utils/runMongoTransaction');
const User                   = require('../models/User');
const {
  sendPackagePurchasedEmail,
  sendCoinsLowEmail,
} = require('./email.controller');

const LOW_COIN_THRESHOLD = 500;

const fireAndForget = (label, promise) => {
  promise.catch((err) => console.error(`[Email] ${label} failed:`, err.message));
};

// ─────────────────────────────────────────────────────────────
// Coin calculation helpers  (matches the user-story spec)
// ─────────────────────────────────────────────────────────────

const VENDOR_COIN_RATE = 4; // ₹1 = 4 coins for vendors

/**
 * Calculate coins for a given ad budget based on active package tier.
 *
 *   basic / standard     → base coins only (budget × 4)
 *   premium / enterprise → base coins + additional coins equal to budget amount
 *
 * Example (Premium, ₹10,000 budget):
 *   base       = 10,000 × 4 = 40,000
 *   additional = 10,000
 *   total      = 50,000
 */
const calcAdBudgetCoins = (budgetINR, tier) => {
  const baseCoins       = budgetINR * VENDOR_COIN_RATE;
  const additionalCoins = (tier === 'premium' || tier === 'enterprise') ? budgetINR : 0;
  return { baseCoins, additionalCoins, totalCoins: baseCoins + additionalCoins };
};

/**
 * Auto-calculate final_price from base_price and discount_percent
 * if final_price is not explicitly provided.
 */
const computeFinalPrice = (basePrice, discountPercent) => {
  return Math.round(basePrice - (basePrice * discountPercent / 100));
};

// ─────────────────────────────────────────────────────────────
// Admin: Create a package
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/vendor-packages/admin
 *
 * Body: {
 *   name, tier,
 *   ads_allowed_min, ads_allowed_max,
 *   base_price, discount_percent, final_price (optional — auto-calculated if omitted),
 *   coins_granted, validity_days, description, features
 * }
 */
exports.createPackage = async (req, res) => {
  try {
    const {
      name,
      tier,
      ads_allowed_min,
      ads_allowed_max,
      base_price,
      discount_percent,
      final_price,
      coins_granted,
      validity_days,
      description,
      features,
    } = req.body;

    if (!name || !tier || base_price == null || coins_granted == null ||
        ads_allowed_min == null || ads_allowed_max == null) {
      return res.status(400).json({
        success: false,
        message: 'name, tier, ads_allowed_min, ads_allowed_max, base_price and coins_granted are required',
      });
    }

    const discount = discount_percent ?? 0;
    // Use provided final_price or auto-calculate from base_price and discount
    const resolvedFinalPrice = (final_price != null)
      ? final_price
      : computeFinalPrice(base_price, discount);

    const pkg = await VendorPackage.create({
      name,
      tier,
      ads_allowed_min,
      ads_allowed_max,
      base_price,
      discount_percent: discount,
      final_price: resolvedFinalPrice,
      coins_granted,
      validity_days: validity_days ?? 30,
      description: description ?? '',
      features: features ?? [],
    });

    return res.status(201).json({ success: true, message: 'Package created', package: pkg });
  } catch (err) {
    console.error('createPackage:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// Admin: Update a package
// ─────────────────────────────────────────────────────────────

/**
 * PUT /api/vendor-packages/admin/:packageId
 * Send only the fields you want to update.
 * If base_price or discount_percent changes and final_price is not sent,
 * final_price is auto-recalculated.
 */
exports.updatePackage = async (req, res) => {
  try {
    const { packageId } = req.params;
    const updates = { ...req.body };

    // Auto-recalculate final_price if pricing fields changed but final_price not supplied
    if ((updates.base_price != null || updates.discount_percent != null) && updates.final_price == null) {
      const existing = await VendorPackage.findById(packageId);
      if (!existing) return res.status(404).json({ success: false, message: 'Package not found' });
      const bp = updates.base_price       ?? existing.base_price;
      const dp = updates.discount_percent ?? existing.discount_percent;
      updates.final_price = computeFinalPrice(bp, dp);
    }

    const pkg = await VendorPackage.findByIdAndUpdate(packageId, updates, { new: true, runValidators: true });
    if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

    return res.json({ success: true, message: 'Package updated', package: pkg });
  } catch (err) {
    console.error('updatePackage:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// Admin: Deactivate a package
// ─────────────────────────────────────────────────────────────

/**
 * DELETE /api/vendor-packages/admin/:packageId
 */
exports.deletePackage = async (req, res) => {
  try {
    const pkg = await VendorPackage.findByIdAndUpdate(
      req.params.packageId,
      { is_active: false },
      { new: true }
    );
    if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
    return res.json({ success: true, message: 'Package deactivated' });
  } catch (err) {
    console.error('deletePackage:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// Public / Vendor: List all active packages
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/vendor-packages
 */
exports.listPackages = async (req, res) => {
  try {
    const packages = await VendorPackage.find({ is_active: true }).sort({ final_price: 1 });
    return res.json({ success: true, packages });
  } catch (err) {
    console.error('listPackages:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/vendor-packages/:packageId
 */
exports.getPackage = async (req, res) => {
  try {
    const pkg = await VendorPackage.findById(req.params.packageId);
    if (!pkg || !pkg.is_active) return res.status(404).json({ success: false, message: 'Package not found' });
    return res.json({ success: true, package: pkg });
  } catch (err) {
    console.error('getPackage:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// Vendor: Preview package before buying
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/vendor-packages/:packageId/preview
 */
exports.previewPackage = async (req, res) => {
  try {
    const pkg = await VendorPackage.findById(req.params.packageId);
    if (!pkg || !pkg.is_active) return res.status(404).json({ success: false, message: 'Package not found' });

    return res.json({
      success: true,
      preview: {
        package_name:      pkg.name,
        tier:              pkg.tier,
        ads_allowed_min:   pkg.ads_allowed_min,
        ads_allowed_max:   pkg.ads_allowed_max,
        base_price:        pkg.base_price,
        discount_percent:  pkg.discount_percent,
        final_price:       pkg.final_price,
        coins_granted:     pkg.coins_granted,
        validity_days:     pkg.validity_days,
        description:       pkg.description,
        features:          pkg.features,
      },
    });
  } catch (err) {
    console.error('previewPackage:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// Vendor: Purchase a package
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/vendor-packages/:packageId/buy
 *
 * Flow:
 *  1. Validate vendor & package
 *  2. Mark any existing active purchase as 'superseded'
 *  3. Create new VendorPackagePurchase (uses final_price as amount_paid)
 *  4. Credit coins_granted to vendor wallet
 *  5. Log WalletTransaction (VENDOR_PACKAGE_PURCHASE)
 *  6. Update Vendor.credits and Vendor.credits_expires_at
 */
exports.purchasePackage = async (req, res) => {
  try {
    const userId    = req.user._id;
    const { packageId } = req.params;

    const pkg = await VendorPackage.findById(packageId);
    if (!pkg || !pkg.is_active) {
      return res.status(404).json({ success: false, message: 'Package not found or inactive' });
    }

    const vendor = await Vendor.findOne({ user_id: userId, isDeleted: false });
    if (!vendor) {
      return res.status(403).json({ success: false, message: 'Vendor profile not found' });
    }

    const now = new Date();
    const expiresAt = pkg.validity_days > 0
      ? new Date(now.getTime() + pkg.validity_days * 24 * 60 * 60 * 1000)
      : null;

    // Ensure coins_granted is always a clean integer — never NaN or undefined
    const coinsToCredit = Math.max(0, Number(pkg.coins_granted) || 0);

    const result = await runMongoTransaction({
      work: async (session) => {
        await VendorPackagePurchase.updateMany(
          { vendor_id: vendor._id, status: 'active' },
          { $set: { status: 'superseded' } },
          { session }
        );

        const [purchase] = await VendorPackagePurchase.create(
          [{
            vendor_id: vendor._id,
            user_id:   userId,
            package_id: pkg._id,
            package_snapshot: {
              name:             pkg.name,
              tier:             pkg.tier,
              ads_allowed_min:  pkg.ads_allowed_min,
              ads_allowed_max:  pkg.ads_allowed_max,
              base_price:       pkg.base_price,
              discount_percent: pkg.discount_percent,
              final_price:      pkg.final_price,
              coins_granted:    coinsToCredit,
              validity_days:    pkg.validity_days,
            },
            amount_paid:    pkg.final_price,
            coins_credited: coinsToCredit,
            purchased_at:   now,
            expires_at:     expiresAt,
            status:         'active',
          }],
          { session }
        );

        // Use $inc for atomic wallet credit — avoids read-modify-save race condition
        const wallet = await Wallet.findOneAndUpdate(
          { user_id: userId },
          { $inc: { balance: coinsToCredit } },
          { new: true, upsert: true, session }
        );

        await WalletTransaction.create(
          [{
            user_id:     userId,
            vendor_id:   vendor._id,
            type:        'VENDOR_PACKAGE_PURCHASE',
            amount:      coinsToCredit,
            description: `Package purchased: ${pkg.name} (${pkg.tier}) — ₹${pkg.final_price} | ${coinsToCredit} coins credited`,
            status:      'SUCCESS',
            transactionDate: now,
          }],
          { session }
        );

        // Sync vendor.credits snapshot
        await Vendor.findByIdAndUpdate(
          vendor._id,
          { $set: { credits: wallet.balance, credits_expires_at: expiresAt } },
          { session }
        );

        return { purchase, wallet };
      },

      fallback: async () => {
        // Non-transactional fallback (standalone MongoDB / local dev without replica set)
        await VendorPackagePurchase.updateMany(
          { vendor_id: vendor._id, status: 'active' },
          { $set: { status: 'superseded' } }
        );

        const purchase = await VendorPackagePurchase.create({
          vendor_id: vendor._id, user_id: userId, package_id: pkg._id,
          package_snapshot: {
            name: pkg.name, tier: pkg.tier,
            ads_allowed_min: pkg.ads_allowed_min, ads_allowed_max: pkg.ads_allowed_max,
            base_price: pkg.base_price, discount_percent: pkg.discount_percent,
            final_price: pkg.final_price, coins_granted: coinsToCredit,
            validity_days: pkg.validity_days,
          },
          amount_paid: pkg.final_price, coins_credited: coinsToCredit,
          purchased_at: now, expires_at: expiresAt, status: 'active',
        });

        // Atomic $inc — no race condition, creates wallet if missing
        const wallet = await Wallet.findOneAndUpdate(
          { user_id: userId },
          { $inc: { balance: coinsToCredit } },
          { new: true, upsert: true }
        );

        await WalletTransaction.create({
          user_id: userId, vendor_id: vendor._id,
          type: 'VENDOR_PACKAGE_PURCHASE', amount: coinsToCredit,
          description: `Package purchased: ${pkg.name} (${pkg.tier}) — ₹${pkg.final_price} | ${coinsToCredit} coins credited`,
          status: 'SUCCESS', transactionDate: now,
        });

        // Sync vendor.credits snapshot
        await Vendor.findByIdAndUpdate(
          vendor._id,
          { $set: { credits: wallet.balance, credits_expires_at: expiresAt } }
        );

        return { purchase, wallet };
      },
    });

    const user = await User.findById(userId).select('email full_name username').lean();
    if (user?.email) {
      fireAndForget(
        'Package purchased email',
        sendPackagePurchasedEmail({
          email: user.email,
          full_name: user.full_name || user.username,
          company_name: vendor.company_details?.company_name || vendor.business_name,
          package_name: pkg.name,
          tier: pkg.tier,
          final_price: pkg.final_price,
          coins_granted: coinsToCredit,
          validity_days: pkg.validity_days,
          expires_at: expiresAt,
        })
      );

      if (Number(result.wallet?.balance || 0) <= LOW_COIN_THRESHOLD) {
        fireAndForget(
          'Coins low email',
          sendCoinsLowEmail({
            email: user.email,
            full_name: user.full_name || user.username,
            current_balance: result.wallet.balance,
            threshold: LOW_COIN_THRESHOLD,
          })
        );
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Package purchased successfully',
      purchase: {
        purchase_id:      result.purchase._id,
        package_name:     pkg.name,
        tier:             pkg.tier,
        ads_allowed_min:  pkg.ads_allowed_min,
        ads_allowed_max:  pkg.ads_allowed_max,
        base_price:       pkg.base_price,
        discount_percent: pkg.discount_percent,
        amount_paid:      pkg.final_price,
        coins_credited:   coinsToCredit,
        expires_at:       expiresAt,
        wallet_balance:   result.wallet.balance,
      },
    });
  } catch (err) {
    console.error('purchasePackage:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// Vendor: Get my active package
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/vendor-packages/my/active
 */
exports.getMyActivePackage = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ user_id: req.user._id, isDeleted: false });
    if (!vendor) return res.status(403).json({ success: false, message: 'Vendor profile not found' });

    const purchase = await VendorPackagePurchase.findOne({
      vendor_id: vendor._id,
      status: 'active',
    }).populate('package_id');

    if (!purchase) {
      return res.json({ success: true, active_package: null, message: 'No active package' });
    }

    return res.json({
      success: true,
      active_package: {
        purchase_id:    purchase._id,
        package:        purchase.package_id,
        amount_paid:    purchase.amount_paid,
        coins_credited: purchase.coins_credited,
        purchased_at:   purchase.purchased_at,
        expires_at:     purchase.expires_at,
        status:         purchase.status,
      },
    });
  } catch (err) {
    console.error('getMyActivePackage:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// Vendor: Ad budget coin preview
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/vendor-packages/my/coin-preview
 * Body: { budget_inr: 10000 }
 *
 * Budget options: 5000, 10000, 15000 … 100000 (steps of 5000)
 */
exports.coinPreview = async (req, res) => {
  try {
    const { budget_inr } = req.body;

    if (!budget_inr || budget_inr < 5000 || budget_inr > 100000 || budget_inr % 5000 !== 0) {
      return res.status(400).json({
        success: false,
        message: 'budget_inr must be a multiple of 5000 between 5000 and 100000',
      });
    }

    const vendor = await Vendor.findOne({ user_id: req.user._id, isDeleted: false });
    if (!vendor) return res.status(403).json({ success: false, message: 'Vendor profile not found' });

    const activePurchase = await VendorPackagePurchase.findOne({
      vendor_id: vendor._id,
      status: 'active',
    }).populate('package_id', 'tier name');

    if (!activePurchase) {
      return res.status(400).json({
        success: false,
        message: 'You must have an active package before calculating ad budget coins',
      });
    }

    const tier = activePurchase.package_id.tier;
    const { baseCoins, additionalCoins, totalCoins } = calcAdBudgetCoins(budget_inr, tier);

    return res.json({
      success: true,
      coin_breakdown: {
        paid_amount_inr:   budget_inr,
        package_name:      activePurchase.package_id.name,
        tier,
        base_coins:        baseCoins,
        additional_coins:  additionalCoins,
        total_coins:       totalCoins,
        conversion_note:   '₹1 = 4 base coins for vendors',
      },
    });
  } catch (err) {
    console.error('coinPreview:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// Vendor: Package purchase history
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/vendor-packages/my/history?page=1&limit=10
 */
exports.getMyPurchaseHistory = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ user_id: req.user._id, isDeleted: false });
    if (!vendor) return res.status(403).json({ success: false, message: 'Vendor profile not found' });

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip  = (page - 1) * limit;

    const [purchases, total] = await Promise.all([
      VendorPackagePurchase.find({ vendor_id: vendor._id })
        .populate('package_id')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      VendorPackagePurchase.countDocuments({ vendor_id: vendor._id }),
    ]);

    return res.json({
      success: true,
      total,
      page,
      total_pages: Math.ceil(total / limit),
      purchases,
    });
  } catch (err) {
    console.error('getMyPurchaseHistory:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// Vendor: Wallet transaction history
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/vendor-packages/my/transactions?page=1&limit=20
 */
exports.getMyTransactionHistory = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const DEBIT_TYPES = new Set([
      'AD_VIEW_DEDUCTION', 'AD_LIKE_DEDUCTION', 'AD_LIKE_REWARD_REVERSAL',
      'AD_COMMENT_DEDUCTION', 'AD_REPLY_DEDUCTION', 'AD_SAVE_DEDUCTION',
      'AD_BUDGET_DEDUCTION', 'VENDOR_PROFILE_VIEW_DEDUCTION',
    ]);

    const [transactions, total, wallet] = await Promise.all([
      WalletTransaction.find({ user_id: req.user._id })
        .populate('ad_id', 'caption')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      WalletTransaction.countDocuments({ user_id: req.user._id }),
      Wallet.findOne({ user_id: req.user._id }),
    ]);

    const enriched = transactions.map((t) => {
      const rawAmount = Number(t.amount ?? 0);
      const isDebit   = DEBIT_TYPES.has(t.type);
      const amount    = rawAmount > 0 && isDebit ? -rawAmount : rawAmount;
      return {
        _id:         t._id,
        type:        t.type,
        amount,
        direction:   amount >= 0 ? 'credit' : 'debit',
        description: t.description,
        status:      t.status,
        ad:          t.ad_id ? { _id: t.ad_id._id, caption: t.ad_id.caption } : null,
        created_at:  t.createdAt,
      };
    });

    return res.json({
      success: true,
      wallet_balance: wallet?.balance ?? 0,
      total,
      page,
      total_pages: Math.ceil(total / limit),
      transactions: enriched,
    });
  } catch (err) {
    console.error('getMyTransactionHistory:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// Admin: List all purchases across all vendors
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/vendor-packages/admin/purchases?vendorId=&status=&page=1&limit=20
 */
exports.adminListPurchases = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.vendorId) filter.vendor_id = req.query.vendorId;
    if (req.query.status)   filter.status    = req.query.status;

    const [purchases, total] = await Promise.all([
      VendorPackagePurchase.find(filter)
        .populate('vendor_id', 'business_name')
        .populate('user_id',   'email username')
        .populate('package_id')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      VendorPackagePurchase.countDocuments(filter),
    ]);

    return res.json({ success: true, total, page, total_pages: Math.ceil(total / limit), purchases });
  } catch (err) {
    console.error('adminListPurchases:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
