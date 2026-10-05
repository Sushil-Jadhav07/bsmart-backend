const router = require('express').Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  createProduct,
  updateProduct,
  addStock,
  deleteProduct,
  listMyProducts,
  listProducts,
  adminListAllProducts,
  getProductById,
} = require('../controllers/influencerProduct.controller');

/**
 * @swagger
 * tags:
 *   name: Influencer Products
 *   description: Full product listings posted by influencers
 */

/**
 * @swagger
 * /api/influencer-products:
 *   get:
 *     summary: Browse the product marketplace (public)
 *     tags: [Influencer Products]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Free-text search across name, description, category, brand, and key highlights
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of active products
 */
router.get('/', listProducts);

/**
 * @swagger
 * /api/influencer-products/my:
 *   get:
 *     summary: Get the logged-in influencer's own products
 *     tags: [Influencer Products]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The influencer's own products
 */
router.get('/my', auth, listMyProducts);

/**
 * @swagger
 * /api/influencer-products/admin/all:
 *   get:
 *     summary: Admin — list every product, any status, any seller
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: seller
 *         schema: { type: string }
 *         description: Filter by seller's user id
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive, draft, out_of_stock] }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of all products, every status
 *       403:
 *         description: Admin only
 */
router.get('/admin/all', auth, requireRole('admin'), adminListAllProducts);

/**
 * @swagger
 * /api/influencer-products:
 *   post:
 *     summary: Create a product listing (influencer only)
 *     tags: [Influencer Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - images
 *               - name
 *               - category
 *               - short_description
 *               - key_highlights
 *               - mrp
 *               - selling_price
 *               - stock_quantity
 *               - seller_sku
 *               - status
 *               - package_weight
 *               - dimensions
 *               - dispatch_time
 *               - country_of_origin
 *               - return_policy
 *             properties:
 *               images:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   properties:
 *                     fileName: { type: string }
 *                     fileUrl: { type: string }
 *               name: { type: string, maxLength: 150 }
 *               category: { type: string }
 *               brand: { type: string }
 *               short_description: { type: string, maxLength: 500 }
 *               key_highlights:
 *                 type: array
 *                 maxItems: 5
 *                 items: { type: string }
 *               mrp: { type: number }
 *               selling_price: { type: number }
 *               discount: { type: number, description: "Percentage — auto-computed from mrp/selling_price if omitted" }
 *               stock_quantity: { type: number }
 *               seller_sku: { type: string }
 *               track_inventory: { type: boolean, default: true }
 *               status: { type: string, enum: [active, inactive, draft] }
 *               variants:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     color: { type: string }
 *                     size: { type: string }
 *                     stock_quantity: { type: number }
 *                     price: { type: number }
 *               package_weight: { type: number }
 *               weight_unit: { type: string, enum: [kg, g], default: kg }
 *               dimensions:
 *                 type: object
 *                 required: [length, width, height]
 *                 properties:
 *                   length: { type: number }
 *                   width: { type: number }
 *                   height: { type: number }
 *                   unit: { type: string, default: cm }
 *               dispatch_time: { type: string, example: "1-2 Days" }
 *               hsn_gst: { type: string }
 *               country_of_origin: { type: string, default: India }
 *               return_policy: { type: string, example: "7 Days Replacement" }
 *               use_store_delivery_settings: { type: boolean, default: true }
 *               use_store_return_policy: { type: boolean, default: true }
 *               warranty: { type: string, default: None }
 *     responses:
 *       201:
 *         description: Product created
 *       400:
 *         description: Missing or invalid field
 *       403:
 *         description: Only influencers can create products
 */
router.post('/', auth, createProduct);

/**
 * @swagger
 * /api/influencer-products/{id}:
 *   get:
 *     summary: Get a single product by ID
 *     tags: [Influencer Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product details
 *       404:
 *         description: Product not found
 */
router.get('/:id', getProductById);

/**
 * @swagger
 * /api/influencer-products/{id}:
 *   patch:
 *     summary: Update a product (owner only)
 *     tags: [Influencer Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product updated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Product not found
 */
router.patch('/:id', auth, updateProduct);

/**
 * @swagger
 * /api/influencer-products/{id}/stock:
 *   patch:
 *     summary: Restock a product (owner only) — adds to current stock_quantity
 *     description: |
 *       Adds `quantity` to the product's existing `stock_quantity` (does not replace it).
 *       If the product's status was `out_of_stock`, it's automatically switched back to
 *       `active` since restocking implies it's sellable again.
 *     tags: [Influencer Products]
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
 *             required: [quantity]
 *             properties:
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 example: 10
 *                 description: Units to ADD to current stock (not the new total)
 *     responses:
 *       200:
 *         description: Stock updated — returns the full updated product
 *       400:
 *         description: quantity must be a positive whole number
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Product not found
 */
router.patch('/:id/stock', auth, addStock);

/**
 * @swagger
 * /api/influencer-products/{id}:
 *   delete:
 *     summary: Delete a product (owner only, soft delete)
 *     tags: [Influencer Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product deleted
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Product not found
 */
router.delete('/:id', auth, deleteProduct);

module.exports = router;
