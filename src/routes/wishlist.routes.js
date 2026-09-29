const router = require('express').Router();
const auth = require('../middleware/auth');
const {
  getWishlist,
  addItem,
  removeItem,
  clearWishlist,
} = require('../controllers/wishlist.controller');

/**
 * @swagger
 * tags:
 *   name: Wishlist
 *   description: Saved-for-later influencer products
 */

/**
 * @swagger
 * /api/wishlist:
 *   get:
 *     summary: Get the logged-in user's wishlist (full product data, not just IDs)
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wishlisted products, newest-added first
 */
router.get('/', auth, getWishlist);

/**
 * @swagger
 * /api/wishlist/items:
 *   post:
 *     summary: Add a product to the wishlist (no-op if already there)
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [product_id]
 *             properties:
 *               product_id: { type: string }
 *     responses:
 *       200:
 *         description: Updated wishlist
 *       404:
 *         description: Product not found
 */
router.post('/items', auth, addItem);

/**
 * @swagger
 * /api/wishlist/items/{productId}:
 *   delete:
 *     summary: Remove a product from the wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated wishlist
 */
router.delete('/items/:productId', auth, removeItem);

/**
 * @swagger
 * /api/wishlist:
 *   delete:
 *     summary: Clear the entire wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wishlist cleared
 */
router.delete('/', auth, clearWishlist);

module.exports = router;
