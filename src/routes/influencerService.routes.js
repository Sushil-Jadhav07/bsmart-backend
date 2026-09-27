const router = require('express').Router();
const auth = require('../middleware/auth');
const {
  createService,
  updateService,
  deleteService,
  listMyServices,
  listServices,
  getServiceById,
} = require('../controllers/influencerService.controller');

/**
 * @swagger
 * tags:
 *   name: Influencer Services
 *   description: Services posted by influencers
 */

/**
 * @swagger
 * /api/influencer-services:
 *   get:
 *     summary: Browse the services marketplace (public)
 *     tags: [Influencer Services]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Free-text search across name, description, category, provider, and key highlights
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
 *         description: Paginated list of visible services
 */
router.get('/', listServices);

/**
 * @swagger
 * /api/influencer-services/my:
 *   get:
 *     summary: Get the logged-in influencer's own services
 *     tags: [Influencer Services]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The influencer's own services
 */
router.get('/my', auth, listMyServices);

/**
 * @swagger
 * /api/influencer-services:
 *   post:
 *     summary: Create a service listing (influencer only)
 *     tags: [Influencer Services]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - category
 *               - short_description
 *               - key_highlights
 *               - price
 *               - rate_type
 *               - duration
 *               - service_method
 *             properties:
 *               images:
 *                 type: array
 *                 description: Optional, unlike products
 *                 items:
 *                   type: object
 *                   properties:
 *                     fileName: { type: string }
 *                     fileUrl: { type: string }
 *               name: { type: string, maxLength: 150, example: "Home Cleaning" }
 *               category: { type: string, example: "Home Services" }
 *               provider: { type: string, description: "Your business name (optional)" }
 *               short_description: { type: string, maxLength: 500 }
 *               key_highlights:
 *                 type: array
 *                 maxItems: 5
 *                 items: { type: string }
 *                 example: ["All equipment included"]
 *               price: { type: number }
 *               rate_type: { type: string, enum: [starting_from, fixed, per_hour, per_session] }
 *               duration: { type: string, example: "1 hour" }
 *               subservices:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     hours: { type: number }
 *                     price: { type: number }
 *               service_method: { type: string, enum: [at_customer_location, online, at_my_location] }
 *               weekly_availability:
 *                 type: object
 *                 description: Keyed by weekday (monday..sunday). Omit or leave a day's array empty for "Unavailable".
 *                 properties:
 *                   monday:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         start: { type: string, example: "09:00" }
 *                         end: { type: string, example: "17:00" }
 *               visible_to_customers: { type: boolean, default: true }
 *           example:
 *             name: "Home Cleaning"
 *             category: "Home Services"
 *             provider: "Sparkle Clean Co."
 *             short_description: "Thorough home cleaning with eco-friendly products."
 *             key_highlights: ["All equipment included", "Eco-friendly products", "Trained staff"]
 *             price: 999
 *             rate_type: starting_from
 *             duration: "1 hour"
 *             subservices:
 *               - { name: "Deep clean", hours: 3, price: 2499 }
 *             service_method: at_customer_location
 *             weekly_availability:
 *               monday: [{ start: "09:00", end: "17:00" }]
 *               tuesday: [{ start: "09:00", end: "17:00" }]
 *               wednesday: [{ start: "09:00", end: "17:00" }]
 *               thursday: [{ start: "09:00", end: "17:00" }]
 *               friday: [{ start: "09:00", end: "17:00" }]
 *               saturday: []
 *               sunday: []
 *             visible_to_customers: true
 *     responses:
 *       201:
 *         description: Service created
 *       400:
 *         description: Missing or invalid field
 *       403:
 *         description: Only influencers can create services
 */
router.post('/', auth, createService);

/**
 * @swagger
 * /api/influencer-services/{id}:
 *   get:
 *     summary: Get a single service by ID
 *     tags: [Influencer Services]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Service details
 *       404:
 *         description: Service not found
 */
router.get('/:id', getServiceById);

/**
 * @swagger
 * /api/influencer-services/{id}:
 *   patch:
 *     summary: Update a service (owner only)
 *     tags: [Influencer Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Service updated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Service not found
 */
router.patch('/:id', auth, updateService);

/**
 * @swagger
 * /api/influencer-services/{id}:
 *   delete:
 *     summary: Delete a service (owner only, soft delete)
 *     tags: [Influencer Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Service deleted
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Service not found
 */
router.delete('/:id', auth, deleteService);

module.exports = router;
