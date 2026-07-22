'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const {
  createGiftCard,
  getAllGiftCards,
  updateGiftCard,
  getActiveGiftCards,
  getGiftCardById,
} = require('../controllers/giftCard.controller');

/**
 * @swagger
 * tags:
 *   - name: GiftCards
 *     description: In-house gift card catalog — members redeem coins for these
 */

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — registered before "/:id" so "/active" is matched first
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/gift-cards/active:
 *   get:
 *     summary: List active gift cards (public — used by the frontend/app)
 *     tags: [GiftCards]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *         description: Filter by category
 *     responses:
 *       200:
 *         description: List of active gift cards
 */
router.get('/active', getActiveGiftCards);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN / SALES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/gift-cards:
 *   get:
 *     summary: List all gift cards, any status (admin, sales)
 *     tags: [GiftCards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: card_status
 *         schema: { type: string, enum: [active, inactive, draft] }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: All gift cards
 *   post:
 *     summary: Create a gift card (admin, sales)
 *     tags: [GiftCards]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, vendor, denominations]
 *             properties:
 *               title:       { type: string, example: "Amazon Gift Card" }
 *               description: { type: string, example: "Redeemable on amazon.in" }
 *               media:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     url:  { type: string }
 *                     type: { type: string, enum: [image, video], default: image }
 *               category: { type: string, example: "Shopping" }
 *               denominations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [bcoins, amount]
 *                   properties:
 *                     bcoins: { type: number, example: 50000 }
 *                     amount: { type: number, example: 500 }
 *               card_status:
 *                 type: string
 *                 enum: [active, inactive, draft]
 *                 default: draft
 *               vendor: { type: string, example: "Amazon" }
 *               terms_and_conditions:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["Valid for 12 months from date of issue", "Non-transferable"]
 *     responses:
 *       201:
 *         description: Gift card created
 *       400:
 *         description: Validation error
 */
router.get('/', auth, requireRole('admin', 'sales'), getAllGiftCards);
router.post('/', auth, requireRole('admin', 'sales'), createGiftCard);

/**
 * @swagger
 * /api/gift-cards/{id}:
 *   get:
 *     summary: Get a single gift card by id
 *     tags: [GiftCards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Gift card detail
 *       404:
 *         description: Gift card not found
 *   put:
 *     summary: Edit a gift card (admin, sales)
 *     tags: [GiftCards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:       { type: string }
 *               description: { type: string }
 *               media:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     url:  { type: string }
 *                     type: { type: string, enum: [image, video] }
 *               category: { type: string }
 *               denominations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     bcoins: { type: number }
 *                     amount: { type: number }
 *               card_status: { type: string, enum: [active, inactive, draft] }
 *               vendor: { type: string }
 *               terms_and_conditions:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Gift card updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Gift card not found
 */
router.get('/:id', getGiftCardById);
router.put('/:id', auth, requireRole('admin', 'sales'), updateGiftCard);

module.exports = router;
