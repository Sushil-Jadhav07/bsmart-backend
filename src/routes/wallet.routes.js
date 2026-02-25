const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const { getMyWallet, getAllWallets } = require('../controllers/wallet.controller');

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
 * /api/wallet:
 *   get:
 *     summary: Get all wallets and transactions (Admin)
 *     tags: [Wallet, Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated transactions and summary
 */
router.get('/', auth, requireAdmin, getAllWallets);

module.exports = router;
