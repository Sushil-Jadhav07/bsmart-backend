const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../config/multer');
const {
  createVendor,
  getMyVendor,
  getVendorByUserId,
  listAllVendors,
  updateVendorProfile,
  getVendorProfile,
  adminProcessVendorVerification,
  getAllVendorsForAdmin,
  deleteVendorByUserId
} = require('../controllers/vendor.controller');
const requireAdmin = require('../middleware/requireAdmin');
const { deleteVendorByAdmin } = require('../controllers/admin.controller');

/**
 * @swagger
 * tags:
 *   - name: Vendors
 *     description: Vendor management
 */

router.post('/', auth, createVendor);
router.get('/me', auth, getMyVendor);
router.get('/users/:id', getVendorByUserId);
router.get('/', listAllVendors);

/**
 * @swagger
 * /api/vendors/profile/{userId}:
 *   get:
 *     summary: Get vendor profile with percentage
 *     tags: [Vendors]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vendor profile
 */
router.get('/profile/:userId', getVendorProfile);

/**
 * @swagger
 * /api/vendors/profile/{userId}:
 *   post:
 *     summary: Update vendor profile details by userId
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               business_details:
 *                 type: object
 *                 properties:
 *                   industry_category: { type: string }
 *                   business_nature: { type: string }
 *                   service_coverage: { type: string }
 *                   country: { type: string }
 *               online_presence:
 *                 type: object
 *                 properties:
 *                   website_url: { type: string }
 *                   company_email: { type: string }
 *                   phone_number: { type: string }
 *                   address:
 *                     type: object
 *                     properties:
 *                       address_line1: { type: string }
 *                       address_line2: { type: string }
 *                       city: { type: string }
 *                       pincode: { type: string }
 *                       state: { type: string }
 *                       country: { type: string }
 *               social_media_links:
 *                 type: object
 *                 properties:
 *                   instagram: { type: string }
 *                   facebook: { type: string }
 *                   linkedin: { type: string }
 *                   twitter: { type: string }
 *               company_description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.post('/profile/:userId', auth, updateVendorProfile);

/**
 * @swagger
 * /api/vendors/profile/{userId}/admin-process:
 *   post:
 *     summary: Admin Approve/Reject Vendor Profile
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *               rejection_reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Processed successfully
 *       403:
 *         description: Admin only
 */
router.post('/profile/:userId/admin-process', requireAdmin, adminProcessVendorVerification);

/**
 * @swagger
 * /api/vendors/admin/all:
 *   get:
 *     summary: Get all vendors (Admin only)
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all vendors
 *       403:
 *         description: Admin access required
 */
router.get('/admin/all', requireAdmin, getAllVendorsForAdmin);

/**
 * @swagger
 * /api/vendors/admin/user/{userId}:
 *   delete:
 *     summary: Delete vendor and associated user by User ID (Admin only)
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vendor deleted successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Vendor not found
 */
router.delete('/admin/user/:userId', requireAdmin, deleteVendorByUserId);

module.exports = router;
