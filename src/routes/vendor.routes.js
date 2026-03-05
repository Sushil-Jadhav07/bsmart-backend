const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../config/multer');
const {
  createVendor,
  getMyVendor,
  getVendorByUserId,
  updateVendorValidation,
  listAllVendors,
  getVendorProfileByUserId,
  updateVendorProfileByUserId,
  submitVendorVerificationByUserId,
  adminProcessVendorVerification
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
 *     summary: Get full vendor profile by User ID (only if role is vendor)
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The User ID of the vendor
 *     responses:
 *       200:
 *         description: Full vendor profile data
 *       404:
 *         description: User or Vendor profile not found
 *       400:
 *         description: User is not a vendor
 */
router.get('/profile/:userId', auth, getVendorProfileByUserId);

/**
 * @swagger
 * /api/vendors/profile/{userId}:
 *   patch:
 *     summary: Update/Edit Vendor Profile (Save Draft)
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
 *             description: Update vendor profile fields
 *             properties:
 *               company_name:
 *                 type: string
 *               legal_business_name:
 *                 type: string
 *                 description: Registered Name
 *               registration_number:
 *                 type: string
 *               tax_id_or_vat:
 *                 type: string
 *               year_established:
 *                 type: integer
 *               company_type:
 *                 type: string
 *               industry_category:
 *                 type: string
 *               business_nature:
 *                 type: string
 *               website:
 *                 type: string
 *               business_email:
 *                 type: string
 *               business_phone:
 *                 type: string
 *               address:
 *                 type: string
 *               country:
 *                 type: string
 *               service_coverage:
 *                 type: string
 *               company_description:
 *                 type: string
 *               social_media_links:
 *                 type: array
 *                 items:
 *                   type: string
 *               city:
 *                 type: string
 *               note:
 *                 type: string
 *               logo_url:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
router.patch('/profile/:userId', auth, updateVendorProfileByUserId);

/**
 * @swagger
 * /api/vendors/profile/{userId}/submit:
 *   post:
 *     summary: Submit Vendor Profile for Verification
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
 *         description: Submitted successfully
 *       400:
 *         description: Profile incomplete
 */
router.post('/profile/:userId/submit', auth, submitVendorVerificationByUserId);

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
 */

module.exports = router;
