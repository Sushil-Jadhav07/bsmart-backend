const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { upload } = require('../config/multer');
const {
  createVendor,
  getMyVendor,
  getVendorByUserId,
  listAllVendors,
  updateVendorProfile,
  uploadVendorCoverImage,
  deleteVendorCoverImage,
  removeUserAvatar,
  getVendorProfile,
  getPublicVendorProfile,
  adminProcessVendorVerification,
  getAllVendorsForAdmin,
  deleteVendorByUserId,
  addVendorContact,
  getVendorContacts,
  updateVendorContact,
  deleteVendorContact
} = require('../controllers/vendor.controller');
const requireAdmin = require('../middleware/requireAdmin');
const { deleteVendorByAdmin } = require('../controllers/admin.controller');
const { viewProfile } = require('../controllers/vendorProfileView.controller');
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
 * /api/vendors/profile/{userId}/public:
 *   get:
 *     summary: Get public vendor profile for users
 *     tags: [Vendors]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Public vendor profile
 */
router.get('/profile/:userId/public', getPublicVendorProfile);

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
 * /api/vendors/profile/{userId}/cover-image:
 *   post:
 *     summary: Upload multiple vendor cover images for a particular user
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Cover images uploaded successfully
 */
router.post('/profile/:userId/cover-image', auth, upload.array('files'), uploadVendorCoverImage);

/**
 * @swagger
 * /api/vendors/profile/{userId}/cover-image:
 *   delete:
 *     summary: Delete a single vendor cover image
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
 *               imageUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cover image deleted successfully
 */
router.delete('/profile/:userId/cover-image', auth, deleteVendorCoverImage);

/**
 * @swagger
 * /api/vendors/profile/{userId}/avatar:
 *   delete:
 *     summary: Remove user avatar
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
 *         description: Avatar removed successfully
 */
router.delete('/profile/:userId/avatar', auth, removeUserAvatar);
 
/**
 * @swagger
 * /api/vendors/{userId}/contacts:
 *   post:
 *     summary: Add a contact for a vendor
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
 *               name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               position: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Contact created
 */
router.post('/:userId/contacts', auth, addVendorContact);

/**
 * @swagger
 * /api/vendors/{userId}/contacts:
 *   get:
 *     summary: Get all contacts for a vendor
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
 *         description: List of contacts
 */
router.get('/:userId/contacts', auth, getVendorContacts);

/**
 * @swagger
 * /api/vendors/{userId}/contacts/{contactId}:
 *   post:
 *     summary: Update a contact for a vendor
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: contactId
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
 *               name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               position: { type: string }
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Contact updated
 */
router.post('/:userId/contacts/:contactId', auth, updateVendorContact);

/**
 * @swagger
 * /api/vendors/{userId}/contacts/{contactId}:
 *   delete:
 *     summary: Delete a contact for a vendor
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contact deleted
 */
router.delete('/:userId/contacts/:contactId', auth, deleteVendorContact);

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

/**
 * @swagger
 * /api/vendors/profile/{vendorUserId}/viewProfile:
 *   post:
 *     summary: Record a vendor profile view (credits member, deducts 10 coins from vendor wallet balance)
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vendorUserId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Profile view reward recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 coins_earned:
 *                   type: number
 *                   example: 10
 *                 deduction_source:
 *                   type: string
 *                   example: vendor_wallet
 *                 deduction_note:
 *                   type: string
 *                   example: Coins were deducted from the vendor wallet balance, not from any ad budget wallet.
 *                 wallet:
 *                   type: object
 *                   properties:
 *                     new_balance:
 *                       type: number
 *                     currency:
 *                       type: string
 *       400:
 *         description: Invalid vendorUserId / insufficient vendor wallet balance
 *       403:
 *         description: Only members can earn
 *       404:
 *         description: Vendor not found
 *       429:
 *         description: Cooldown not finished
 */
router.post('/profile/:vendorUserId/viewProfile', auth, viewProfile);


module.exports = router;
