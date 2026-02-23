const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { createVendor, getMyVendor, getVendorByUserId, listValidatedVendors, listInvalidatedVendors, updateVendorValidation, listAllVendors, getVendorById } = require('../controllers/vendor.controller');
const requireAdmin = require('../middleware/requireAdmin');
const { deleteVendorByAdmin } = require('../controllers/admin.controller');

router.post('/', auth, createVendor);
router.get('/me', auth, getMyVendor);
router.get('/users/:id', getVendorByUserId);
router.get('/', listAllVendors);
router.get('/:id', getVendorById);

/**
 * @swagger
 * /api/vendors:
 *   get:
 *     summary: List all vendors with validated status
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of vendors
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id: { type: string }
 *                   validated: { type: boolean }
 *                   business_name: { type: string }
 *                   user:
 *                     type: object
 *                     properties:
 *                       _id: { type: string }
 *                       username: { type: string }
 *                       full_name: { type: string }
 *                       avatar_url: { type: string }
 *                       role: { type: string }
 *                       phone: { type: string }
 *       401:
 *         description: Not authorized
 *
 * /api/vendors/{id}:
 *   get:
 *     summary: Get vendor details by vendor ID
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Vendor ID
 *     responses:
 *       200:
 *         description: Vendor details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id: { type: string }
 *                 validated: { type: boolean }
 *                 business_name: { type: string }
 *                 user:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     username: { type: string }
 *                     full_name: { type: string }
 *                     avatar_url: { type: string }
 *                     role: { type: string }
 *                     phone: { type: string }
 *       404:
 *         description: Vendor not found
 */
/**
 * @swagger
 * /api/vendors/{id}:
 *   delete:
 *     summary: Permanently delete vendor (admin only)
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               downgrade_user_to_member:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Vendor permanently deleted successfully
 *       403:
 *         description: Forbidden - Admin only
 *       404:
 *         description: Vendor not found
 */
router.delete('/:id', requireAdmin, deleteVendorByAdmin);
/**
 * @swagger
 * /api/vendors/{id}/validation:
 *   patch:
 *     summary: Update vendor validation status
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Vendor ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               admin_user_id:
 *                 type: string
 *                 description: Admin user ID performing this action
 *               validated:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Vendor validation updated successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Vendor not found
 *       500:
 *         description: Server error
 */
router.patch('/:id/validation', auth, updateVendorValidation);
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
