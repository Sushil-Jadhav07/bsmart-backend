'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const {
  createBugReport,
  getMyBugReports,
  getBugReportById,
  adminGetAllBugReports,
  adminUpdateBugReport,
} = require('../controllers/bugReport.controller');

/**
 * @swagger
 * tags:
 *   - name: BugReports
 *     description: In-app bug reporting — technical/app issues
 */

// ─────────────────────────────────────────────────────────────────────────────
// USER — registered before "/:id" so "/my" and "/admin/*" are matched first
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/bug-reports:
 *   post:
 *     summary: Submit a bug report
 *     tags: [BugReports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, description]
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [app_crash, video_not_playing, login_issue, payment_issue, rewards_issue, upload_issue, ui_problem, other]
 *               description: { type: string, example: "App crashes when I open the wallet screen" }
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     url:  { type: string }
 *                     type: { type: string, enum: [image, video], default: image }
 *               app_version:  { type: string, example: "2.4.1" }
 *               os_type:      { type: string, enum: [android, ios] }
 *               os_version:   { type: string, example: "14" }
 *               device_model: { type: string, example: "Pixel 7" }
 *               network_type: { type: string, enum: [wifi, mobile_data, other] }
 *     responses:
 *       201:
 *         description: Report submitted
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Thank you. Your report has been submitted successfully."
 *               data: { ticket_id: "BUG-A1B2C3D4", status: "new", priority: "medium" }
 *       400:
 *         description: Validation error
 */
router.post('/', auth, createBugReport);

/**
 * @swagger
 * /api/bug-reports/my:
 *   get:
 *     summary: Get my submitted bug reports
 *     tags: [BugReports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [new, in_progress, fixed, closed] }
 *     responses:
 *       200:
 *         description: My bug reports
 */
router.get('/my', auth, getMyBugReports);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN / SALES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/bug-reports/admin/all:
 *   get:
 *     summary: List all bug reports (admin, sales)
 *     tags: [BugReports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [new, in_progress, fixed, closed] }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [app_crash, video_not_playing, login_issue, payment_issue, rewards_issue, upload_issue, ui_problem, other] }
 *       - in: query
 *         name: priority
 *         schema: { type: string, enum: [low, medium, high, critical] }
 *       - in: query
 *         name: assigned_to
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated list of bug reports
 */
router.get('/admin/all', auth, requireRole('admin', 'sales'), adminGetAllBugReports);

/**
 * @swagger
 * /api/bug-reports/admin/{id}:
 *   patch:
 *     summary: Update status, priority, or developer assignment (admin, sales)
 *     tags: [BugReports]
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
 *             properties:
 *               status:      { type: string, enum: [new, in_progress, fixed, closed] }
 *               priority:    { type: string, enum: [low, medium, high, critical] }
 *               assigned_to: { type: string, description: "Developer's user id, or null to unassign" }
 *               admin_note:  { type: string }
 *     responses:
 *       200:
 *         description: Bug report updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Bug report not found
 */
router.patch('/admin/:id', auth, requireRole('admin', 'sales'), adminUpdateBugReport);

/**
 * @swagger
 * /api/bug-reports/{id}:
 *   get:
 *     summary: Get a single bug report by id (reporter, or admin/sales)
 *     tags: [BugReports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Bug report detail
 *       403:
 *         description: Not the reporter and not admin/sales
 *       404:
 *         description: Bug report not found
 */
router.get('/:id', auth, getBugReportById);

module.exports = router;
