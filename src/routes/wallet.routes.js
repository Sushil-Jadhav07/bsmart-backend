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
 *         description: Wallet info + transactions
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
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member wallet history
 *       400:
 *         description: Not a member / invalid id
 *       403:
 *         description: Forbidden
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
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vendor wallet history
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
 *         schema:
 *           type: string
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
 *         description: Recharge successful, returns new balance
 *       400:
 *         description: Invalid amount or user is not a vendor
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
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Comma-separated types e.g. AD_LIKE_REWARD,AD_VIEW_DEDUCTION
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Ad budget + transaction breakdown
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
 *               amount:
 *                 type: number
 *                 description: Positive to credit, negative to debit
 *               type:
 *                 type: string
 *                 default: ADMIN_ADJUSTMENT
 *               description:
 *                 type: string
 */
router.post('/admin/adjust', auth, requireAdmin, updateWalletBalance);

module.exports = router;