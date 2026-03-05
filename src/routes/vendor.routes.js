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
  getVendorById,
  getMyVendorProfile,
  updateMyVendorProfile,
  submitVendorProfileForVerification,
  uploadVendorLogo,
  listVendorProfiles,
  getVendorProfileById,
  updateVendorProfileApprovalStatus
} = require('../controllers/vendor.controller');
const requireAdmin = require('../middleware/requireAdmin');
const { deleteVendorByAdmin } = require('../controllers/admin.controller');

/**
 * @swagger
 * tags:
 *   - name: Vendor Profile
 *     description: Vendor profile completion and verification workflow
 */

/**
 * @swagger
 * /api/vendors/profiles:
 *   get:
 *     summary: List all vendor profiles
 *     tags: [Vendor Profile]
 *     responses:
 *       200:
 *         description: Array of vendor profiles
 *
 * /api/vendors/profile/me/submit:
 *   patch:
 *     summary: Submit vendor profile for verification
 *     tags: [Vendor Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Submitted for verification
 *       400:
 *         description: Profile incomplete
 *
 * /api/vendors/profile/me/logo:
 *   patch:
 *     summary: Upload vendor logo
 *     tags: [Vendor Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [logo]
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Logo uploaded
 *
 * /api/vendors/profile/{id}/approval:
 *   patch:
 *     summary: Admin approve/reject vendor profile
 *     tags: [Vendor Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *               rejection_reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Approval status updated
 *       403:
 *         description: Admin only
 *
 * /api/vendors/profile/{id}:
 *   get:
 *     summary: Get vendor profile by vendor ID
 *     tags: [Vendor Profile]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor profile ID
 *     responses:
 *       200:
 *         description: Vendor profile details
 *       404:
 *         description: Vendor profile not found
 *   delete:
 *     summary: Delete vendor profile (admin only)
 *     tags: [Vendor Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor profile ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               downgrade_user_to_member:
 *                 type: boolean
 *                 description: If true, vendor user role will be set to member
 *     responses:
 *       200:
 *         description: Vendor profile deleted successfully
 *       403:
 *         description: Admin only
 *       404:
 *         description: Vendor profile not found
 */

router.get('/profiles', listVendorProfiles);
router.get('/profile/me', auth, getMyVendorProfile);
router.put('/profile/me', auth, updateMyVendorProfile);
router.get('/profile/:id', getVendorProfileById);
router.patch('/profile/me/submit', auth, submitVendorProfileForVerification);
router.patch('/profile/me/logo', auth, upload.single('logo'), uploadVendorLogo);
router.patch('/profile/:id/approval', requireAdmin, updateVendorProfileApprovalStatus);
router.delete('/profile/:id', requireAdmin, deleteVendorByAdmin);

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

module.exports = router;
