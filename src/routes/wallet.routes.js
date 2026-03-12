'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const {
  getMyWallet,
  getAllWallets,
  getMemberWalletHistory,
  getVendorWalletHistory,
  getAdWalletHistory,
  rechargeVendorWallet,
  updateWalletBalance,
} = require('../controllers/wallet.controller');

/**
 * @swagger
 * tags:
 *   - name: Wallet
 *     description: Wallet balance and transaction history
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:      { type: boolean }
 *                 wallet:
 *                   type: object
 *                   properties:
 *                     balance:  { type: number }
 *                     currency: { type: string }
 *                 total:        { type: integer }
 *                 transactions: { type: array, items: { $ref: '#/components/schemas/Transaction' } }
 */
router.get('/me', auth, getMyWallet);

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
 *         description: Member's user ID
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100, maximum: 500 }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *         description: Comma-separated transaction types to filter (e.g. AD_VIEW_REWARD,AD_LIKE_REWARD)
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
 *         description: Member wallet history with summary stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 user:
 *                   type: object
 *                   properties:
 *                     _id:        { type: string }
 *                     username:   { type: string }
 *                     full_name:  { type: string }
 *                     avatar_url: { type: string }
 *                     role:       { type: string }
 *                 wallet:
 *                   type: object
 *                   properties:
 *                     balance:  { type: number }
 *                     currency: { type: string }
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total_earned:        { type: number }
 *                     total_deducted:      { type: number }
 *                     total_transactions:  { type: integer }
 *                     earnings_by_type:    { type: object }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     page:  { type: integer }
 *                     limit: { type: integer }
 *                     pages: { type: integer }
 *                 transactions: { type: array, items: { $ref: '#/components/schemas/Transaction' } }
 *       400:
 *         description: Not a member / invalid id
 *       403:
 *         description: Forbidden – must be admin or the user themselves
 *       404:
 *         description: User not found
 */
router.get('/member/:userId/history', auth, getMemberWalletHistory);

// ──────────────────────────────────────────────
// Vendor history + recharge
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/wallet/vendor/{userId}/history:
 *   get:
 *     summary: Get a vendor's wallet history (credits, ad budget deductions, refunds)
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
 *         schema: { type: integer, default: 100, maximum: 500 }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *         description: Filter by transaction type(s), comma-separated
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Vendor wallet history with ad budget summary
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
 *                     total_credited:             { type: number }
 *                     total_debited:              { type: number }
 *                     total_transactions:         { type: integer }
 *                     total_ads_created:          { type: integer }
 *                     total_ad_budget_allocated:  { type: number }
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
 *     summary: Recharge a vendor's wallet with coins (Admin only)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *         description: Vendor's user ID
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
 *                 description: Number of coins to add (must be > 0)
 *               description:
 *                 type: string
 *                 description: Optional note about the recharge
 *     responses:
 *       200:
 *         description: Recharge successful, returns new balance + transaction record
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
 *         description: Comma-separated types e.g. AD_LIKE_REWARD,AD_VIEW_DEDUCTION
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *         description: Filter transactions by a specific user
 *     responses:
 *       200:
 *         description: Ad budget breakdown + full per-action coin stats + transactions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 ad:
 *                   type: object
 *                   properties:
 *                     _id:     { type: string }
 *                     caption: { type: string }
 *                     status:  { type: string }
 *                 budget:
 *                   type: object
 *                   properties:
 *                     total_budget_coins:  { type: number }
 *                     total_coins_spent:   { type: number }
 *                     balance_remaining:   { type: number }
 *                     spent_percentage:    { type: number }
 *                 actions:
 *                   type: object
 *                   properties:
 *                     views:    { type: object, properties: { count: { type: integer }, total_coins: { type: number } } }
 *                     likes:    { type: object, properties: { count: { type: integer }, total_coins: { type: number } } }
 *                     comments: { type: object, properties: { count: { type: integer }, total_coins: { type: number } } }
 *                     replies:  { type: object, properties: { count: { type: integer }, total_coins: { type: number } } }
 *                     saves:    { type: object, properties: { count: { type: integer }, total_coins: { type: number } } }
 *                     refunds:  { type: object, properties: { count: { type: integer }, total_coins: { type: number } } }
 *                 unique_users: { type: integer }
 *                 pagination: { type: object }
 *                 transactions: { type: array, items: { $ref: '#/components/schemas/Transaction' } }
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
 *     description: >
 *       Returns platform-wide transaction log with pagination + filtering,
 *       plus a complete list of all user wallets with balances and stats,
 *       plus a high-level platform summary (coins minted, ad spend, etc.)
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
 *         description: Comma-separated transaction types
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [member, vendor, all] }
 *         description: Filter transactions + wallet list by user role
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *         description: Filter by a specific user ID
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: direction
 *         schema: { type: string, enum: [credit, debit, all] }
 *         description: Filter by credit (amount > 0) or debit (amount < 0)
 *     responses:
 *       200:
 *         description: Full platform wallet data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total_transactions:           { type: integer }
 *                     total_coins_minted:           { type: number }
 *                     total_coins_from_ads:         { type: number }
 *                     total_coins_from_reels:       { type: number }
 *                     total_ad_coins_spent:         { type: number }
 *                     total_vendor_coins_recharged: { type: number }
 *                     total_wallets:                { type: integer }
 *                     member_wallets:               { type: integer }
 *                     vendor_wallets:               { type: integer }
 *                 wallets:
 *                   type: array
 *                   description: All user wallets sorted by balance descending
 *                   items:
 *                     type: object
 *                     properties:
 *                       wallet_id:      { type: string }
 *                       user:           { type: object }
 *                       balance:        { type: number }
 *                       currency:       { type: string }
 *                       tx_count:       { type: integer }
 *                       total_credited: { type: number }
 *                       total_debited:  { type: number }
 *                       last_tx_at:     { type: string, format: date-time }
 *                 pagination: { type: object }
 *                 transactions:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Transaction' }
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
 *               userId:
 *                 type: string
 *                 description: Target user's ID
 *               amount:
 *                 type: number
 *                 description: Positive to credit, negative to debit
 *               type:
 *                 type: string
 *                 default: ADMIN_ADJUSTMENT
 *               description:
 *                 type: string
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
 *         ad:
 *           type: object
 *           nullable: true
 *           properties:
 *             _id:   { type: string }
 *             title: { type: string }
 *         user:
 *           type: object
 *           properties:
 *             _id:       { type: string }
 *             username:  { type: string }
 *             full_name: { type: string }
 *             role:      { type: string }
 *             avatar_url: { type: string }
 *         created_at: { type: string, format: date-time }
 */

module.exports = router;