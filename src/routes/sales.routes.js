const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const requireAdmin = require('../middleware/requireAdmin');

const { getMySales, getSalesByUserId, updateMySales } = require('../controllers/sales.controller');
const {
  assignSalesOfficer,
  unassignSalesOfficer,
  getAllSalesOfficers,
  getMyAssignedOfficer,
  getVendorsAssignedToOfficer
} = require('../controllers/salesAssign.controller');

/**
 * @swagger
 * tags:
 *   name: Sales
 *   description: Sales officer management, profile, and vendor assignment APIs
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     SalesProfile:
 *       type: object
 *       description: Sales profile merged with user info. All endpoints returning a sales profile include user fields (email, username, full_name, avatar_url, phone, location).
 *       properties:
 *         _id:
 *           type: string
 *           description: Sales profile document ID
 *           example: "64a1b2c3d4e5f67890123456"
 *         user_id:
 *           type: string
 *           description: The User _id this sales profile belongs to
 *           example: "64a1b2c3d4e5f67890123457"
 *         bio:
 *           type: string
 *           example: "Experienced sales officer covering the western region"
 *         territory:
 *           type: string
 *           example: "Mumbai, Pune"
 *         target:
 *           type: number
 *           example: 500000
 *         email:
 *           type: string
 *           example: "john@example.com"
 *         username:
 *           type: string
 *           example: "john_sales"
 *         full_name:
 *           type: string
 *           example: "John Doe"
 *         avatar_url:
 *           type: string
 *           example: ""
 *         phone:
 *           type: string
 *           example: "+919876543210"
 *         location:
 *           type: string
 *           example: "Mumbai, India"
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     SalesOfficerUser:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64a1b2c3d4e5f67890123457"
 *         username:
 *           type: string
 *           example: "john_sales"
 *         full_name:
 *           type: string
 *           example: "John Doe"
 *         email:
 *           type: string
 *           example: "john@example.com"
 *         phone:
 *           type: string
 *           example: "+919876543210"
 *         avatar_url:
 *           type: string
 *           example: ""
 *         location:
 *           type: string
 *           example: "Mumbai, India"
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *     AssignSalesRequest:
 *       type: object
 *       required:
 *         - vendor_user_id
 *         - sales_user_id
 *       properties:
 *         vendor_user_id:
 *           type: string
 *           description: The User _id of the vendor
 *           example: "64a1b2c3d4e5f67890000001"
 *         sales_user_id:
 *           type: string
 *           description: The User _id of the sales officer
 *           example: "64a1b2c3d4e5f67890000002"
 *
 *     AssignSalesResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Sales officer assigned successfully"
 *         vendor:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             business_name:
 *               type: string
 *             user_id:
 *               type: string
 *             assigned_sales_officer:
 *               $ref: '#/components/schemas/SalesOfficerUser'
 *
 *     AssignedOfficerResponse:
 *       type: object
 *       properties:
 *         assigned_sales_officer:
 *           nullable: true
 *           allOf:
 *             - $ref: '#/components/schemas/SalesOfficerUser'
 *
 *     VendorsByOfficerResponse:
 *       type: object
 *       properties:
 *         sales_officer:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             username:
 *               type: string
 *             full_name:
 *               type: string
 *             email:
 *               type: string
 *         total_vendors:
 *           type: integer
 *           example: 3
 *         vendors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               _id:
 *                 type: string
 *               business_name:
 *                 type: string
 *               user_id:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   username:
 *                     type: string
 *                   full_name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   avatar_url:
 *                     type: string
 */

// ─────────────────────────────────────────────────────────────────────────────
// SALES PROFILE ROUTES (sales role)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/sales/me:
 *   get:
 *     summary: Get my sales profile
 *     description: Returns the sales profile of the currently authenticated sales officer.
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sales profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SalesProfile'
 *             example:
 *               _id: "64a1b2c3d4e5f67890123456"
 *               user_id: "64a1b2c3d4e5f67890123457"
 *               bio: "Experienced sales officer covering the western region"
 *               territory: "Mumbai, Pune"
 *               target: 500000
 *               email: "john@example.com"
 *               username: "john_sales"
 *               full_name: "John Doe"
 *               avatar_url: ""
 *               phone: "+919876543210"
 *               location: "Mumbai, India"
 *               createdAt: "2024-01-01T00:00:00.000Z"
 *               updatedAt: "2024-01-01T00:00:00.000Z"
 *       401:
 *         description: Not authorized — token missing or invalid
 *         content:
 *           application/json:
 *             example:
 *               message: "No token, authorization denied"
 *       403:
 *         description: Forbidden — user does not have sales role
 *         content:
 *           application/json:
 *             example:
 *               message: "Forbidden"
 *       404:
 *         description: Sales profile not found
 *         content:
 *           application/json:
 *             example:
 *               message: "Sales profile not found"
 *       500:
 *         description: Server error
 */
router.get('/me', auth, requireRole('sales'), getMySales);

/**
 * @swagger
 * /api/sales/me:
 *   put:
 *     summary: Update my sales profile
 *     description: Update the bio, territory, or target of the authenticated sales officer.
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bio:
 *                 type: string
 *                 example: "Senior sales officer for south India region"
 *               territory:
 *                 type: string
 *                 example: "Chennai, Bangalore, Hyderabad"
 *               target:
 *                 type: number
 *                 example: 750000
 *     responses:
 *       200:
 *         description: Sales profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SalesProfile'
 *       401:
 *         description: Not authorized
 *         content:
 *           application/json:
 *             example:
 *               message: "No token, authorization denied"
 *       403:
 *         description: Forbidden — user does not have sales role
 *         content:
 *           application/json:
 *             example:
 *               message: "Forbidden"
 *       404:
 *         description: Sales profile not found
 *         content:
 *           application/json:
 *             example:
 *               message: "Sales profile not found"
 *       500:
 *         description: Server error
 */
router.put('/me', auth, requireRole('sales'), updateMySales);

/**
 * @swagger
 * /api/sales/users/{id}:
 *   get:
 *     summary: Get sales profile by user ID
 *     description: Fetch the sales profile merged with user info (email, username, full_name, phone, location) for any user by their User _id.
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The User _id of the sales officer
 *         example: "64a1b2c3d4e5f67890123457"
 *     responses:
 *       200:
 *         description: Sales profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SalesProfile'
 *             example:
 *               _id: "64a1b2c3d4e5f67890123456"
 *               user_id: "64a1b2c3d4e5f67890123457"
 *               bio: "Experienced sales officer covering the western region"
 *               territory: "Mumbai, Pune"
 *               target: 500000
 *               email: "john@example.com"
 *               username: "john_sales"
 *               full_name: "John Doe"
 *               avatar_url: ""
 *               phone: "+919876543210"
 *               location: "Mumbai, India"
 *               createdAt: "2024-01-01T00:00:00.000Z"
 *               updatedAt: "2024-01-01T00:00:00.000Z"
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Sales profile not found
 *         content:
 *           application/json:
 *             example:
 *               message: "Sales profile not found"
 *       500:
 *         description: Server error
 */
router.get('/users/:id', auth, getSalesByUserId);

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL SALES OFFICERS (Admin)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/sales/officers:
 *   get:
 *     summary: Get all sales officers
 *     description: Returns a list of all users with the role 'sales'. Admin access only.
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all sales officers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 2
 *                 sales_officers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SalesOfficerUser'
 *             example:
 *               total: 2
 *               sales_officers:
 *                 - _id: "64a1b2c3d4e5f67890000002"
 *                   username: "john_sales"
 *                   full_name: "John Doe"
 *                   email: "john@example.com"
 *                   phone: "+919876543210"
 *                   avatar_url: ""
 *                   location: "Mumbai, India"
 *                   createdAt: "2024-01-01T00:00:00.000Z"
 *                 - _id: "64a1b2c3d4e5f67890000003"
 *                   username: "sara_sales"
 *                   full_name: "Sara Khan"
 *                   email: "sara@example.com"
 *                   phone: "+919876543211"
 *                   avatar_url: ""
 *                   location: "Delhi, India"
 *                   createdAt: "2024-02-01T00:00:00.000Z"
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden — Admin only
 *         content:
 *           application/json:
 *             example:
 *               message: "Forbidden - Admin only"
 *       500:
 *         description: Server error
 */
router.get('/officers', requireAdmin, getAllSalesOfficers);

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGN SALES OFFICER TO VENDOR (Admin)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/sales/assign:
 *   post:
 *     summary: Assign a sales officer to a vendor
 *     description: >
 *       Admin assigns a sales officer (user with role 'sales') to a vendor.
 *       The assigned officer's user _id is stored in the vendor's record under
 *       assigned_sales_officer. Reassigning will overwrite the previous assignment.
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssignSalesRequest'
 *           example:
 *             vendor_user_id: "64a1b2c3d4e5f67890000001"
 *             sales_user_id: "64a1b2c3d4e5f67890000002"
 *     responses:
 *       200:
 *         description: Sales officer assigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssignSalesResponse'
 *             example:
 *               message: "Sales officer assigned successfully"
 *               vendor:
 *                 _id: "64a1b2c3d4e5f67890000010"
 *                 business_name: "Acme Corp"
 *                 user_id: "64a1b2c3d4e5f67890000001"
 *                 assigned_sales_officer:
 *                   _id: "64a1b2c3d4e5f67890000002"
 *                   username: "john_sales"
 *                   full_name: "John Doe"
 *                   email: "john@example.com"
 *                   phone: "+919876543210"
 *                   avatar_url: ""
 *       400:
 *         description: Missing fields, invalid IDs, or user is not a sales officer
 *         content:
 *           application/json:
 *             examples:
 *               missing_fields:
 *                 summary: Missing required fields
 *                 value:
 *                   message: "vendor_user_id and sales_user_id are required"
 *               invalid_ids:
 *                 summary: Invalid IDs
 *                 value:
 *                   message: "Invalid vendor_user_id or sales_user_id"
 *               wrong_role:
 *                 summary: User is not a sales officer
 *                 value:
 *                   message: "Provided user does not have the sales role"
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden — Admin only
 *         content:
 *           application/json:
 *             example:
 *               message: "Forbidden - Admin only"
 *       404:
 *         description: Vendor or sales officer not found
 *         content:
 *           application/json:
 *             examples:
 *               sales_not_found:
 *                 summary: Sales officer not found
 *                 value:
 *                   message: "Sales officer user not found"
 *               vendor_not_found:
 *                 summary: Vendor not found
 *                 value:
 *                   message: "Vendor not found for given vendor_user_id"
 *       500:
 *         description: Server error
 */
router.post('/assign', requireAdmin, assignSalesOfficer);

// ─────────────────────────────────────────────────────────────────────────────
// UNASSIGN SALES OFFICER FROM VENDOR (Admin)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/sales/assign/{vendor_user_id}:
 *   delete:
 *     summary: Unassign the sales officer from a vendor
 *     description: >
 *       Removes the assigned sales officer from a vendor's record by setting
 *       assigned_sales_officer to null. Admin access only.
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vendor_user_id
 *         required: true
 *         schema:
 *           type: string
 *         description: The User _id of the vendor
 *         example: "64a1b2c3d4e5f67890000001"
 *     responses:
 *       200:
 *         description: Sales officer unassigned successfully
 *         content:
 *           application/json:
 *             example:
 *               message: "Sales officer unassigned successfully"
 *       400:
 *         description: Invalid vendor_user_id
 *         content:
 *           application/json:
 *             example:
 *               message: "Invalid vendor_user_id"
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden — Admin only
 *         content:
 *           application/json:
 *             example:
 *               message: "Forbidden - Admin only"
 *       404:
 *         description: Vendor not found
 *         content:
 *           application/json:
 *             example:
 *               message: "Vendor not found for given vendor_user_id"
 *       500:
 *         description: Server error
 */
router.delete('/assign/:vendor_user_id', requireAdmin, unassignSalesOfficer);

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR — fetch my assigned sales officer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/sales/my-officer:
 *   get:
 *     summary: Vendor — get my assigned sales officer
 *     description: >
 *       Allows a vendor to see which sales officer has been assigned to them.
 *       Returns null with a message if no officer is assigned yet. Vendor access only.
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Assigned sales officer returned (or null if none assigned)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssignedOfficerResponse'
 *             examples:
 *               assigned:
 *                 summary: Sales officer is assigned
 *                 value:
 *                   assigned_sales_officer:
 *                     _id: "64a1b2c3d4e5f67890000002"
 *                     username: "john_sales"
 *                     full_name: "John Doe"
 *                     email: "john@example.com"
 *                     phone: "+919876543210"
 *                     avatar_url: ""
 *                     location: "Mumbai, India"
 *               not_assigned:
 *                 summary: No sales officer assigned yet
 *                 value:
 *                   message: "No sales officer assigned yet"
 *                   assigned_sales_officer: null
 *       401:
 *         description: Not authorized
 *         content:
 *           application/json:
 *             example:
 *               message: "No token, authorization denied"
 *       403:
 *         description: Forbidden — vendor role required
 *         content:
 *           application/json:
 *             example:
 *               message: "Forbidden"
 *       404:
 *         description: Vendor profile not found
 *         content:
 *           application/json:
 *             example:
 *               message: "Vendor profile not found"
 *       500:
 *         description: Server error
 */
router.get('/my-officer', auth, requireRole('vendor'), getMyAssignedOfficer);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — all vendors assigned to a specific sales officer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/sales/officers/{sales_user_id}/vendors:
 *   get:
 *     summary: Get all vendors assigned to a specific sales officer
 *     description: >
 *       Admin can view all vendor accounts that are currently assigned to a given
 *       sales officer, along with the officer's details and a total count.
 *       Admin access only.
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sales_user_id
 *         required: true
 *         schema:
 *           type: string
 *         description: The User _id of the sales officer
 *         example: "64a1b2c3d4e5f67890000002"
 *     responses:
 *       200:
 *         description: Vendors assigned to the sales officer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VendorsByOfficerResponse'
 *             example:
 *               sales_officer:
 *                 _id: "64a1b2c3d4e5f67890000002"
 *                 username: "john_sales"
 *                 full_name: "John Doe"
 *                 email: "john@example.com"
 *               total_vendors: 2
 *               vendors:
 *                 - _id: "64a1b2c3d4e5f67890000010"
 *                   business_name: "Acme Corp"
 *                   user_id:
 *                     _id: "64a1b2c3d4e5f67890000001"
 *                     username: "acme_vendor"
 *                     full_name: "Acme Owner"
 *                     email: "acme@example.com"
 *                     phone: "+919876543212"
 *                     avatar_url: ""
 *                 - _id: "64a1b2c3d4e5f67890000011"
 *                   business_name: "Beta Traders"
 *                   user_id:
 *                     _id: "64a1b2c3d4e5f67890000005"
 *                     username: "beta_vendor"
 *                     full_name: "Beta Owner"
 *                     email: "beta@example.com"
 *                     phone: "+919876543213"
 *                     avatar_url: ""
 *       400:
 *         description: Invalid sales_user_id
 *         content:
 *           application/json:
 *             example:
 *               message: "Invalid sales_user_id"
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden — Admin only
 *         content:
 *           application/json:
 *             example:
 *               message: "Forbidden - Admin only"
 *       404:
 *         description: Sales officer not found
 *         content:
 *           application/json:
 *             example:
 *               message: "Sales officer not found"
 *       500:
 *         description: Server error
 */
router.get('/officers/:sales_user_id/vendors', requireAdmin, getVendorsAssignedToOfficer);

module.exports = router;