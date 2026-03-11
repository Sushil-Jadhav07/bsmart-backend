const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const { getMyWallet, getAllWallets, getMemberWalletHistoryByUserId, getVendorWalletHistoryByUserId, getAdWalletHistory } = require('../controllers/wallet.controller');

/**
 * @swagger
 * tags:
 *   name: Wallet
 *   description: Wallet and transaction management
 */

/**
 * @swagger
 * /api/wallet/me:
 *   get:
 *     summary: Get my wallet balance and recent transactions
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet balance and transactions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 wallet:
 *                   type: object
 *                   properties:
 *                     balance:
 *                       type: number
 *                     currency:
 *                       type: string
 *                 transactions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/WalletTransaction'
 */
router.get('/me', auth, getMyWallet);

/**
 * @swagger
 * tags:
 *   name: Wallet History
 *   description: Wallet history lookup by user id (member/vendor)
 */

/**
 * @swagger
 * /api/wallet/member/{userId}/history:
 *   get:
 *     summary: Get member wallet balance and transaction history by userId
 *     tags: [Wallet History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Member user ID
 *     responses:
 *       200:
 *         description: Member wallet balance and transactions
 *       400:
 *         description: Invalid userId or user is not a member
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.get('/member/:userId/history', auth, getMemberWalletHistoryByUserId);

/**
 * @swagger
 * /api/wallet/vendor/{userId}/history:
 *   get:
 *     summary: Get vendor wallet balance and transaction history by userId
 *     tags: [Wallet History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor user ID
 *     responses:
 *       200:
 *         description: Vendor wallet balance and transactions
 *       400:
 *         description: Invalid userId or user is not a vendor
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.get('/vendor/:userId/history', auth, getVendorWalletHistoryByUserId);

/**
 * @swagger
 * tags:
 *   name: Ad Wallet History
 *   description: Transaction history for a specific advertisement (vendor owner or admin)
 */
/**
 * @swagger
 * /api/wallet/ads/{adId}/history:
 *   get:
 *     summary: Get transaction history for a specific ad
 *     tags: [Ad Wallet History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: adId
 *         required: true
 *         schema:
 *           type: string
 *         description: Advertisement ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter transactions from this date (ISO 8601)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter transactions until this date (ISO 8601)
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Comma-separated types (e.g. AD_LIKE_REWARD,AD_LIKE_DEDUCTION)
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Max transactions to return (1-200)
 *     responses:
 *       200:
 *         description: Ad transaction history with budget summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [ad_id, total_budget_coins, balance_left, total, transactions]
 *               properties:
 *                 ad_id:
 *                   type: string
 *                 total_budget_coins:
 *                   type: number
 *                   description: Total budget allocated when ad was created
 *                 balance_left:
 *                   type: number
 *                   description: Remaining budget (total_budget_coins - total_coins_spent)
 *                 total:
 *                   type: integer
 *                   description: Number of transactions in response
 *                 transactions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/WalletTransaction'
 *       400:
 *         description: Invalid adId, userId, or date parameters
 *       403:
 *         description: Forbidden (not ad owner or admin)
 *       404:
 *         description: Ad not found
 */
router.get('/ads/:adId/history', auth, getAdWalletHistory);

/**
 * @swagger
 * /api/wallet:
 *   get:
 *     summary: Get all wallets and transactions (Admin)
 *     tags: [Wallet, Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All transactions and summary (no pagination)
 */
router.get('/', auth, requireAdmin, getAllWallets);

/**
 * @swagger
 * components:
 *   schemas:
 *     WalletTransaction:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         user_id:
 *           oneOf:
 *             - type: string
 *             - type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 username:
 *                   type: string
 *                 full_name:
 *                   type: string
 *                 role:
 *                   type: string
 *                 avatar_url:
 *                   type: string
 *         vendor_id:
 *           type: string
 *         ad_id:
 *           oneOf:
 *             - type: string
 *             - type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 caption:
 *                   type: string
 *         type:
 *           type: string
 *         amount:
 *           type: number
 *         description:
 *           type: string
 *         status:
 *           type: string
 *         transactionDate:
 *           type: string
 *           format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         ui:
 *           type: object
 *           properties:
 *             title:
 *               type: string
 *             description:
 *               type: string
 *             direction:
 *               type: string
 *               enum: [credit, debit]
 *             amount:
 *               type: number
 *             created_at:
 *               type: string
 *               format: date-time
 *       example:
 *         _id: "69b1394f14031fbfa34b40dd"
 *         user_id:
 *           _id: "69b1373a6c8c363efb249490"
 *           username: "tech_supplies"
 *           full_name: "Arjun Mehta"
 *           role: "vendor"
 *           avatar_url: ""
 *         vendor_id: "69b1373a6c8c363efb249497"
 *         ad_id:
 *           _id: "69b138886e532a9f5d7d8edc"
 *           caption: "somethings"
 *         type: "AD_LIKE_DEDUCTION"
 *         amount: -10
 *         description: "Ad budget spent (like)"
 *         status: "SUCCESS"
 *         transactionDate: "2026-03-11T09:43:43.605Z"
 *         createdAt: "2026-03-11T09:43:43.605Z"
 *         updatedAt: "2026-03-11T09:43:43.605Z"
 *         ui:
 *           title: "Ad Like Deduction"
 *           description: "Ad budget spent (like)"
 *           direction: "debit"
 *           amount: -10
 *           created_at: "2026-03-11T09:43:43.605Z"
 */

module.exports = router;
