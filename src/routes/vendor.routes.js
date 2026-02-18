const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { createVendor, getMyVendor, getVendorByUserId, listValidatedVendors, listInvalidatedVendors } = require('../controllers/vendor.controller');

router.post('/', auth, createVendor);
router.get('/me', auth, getMyVendor);
router.get('/users/:id', getVendorByUserId);
/**
 * @swagger
 * /api/vendors/validate:
 *   get:
 *     summary: List validated vendors
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of validated vendors
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id: { type: string }
 *                   user_id:
 *                     type: object
 *                     properties:
 *                       username: { type: string }
 *                       full_name: { type: string }
 *                       avatar_url: { type: string }
 *                       role: { type: string }
 *                   business_name: { type: string }
 *                   validated: { type: boolean }
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.get('/validate', auth, listValidatedVendors);
/**
 * @swagger
 * /api/vendors/invalidate:
 *   get:
 *     summary: List invalidated vendors
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of invalidated vendors
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id: { type: string }
 *                   user_id:
 *                     type: object
 *                     properties:
 *                       username: { type: string }
 *                       full_name: { type: string }
 *                       avatar_url: { type: string }
 *                       role: { type: string }
 *                   business_name: { type: string }
 *                   validated: { type: boolean }
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.get('/invalidate', auth, listInvalidatedVendors);

module.exports = router;
