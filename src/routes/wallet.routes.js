'use strict';

const express = require('express');
const router  = express.Router();
const auth         = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const {
  getMyWallet,
  getAllWallets,
  getMemberWalletHistory,
  getVendorWalletHistory,
  getAdWalletHistory,
  rechargeVendorWallet,
  rechargeWallet,
  getMyRechargeHistory,
  getVendorRechargeHistory,
  updateWalletBalance,
} = require('../controllers/wallet.controller');

/**
 * @swagger
 * tags:
 *   - name: Wallet
 *     description: Wallet balance, recharge, and transaction history
 */

// ──────────────────────────────────────────────
// Self
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/wallet/me:
 *   get:
 *     summary: Get my own wallet balance and recent transactions
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns wallet balance + last 50 transactions
 */
router.get('/me', auth, getMyWallet);

// ──────────────────────────────────────────────
// Vendor self-recharge
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/wallet/recharge:
 *   post:
 *     summary: Vendor self-recharge — converts rupee amount to coins based on active package tier
 *     description: |
 *       **Coin formula:**
 *       - Basic / Standard package (or no active package): `recharge_amount × 4`
 *       - Premium / Enterprise package: `recharge_amount × 4 + recharge_amount`
 *
 *       Example: recharge_amount = 1000
 *         - Basic → 1000 × 4 = **4000 coins**
 *         - Premium → 1000 × 4 + 1000 = **5000 coins**
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recharge_amount]
 *             properties:
 *               recharge_amount:
 *                 type: number
 *                 description: Amount in rupees to recharge (must be > 0)
 *                 example: 1000
 *     responses:
 *       200:
 *         description: Wallet recharged successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:       { type: boolean }
 *                 message:       { type: string }
 *                 recharge:
 *                   type: object
 *                   properties:
 *                     recharge_amount: { type: number }
 *                     coins_credited:  { type: number }
 *                     package_tier:    { type: string, example: "premium" }
 *                     package_name:    { type: string }
 *                     formula:         { type: string, example: "1000 × 4 + 1000 = 5000 coins" }
 *                 wallet:
 *                   type: object
 *                   properties:
 *                     user_id:     { type: string }
 *                     new_balance: { type: number }
 *                     currency:    { type: string }
 *       400:
 *         description: Invalid recharge_amount
 *       403:
 *         description: Only vendors can recharge
 *       404:
 *         description: User not found
 */
router.post('/recharge', auth, rechargeWallet);

// ──────────────────────────────────────────────
// Recharge history
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/wallet/recharge/history:
 *   get:
 *     summary: Get the logged-in vendor's own recharge history
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 500 }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *         description: Filter from date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *         description: Filter to date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Vendor's recharge history with summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 user:    { type: object }
 *                 wallet:
 *                   type: object
 *                   properties:
 *                     balance:  { type: number }
 *                     currency: { type: string }
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total_recharged_coins: { type: number }
 *                     total_transactions:    { type: integer }
 *                 pagination: { type: object }
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:         { type: string }
 *                       type:        { type: string }
 *                       label:       { type: string }
 *                       amount:      { type: number }
 *                       direction:   { type: string }
 *                       description: { type: string }
 *                       status:      { type: string }
 *                       created_at:  { type: string, format: date-time }
 *       403:
 *         description: Only vendors have recharge history
 */
router.get('/recharge/history', auth, getMyRechargeHistory);

/**
 * @swagger
 * /api/wallet/recharge/history/{userId}:
 *   get:
 *     summary: Get any vendor's recharge history (Admin only)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *         description: Vendor's user ID
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 500 }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Vendor recharge history
 *       400:
 *         description: User is not a vendor / invalid id
 *       403:
 *         description: Forbidden – admin only
 *       404:
 *         description: User not found
 */
router.get('/recharge/history/:userId', auth, requireAdmin, getVendorRechargeHistory);

// ──────────────────────────────────────────────
// Member history
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/wallet/member/{userId}/history:
 *   get:
 *     summary: Get a member's wallet history (rewards earned from ads)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100, maximum: 500 }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Member wallet history with summary stats
 *       400:
 *         description: Not a member / invalid id
 *       403:
 *         description: Forbidden – must be admin or the user themselves
 *       404:
 *         description: User not found
 */
router.get('/member/:userId/history', auth, getMemberWalletHistory);

// ──────────────────────────────────────────────
// Vendor history + admin recharge
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/wallet/vendor/{userId}/history:
 *   get:
 *     summary: Get a vendor's wallet history (credits, recharges, ad budget deductions, refunds)
 *     description: |
 *       Returns all vendor wallet transaction types including **VENDOR_RECHARGE**.
 *       The `summary.recharge` block shows aggregated recharge stats:
 *       - `total_recharge_count` – number of recharges
 *       - `total_recharged_coins` – total coins credited via recharge
 *       - `last_recharge_at` – timestamp of most recent recharge
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100, maximum: 500 }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *         description: Filter by type e.g. VENDOR_RECHARGE or AD_BUDGET_DEDUCTION
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Vendor wallet history with recharge summary section
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 user:    { type: object }
 *                 wallet:
 *                   type: object
 *                   properties:
 *                     balance:  { type: number }
 *                     currency: { type: string }
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total_credited:            { type: number }
 *                     total_debited:             { type: number }
 *                     total_transactions:        { type: integer }
 *                     total_ads_created:         { type: integer }
 *                     total_ad_budget_allocated: { type: number }
 *                     recharge:
 *                       type: object
 *                       properties:
 *                         total_recharge_count:  { type: integer }
 *                         total_recharged_coins: { type: number }
 *                         last_recharge_at:      { type: string, format: date-time, nullable: true }
 *                 pagination: { type: object }
 *                 transactions: { type: array, items: { $ref: '#/components/schemas/Transaction' } }
 *       400:
 *         description: User is not a vendor / invalid id
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.get('/vendor/:userId/history', auth, getVendorWalletHistory);

/**
 * @swagger
 * /api/wallet/vendor/{userId}/recharge:
 *   post:
 *     summary: Directly credit a vendor's wallet with coins (Admin only — no formula applied)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Number of coins to add directly (no formula)
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Recharge successful
 *       400:
 *         description: Invalid amount or user is not a vendor
 *       403:
 *         description: Forbidden – admin only
 *       404:
 *         description: User not found
 */
router.post('/vendor/:userId/recharge', auth, requireAdmin, rechargeVendorWallet);

// ──────────────────────────────────────────────
// Ad history
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/wallet/ads/{adId}/history:
 *   get:
 *     summary: Get transaction history for a specific ad (vendor owner or admin)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: adId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Ad budget breakdown + per-action coin stats + transactions
 *       403:
 *         description: Forbidden – must be the ad owner or admin
 *       404:
 *         description: Ad not found
 */
router.get('/ads/:adId/history', auth, getAdWalletHistory);

// ──────────────────────────────────────────────
// Admin — all wallets + balance adjustment
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/wallet:
 *   get:
 *     summary: Get all wallet transactions (Admin only)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [member, vendor, all] }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: direction
 *         schema: { type: string, enum: [credit, debit, all] }
 *     responses:
 *       200:
 *         description: Full platform wallet data
 *       403:
 *         description: Forbidden – admin only
 */
router.get('/', auth, requireAdmin, getAllWallets);

/**
 * @swagger
 * /api/wallet/admin/adjust:
 *   post:
 *     summary: Manually credit or debit any user's wallet (Admin only)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, amount, type]
 *             properties:
 *               userId:      { type: string }
 *               amount:      { type: number, description: "Positive to credit, negative to debit" }
 *               type:        { type: string, default: ADMIN_ADJUSTMENT }
 *               description: { type: string }
 *     responses:
 *       200:
 *         description: Wallet adjusted successfully
 *       400:
 *         description: Missing fields or invalid amount
 *       403:
 *         description: Forbidden – admin only
 */
router.post('/admin/adjust', auth, requireAdmin, updateWalletBalance);

/**
 * @swagger
 * components:
 *   schemas:
 *     Transaction:
 *       type: object
 *       properties:
 *         _id:         { type: string }
 *         type:        { type: string }
 *         amount:      { type: number, description: "Signed — negative means debit" }
 *         direction:   { type: string, enum: [credit, debit] }
 *         label:       { type: string }
 *         description: { type: string }
 *         status:      { type: string, enum: [SUCCESS, FAILED] }
 *         ad:          { type: object, nullable: true }
 *         user:        { type: object }
 *         created_at:  { type: string, format: date-time }
 */

module.exports = router;