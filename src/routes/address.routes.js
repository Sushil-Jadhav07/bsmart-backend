const router = require('express').Router();
const auth = require('../middleware/auth');
const {
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} = require('../controllers/address.controller');

/**
 * @swagger
 * tags:
 *   name: Addresses
 *   description: Saved shipping addresses, used at checkout
 */

/**
 * @swagger
 * /api/addresses:
 *   get:
 *     summary: List the logged-in user's saved addresses (default first)
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved addresses
 */
router.get('/', auth, listAddresses);

/**
 * @swagger
 * /api/addresses:
 *   post:
 *     summary: Save a new address
 *     description: The first address you save always becomes the default automatically.
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phone, address_line1, city, state, pincode]
 *             properties:
 *               label: { type: string, example: "Home", description: "Home, Work, Other, etc." }
 *               name: { type: string, description: "Recipient name" }
 *               phone: { type: string }
 *               address_line1: { type: string }
 *               address_line2: { type: string }
 *               city: { type: string }
 *               state: { type: string }
 *               pincode: { type: string }
 *               country: { type: string, default: India }
 *               is_default: { type: boolean }
 *     responses:
 *       201:
 *         description: Address saved
 *       400:
 *         description: Missing a required field
 */
router.post('/', auth, createAddress);

/**
 * @swagger
 * /api/addresses/{id}:
 *   patch:
 *     summary: Update an address
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Address updated
 *       404:
 *         description: Address not found
 */
router.patch('/:id', auth, updateAddress);

/**
 * @swagger
 * /api/addresses/{id}:
 *   delete:
 *     summary: Delete an address (soft delete)
 *     description: If the deleted address was the default, the next most recent one becomes the default automatically.
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Address deleted
 *       404:
 *         description: Address not found
 */
router.delete('/:id', auth, deleteAddress);

/**
 * @swagger
 * /api/addresses/{id}/default:
 *   patch:
 *     summary: Set an address as the default
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Default address updated
 *       404:
 *         description: Address not found
 */
router.patch('/:id/default', auth, setDefaultAddress);

module.exports = router;
