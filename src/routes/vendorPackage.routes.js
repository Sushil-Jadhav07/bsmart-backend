'use strict';

const express      = require('express');
const router       = express.Router();
const auth         = require('../middleware/auth');
const requireRole  = require('../middleware/requireRole');

const {
  createPackage,
  updatePackage,
  deletePackage,
  adminListPackages,
  listPackages,
  getPackage,
  previewPackage,
  purchasePackage,
  getMyActivePackage,
  coinPreview,
  getMyPurchaseHistory,
  getMyTransactionHistory,
  adminListPurchases,
} = require('../controllers/vendorPackage.controller');

/**
 * @swagger
 * tags:
 *   - name: VendorPackages
 *     description: Vendor package purchase, coin allocation & transaction history
 */

// ─────────────────────────────────────────────────────────────
// IMPORTANT — route registration order matters in Express.
// Static paths (/admin/*, /my/*) MUST be registered BEFORE the
// dynamic path (/:packageId) — otherwise Express treats the
// words "admin" and "my" as a packageId value and the wrong
// handler fires every time.
// Order: admin routes → vendor/my routes → generic /:packageId
// ─────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────
// 1. Admin-only routes
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vendor-packages/admin:
 *   get:
 *     summary: List all packages for admin management
 *     tags: [VendorPackages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All packages, including inactive packages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *   post:
 *     summary: Create a new package (admin only)
 *     tags: [VendorPackages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - tier
 *               - ads_allowed_min
 *               - ads_allowed_max
 *               - base_price
 *               - discount_percent
 *               - coins_granted
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Premium"
 *               tier:
 *                 type: string
 *                 enum: [basic, standard, premium, enterprise]
 *                 example: "premium"
 *               ads_allowed_min:
 *                 type: number
 *                 example: 10
 *                 description: "Minimum number of ads allowed under this package"
 *               ads_allowed_max:
 *                 type: number
 *                 example: 25
 *                 description: "Maximum ads allowed. Use 999 for enterprise (20+)"
 *               base_price:
 *                 type: number
 *                 example: 100000
 *                 description: "Original price before discount in INR"
 *               discount_percent:
 *                 type: number
 *                 example: 80
 *                 description: "Discount percentage applied (0–100)"
 *               final_price:
 *                 type: number
 *                 example: 20000
 *                 description: "Final payable price in INR. Auto-calculated from base_price and discount_percent if not provided."
 *               coins_granted:
 *                 type: number
 *                 example: 0
 *                 description: "Coins instantly credited to vendor wallet on purchase"
 *               price_coins:
 *                 type: number
 *                 description: "Compatibility alias for base_price/final_price/coins_granted"
 *               is_active:
 *                 type: boolean
 *               validity_days:
 *                 type: number
 *                 example: 30
 *                 description: "Package validity in days from purchase date. 0 = never expires."
 *               description:
 *                 type: string
 *                 example: "Premium package with bonus coins on every ad budget"
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example:
 *                   - "10 to 25 ads allowed"
 *                   - "₹1 = 4 base coins on ad budget"
 *                   - "Bonus coins equal to selected ad budget"
 *     responses:
 *       201:
 *         description: Package created successfully
 *       400:
 *         description: Missing required fields
 */
router.get('/admin', auth, requireRole('admin'), adminListPackages);
router.post('/admin', auth, requireRole('admin'), createPackage);

/**
 * @swagger
 * /api/vendor-packages/admin/purchases:
 *   get:
 *     summary: List all vendor package purchases across all vendors (admin only)
 *     tags: [VendorPackages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: vendorId
 *         schema: { type: string }
 *         description: "Filter by a specific vendor's MongoDB ID"
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, expired, superseded] }
 *         description: "Filter by purchase status"
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of all purchase records
 */
router.get('/admin/purchases', auth, requireRole('admin'), adminListPurchases);

/**
 * @swagger
 * /api/vendor-packages/admin/{packageId}:
 *   put:
 *     summary: Update an existing package (admin only)
 *     tags: [VendorPackages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: "Send only the fields to update. final_price is auto-recalculated when base_price or discount_percent changes and final_price is not sent."
 *             properties:
 *               name:             { type: string }
 *               tier:             { type: string, enum: [basic, standard, premium, enterprise] }
 *               ads_allowed_min:  { type: number }
 *               ads_allowed_max:  { type: number }
 *               base_price:       { type: number }
 *               discount_percent: { type: number }
 *               final_price:      { type: number }
 *               coins_granted:    { type: number }
 *               price_coins:      { type: number }
 *               validity_days:    { type: number }
 *               description:      { type: string }
 *               features:         { type: array, items: { type: string } }
 *               is_active:        { type: boolean }
 *     responses:
 *       200:
 *         description: Package updated
 *       404:
 *         description: Package not found
 */
router.put('/admin/:packageId', auth, requireRole('admin'), updatePackage);

/**
 * @swagger
 * /api/vendor-packages/admin/{packageId}:
 *   patch:
 *     summary: Partially update an existing package (admin only)
 *     tags: [VendorPackages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:             { type: string }
 *               description:      { type: string }
 *               price_coins:      { type: number }
 *               features:         { type: array, items: { type: string } }
 *               is_active:        { type: boolean }
 *     responses:
 *       200:
 *         description: Package updated
 *       404:
 *         description: Package not found
 */
router.patch('/admin/:packageId', auth, requireRole('admin'), updatePackage);

/**
 * @swagger
 * /api/vendor-packages/admin/{packageId}:
 *   delete:
 *     summary: Deactivate a package (admin only)
 *     tags: [VendorPackages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Package deactivated — is_active set to false
 */
router.delete('/admin/:packageId', auth, requireRole('admin'), deletePackage);


// ─────────────────────────────────────────────────────────────
// 2. Vendor-only routes  (/my/*)
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vendor-packages/my/active:
 *   get:
 *     summary: Get vendor's currently active package
 *     tags: [VendorPackages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active package detail, or null if none purchased
 */
router.get('/my/active', auth, requireRole('vendor'), getMyActivePackage);

/**
 * @swagger
 * /api/vendor-packages/my/coin-preview:
 *   post:
 *     summary: Preview ad budget coin breakdown based on vendor's active package tier
 *     tags: [VendorPackages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [budget_inr]
 *             properties:
 *               budget_inr:
 *                 type: number
 *                 example: 10000
 *                 description: "Must be a multiple of 5000 between 5000 and 100000. Options: 5000, 10000, 15000 … 100000"
 *     responses:
 *       200:
 *         description: Coin breakdown
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               coin_breakdown:
 *                 paid_amount_inr: 10000
 *                 package_name: "Premium"
 *                 tier: "premium"
 *                 base_coins: 40000
 *                 additional_coins: 10000
 *                 total_coins: 50000
 *                 conversion_note: "₹1 = 4 base coins for vendors"
 *       400:
 *         description: Invalid budget amount or no active package
 */
router.post('/my/coin-preview', auth, requireRole('vendor'), coinPreview);

/**
 * @swagger
 * /api/vendor-packages/my/history:
 *   get:
 *     summary: Get vendor's package purchase history (paginated)
 *     tags: [VendorPackages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Paginated list of package purchases
 */
router.get('/my/history', auth, requireRole('vendor'), getMyPurchaseHistory);

/**
 * @swagger
 * /api/vendor-packages/my/transactions:
 *   get:
 *     summary: Get vendor's full wallet transaction history (paginated)
 *     tags: [VendorPackages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Current wallet balance + paginated transaction list
 */
router.get('/my/transactions', auth, requireRole('vendor'), getMyTransactionHistory);


// ─────────────────────────────────────────────────────────────
// 3. General authenticated routes  (/:packageId MUST be last)
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vendor-packages:
 *   get:
 *     summary: List all active packages
 *     tags: [VendorPackages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of active packages sorted by final_price ascending
 */
router.get('/', auth, listPackages);

/**
 * @swagger
 * /api/vendor-packages/{packageId}/preview:
 *   get:
 *     summary: Preview a package's full pricing and coin details before buying
 *     tags: [VendorPackages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Full package detail with pricing breakdown
 *       404:
 *         description: Package not found
 */
router.get('/:packageId/preview', auth, previewPackage);

/**
 * @swagger
 * /api/vendor-packages/{packageId}/buy:
 *   post:
 *     summary: Purchase a package (vendor only)
 *     tags: [VendorPackages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema: { type: string }
 *         description: "MongoDB _id of the package to purchase"
 *     responses:
 *       201:
 *         description: Purchase successful — coins credited to wallet
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Package purchased successfully"
 *               purchase:
 *                 purchase_id: "665f..."
 *                 package_name: "Premium"
 *                 tier: "premium"
 *                 ads_allowed_min: 10
 *                 ads_allowed_max: 25
 *                 base_price: 100000
 *                 discount_percent: 80
 *                 amount_paid: 20000
 *                 coins_credited: 0
 *                 expires_at: "2026-04-24T00:00:00.000Z"
 *                 wallet_balance: 0
 *       400:
 *         description: Validation error
 *       403:
 *         description: Not a vendor / vendor profile not found
 *       404:
 *         description: Package not found or inactive
 */
router.post('/:packageId/buy', auth, requireRole('vendor'), purchasePackage);

/**
 * @swagger
 * /api/vendor-packages/{packageId}:
 *   get:
 *     summary: Get a single package by ID
 *     tags: [VendorPackages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Package detail
 *       404:
 *         description: Not found
 */
router.get('/:packageId', auth, getPackage);

module.exports = router;
