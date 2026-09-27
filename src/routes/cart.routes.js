const router = require('express').Router();
const auth = require('../middleware/auth');
const {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
} = require('../controllers/cart.controller');

/**
 * @swagger
 * tags:
 *   name: Cart
 *   description: Shopping cart for influencer products
 */

/**
 * @swagger
 * /api/cart:
 *   get:
 *     summary: Get the logged-in user's cart (with live pricing/stock)
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current cart contents
 */
router.get('/', auth, getCart);

/**
 * @swagger
 * /api/cart/items:
 *   post:
 *     summary: Add a product to the cart (increments quantity if already present)
 *     tags: [Cart]
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
 *               quantity: { type: integer, default: 1 }
 *               variant:
 *                 type: object
 *                 properties:
 *                   color: { type: string }
 *                   size: { type: string }
 *     responses:
 *       200:
 *         description: Updated cart
 *       400:
 *         description: Invalid input or insufficient stock
 *       404:
 *         description: Product not found
 */
router.post('/items', auth, addItem);

/**
 * @swagger
 * /api/cart/items/{productId}:
 *   patch:
 *     summary: Set an item's quantity (0 removes it) or update its variant
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated cart
 *       404:
 *         description: Item not in cart
 */
router.patch('/items/:productId', auth, updateItem);

/**
 * @swagger
 * /api/cart/items/{productId}:
 *   delete:
 *     summary: Remove an item from the cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated cart
 */
router.delete('/items/:productId', auth, removeItem);

/**
 * @swagger
 * /api/cart:
 *   delete:
 *     summary: Clear the entire cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared
 */
router.delete('/', auth, clearCart);

module.exports = router;
