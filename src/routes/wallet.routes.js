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
 *         description: ISO date string
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *         description: ISO date string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Comma-separated transaction types
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by a specific userId
 *     responses:
 *       200:
 *         description: Ad transaction history
 *       400:
 *         description: Invalid parameters
 *       403:
 *         description: Forbidden
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

module.exports = router;
