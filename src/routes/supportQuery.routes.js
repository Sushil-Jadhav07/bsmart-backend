const router = require('express').Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const ctrl = require('../controllers/supportQuery.controller');

/**
 * @swagger
 * tags:
 *   - name: Support Queries
 *     description: Customer support queries from BSmart & Ruvees apps
 *
 * components:
 *   schemas:
 *     SupportQueryReply:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         sender_type:
 *           type: string
 *           enum: [user, admin, sales]
 *         sender_id:
 *           oneOf:
 *             - type: string
 *             - type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 username:
 *                   type: string
 *                 full_name:
 *                   type: string
 *                 avatar_url:
 *                   type: string
 *                 role:
 *                   type: string
 *         message:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *     SupportQuery:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         user_id:
 *           oneOf:
 *             - type: string
 *             - type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 username:
 *                   type: string
 *                 full_name:
 *                   type: string
 *                 avatar_url:
 *                   type: string
 *         app_source:
 *           type: string
 *           enum: [bsmart, ruvees]
 *         subject:
 *           type: string
 *         message:
 *           type: string
 *         category:
 *           type: string
 *           enum: [account, payment, technical, general, other]
 *         status:
 *           type: string
 *           enum: [open, in_progress, resolved, closed]
 *         assigned_to:
 *           nullable: true
 *           oneOf:
 *             - type: string
 *             - type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 username:
 *                   type: string
 *                 full_name:
 *                   type: string
 *                 avatar_url:
 *                   type: string
 *         assigned_by:
 *           nullable: true
 *           oneOf:
 *             - type: string
 *             - type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 username:
 *                   type: string
 *                 full_name:
 *                   type: string
 *         assigned_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         replies:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/SupportQueryReply'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// ─── APP-SIDE (authenticated user) ─────────────────────────────────────────

/**
 * @swagger
 * /api/support-queries:
 *   post:
 *     summary: Submit a new support query
 *     tags: [Support Queries]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subject, message, category, app_source]
 *             properties:
 *               subject:
 *                 type: string
 *                 example: "Payment not received"
 *               message:
 *                 type: string
 *                 example: "I made a payment 2 days ago but it is not reflecting in my wallet."
 *               category:
 *                 type: string
 *                 enum: [account, payment, technical, general, other]
 *                 example: "payment"
 *               app_source:
 *                 type: string
 *                 enum: [bsmart, ruvees]
 *                 example: "bsmart"
 *     responses:
 *       201:
 *         description: Support query submitted successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Support query submitted successfully"
 *               query:
 *                 _id: "67e3aa001122334455669001"
 *                 user_id: "67e3aa001122334455667711"
 *                 app_source: "bsmart"
 *                 subject: "Payment not received"
 *                 message: "I made a payment 2 days ago but it is not reflecting in my wallet."
 *                 category: "payment"
 *                 status: "open"
 *                 assigned_to: null
 *                 replies: []
 *                 createdAt: "2026-06-29T10:00:00.000Z"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authorized
 */
router.post('/', auth, ctrl.createQuery);

/**
 * @swagger
 * /api/support-queries/my:
 *   get:
 *     summary: Get my submitted support queries
 *     tags: [Support Queries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, resolved, closed]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: My support queries
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               total: 5
 *               page: 1
 *               limit: 20
 *               total_pages: 1
 *               queries:
 *                 - _id: "67e3aa001122334455669001"
 *                   user_id: "67e3aa001122334455667711"
 *                   app_source: "bsmart"
 *                   subject: "Payment not received"
 *                   message: "I made a payment 2 days ago..."
 *                   category: "payment"
 *                   status: "open"
 *                   replies: []
 *                   createdAt: "2026-06-29T10:00:00.000Z"
 *       401:
 *         description: Not authorized
 */
router.get('/my', auth, ctrl.getMyQueries);

/**
 * @swagger
 * /api/support-queries/my/{id}:
 *   get:
 *     summary: Get a single support query with full reply thread
 *     tags: [Support Queries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Support query details with replies
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               query:
 *                 _id: "67e3aa001122334455669001"
 *                 user_id: "67e3aa001122334455667711"
 *                 subject: "Payment not received"
 *                 message: "I made a payment 2 days ago..."
 *                 category: "payment"
 *                 status: "in_progress"
 *                 replies:
 *                   - _id: "67e3aa001122334455669101"
 *                     sender_type: "admin"
 *                     sender_id:
 *                       _id: "67e3aa001122334455667700"
 *                       username: "admin_user"
 *                       full_name: "Admin User"
 *                       avatar_url: "https://example.com/admin.jpg"
 *                       role: "admin"
 *                     message: "We are looking into this."
 *                     createdAt: "2026-06-29T11:00:00.000Z"
 *       400:
 *         description: Invalid id
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Query not found
 */
router.get('/my/:id', auth, ctrl.getMyQueryById);

/**
 * @swagger
 * /api/support-queries/my/{id}/reply:
 *   post:
 *     summary: Reply to own support query
 *     tags: [Support Queries]
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
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *                 example: "Any update on my payment?"
 *     responses:
 *       200:
 *         description: Reply added successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Reply added"
 *       400:
 *         description: Validation error or query is closed
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Query not found
 */
router.post('/my/:id/reply', auth, ctrl.replyToMyQuery);

/**
 * @swagger
 * /api/support-queries/my/{id}:
 *   delete:
 *     summary: Delete own support query
 *     tags: [Support Queries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Query deleted successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Query deleted successfully"
 *       400:
 *         description: Invalid id
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Query not found
 */
router.delete('/my/:id', auth, ctrl.deleteMyQuery);

// ─── ADMIN + SALES OFFICER ─────────────────────────────────────────────────

/**
 * @swagger
 * /api/support-queries/admin:
 *   get:
 *     summary: List all support queries (admin & sales)
 *     tags: [Support Queries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, resolved, closed]
 *       - in: query
 *         name: app_source
 *         schema:
 *           type: string
 *           enum: [bsmart, ruvees]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [account, payment, technical, general, other]
 *       - in: query
 *         name: assigned_to
 *         schema:
 *           type: string
 *         description: Filter by assigned sales officer ID, or "unassigned" for unassigned queries
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: All support queries with user details
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               total: 25
 *               page: 1
 *               limit: 20
 *               total_pages: 2
 *               queries:
 *                 - _id: "67e3aa001122334455669001"
 *                   user_id:
 *                     _id: "67e3aa001122334455667711"
 *                     username: "john_doe"
 *                     full_name: "John Doe"
 *                     avatar_url: "https://example.com/john.jpg"
 *                   app_source: "bsmart"
 *                   subject: "Payment not received"
 *                   message: "I made a payment 2 days ago..."
 *                   category: "payment"
 *                   status: "open"
 *                   assigned_to:
 *                     _id: "67e3aa001122334455667799"
 *                     username: "sales_officer"
 *                     full_name: "Sales Officer"
 *                     avatar_url: "https://example.com/sales.jpg"
 *                   assigned_by:
 *                     _id: "67e3aa001122334455667700"
 *                     username: "admin_user"
 *                     full_name: "Admin User"
 *                   assigned_at: "2026-06-29T10:30:00.000Z"
 *                   createdAt: "2026-06-29T10:00:00.000Z"
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.get('/admin', auth, requireRole('admin', 'sales'), ctrl.listAllQueries);

/**
 * @swagger
 * /api/support-queries/admin/user/{userId}:
 *   get:
 *     summary: Get all support queries for a specific user (admin & sales)
 *     tags: [Support Queries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, resolved, closed]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Support queries for the specified user
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               total: 3
 *               page: 1
 *               limit: 20
 *               total_pages: 1
 *               queries:
 *                 - _id: "67e3aa001122334455669001"
 *                   user_id:
 *                     _id: "67e3aa001122334455667711"
 *                     username: "john_doe"
 *                     full_name: "John Doe"
 *                     avatar_url: "https://example.com/john.jpg"
 *                   subject: "Payment not received"
 *                   category: "payment"
 *                   status: "open"
 *                   createdAt: "2026-06-29T10:00:00.000Z"
 *       400:
 *         description: Invalid user id
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.get('/admin/user/:userId', auth, requireRole('admin', 'sales'), ctrl.getQueriesByUser);

/**
 * @swagger
 * /api/support-queries/admin/{id}:
 *   get:
 *     summary: Get a single support query with full details (admin & sales)
 *     tags: [Support Queries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Support query with user details and reply thread
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               query:
 *                 _id: "67e3aa001122334455669001"
 *                 user_id:
 *                   _id: "67e3aa001122334455667711"
 *                   username: "john_doe"
 *                   full_name: "John Doe"
 *                   avatar_url: "https://example.com/john.jpg"
 *                 subject: "Payment not received"
 *                 message: "I made a payment 2 days ago..."
 *                 category: "payment"
 *                 status: "in_progress"
 *                 assigned_to:
 *                   _id: "67e3aa001122334455667799"
 *                   username: "sales_officer"
 *                   full_name: "Sales Officer"
 *                   avatar_url: "https://example.com/sales.jpg"
 *                 replies:
 *                   - _id: "67e3aa001122334455669101"
 *                     sender_type: "sales"
 *                     sender_id:
 *                       _id: "67e3aa001122334455667799"
 *                       username: "sales_officer"
 *                       full_name: "Sales Officer"
 *                       avatar_url: "https://example.com/sales.jpg"
 *                       role: "sales"
 *                     message: "We are checking your payment."
 *                     createdAt: "2026-06-29T11:00:00.000Z"
 *       400:
 *         description: Invalid id
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Query not found
 */
router.get('/admin/:id', auth, requireRole('admin', 'sales'), ctrl.getQueryById);

/**
 * @swagger
 * /api/support-queries/admin/{id}/reply:
 *   post:
 *     summary: Reply to a support query (admin & sales)
 *     tags: [Support Queries]
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
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *                 example: "We have processed your payment. Please check now."
 *     responses:
 *       200:
 *         description: Reply added successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Reply added"
 *       400:
 *         description: Validation error or query is closed
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Query not found
 */
router.post('/admin/:id/reply', auth, requireRole('admin', 'sales'), ctrl.adminReply);

/**
 * @swagger
 * /api/support-queries/admin/{id}:
 *   patch:
 *     summary: Update support query status (admin & sales)
 *     tags: [Support Queries]
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, in_progress, resolved, closed]
 *     responses:
 *       200:
 *         description: Status updated successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Status updated"
 *       400:
 *         description: Invalid status
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Query not found
 */
router.patch('/admin/:id', auth, requireRole('admin', 'sales'), ctrl.updateQueryStatus);

/**
 * @swagger
 * /api/support-queries/admin/{id}:
 *   delete:
 *     summary: Delete a support query permanently (admin & sales)
 *     tags: [Support Queries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Query deleted successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Query deleted successfully"
 *       400:
 *         description: Invalid id
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Query not found
 */
router.delete('/admin/:id', auth, requireRole('admin', 'sales'), ctrl.deleteQuery);

// ─── ADMIN ONLY ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/support-queries/admin/{id}/assign:
 *   patch:
 *     summary: Assign a support query to a sales officer (admin only)
 *     tags: [Support Queries]
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
 *             required: [assigned_to]
 *             properties:
 *               assigned_to:
 *                 type: string
 *                 nullable: true
 *                 description: Sales officer user ID, or null to unassign
 *                 example: "67e3aa001122334455667799"
 *     responses:
 *       200:
 *         description: Query assignment updated
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Query assignment updated"
 *               query:
 *                 _id: "67e3aa001122334455669001"
 *                 user_id:
 *                   _id: "67e3aa001122334455667711"
 *                   username: "john_doe"
 *                   full_name: "John Doe"
 *                   avatar_url: "https://example.com/john.jpg"
 *                 assigned_to:
 *                   _id: "67e3aa001122334455667799"
 *                   username: "sales_officer"
 *                   full_name: "Sales Officer"
 *                   avatar_url: "https://example.com/sales.jpg"
 *                 assigned_by:
 *                   _id: "67e3aa001122334455667700"
 *                   username: "admin_user"
 *                   full_name: "Admin User"
 *                 assigned_at: "2026-06-29T10:30:00.000Z"
 *       400:
 *         description: Invalid id or assigned_to
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: Query not found
 */
router.patch('/admin/:id/assign', auth, requireRole('admin'), ctrl.assignQuery);

module.exports = router;
