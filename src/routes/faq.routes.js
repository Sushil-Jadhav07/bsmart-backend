'use strict';

const express     = require('express');
const router      = express.Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const {
  listFaqs,
  getFaq,
  adminListFaqs,
  createFaq,
  updateFaq,
  toggleFaq,
  reorderFaqs,
  deleteFaq,
} = require('../controllers/faq.controller');

/**
 * @swagger
 * tags:
 *   - name: FAQ
 *     description: Frequently Asked Questions for BSmart and Ruvees websites
 */

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — no auth required (for website visitors)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/faq:
 *   get:
 *     summary: List all active FAQs (public — for website)
 *     tags: [FAQ]
 *     parameters:
 *       - in: query
 *         name: app_source
 *         schema: { type: string, enum: [bsmart, ruvees] }
 *         description: Filter by website. Returns FAQs for that app + FAQs marked "both"
 *         example: vendor
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [general, account, payment, vendor, member, ads, other] }
 *         description: Filter by category
 *     responses:
 *       200:
 *         description: List of active FAQs sorted by order
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               total: 3
 *               data:
 *                 - _id: "665f..."
 *                   question: "How do I create an account?"
 *                   answer: "Download the BSmart app and tap Sign Up..."
 *                   category: "account"
 *                   app_source: "both"
 *                   order: 1
 *                   is_active: true
 */
router.get('/', listFaqs);

/**
 * @swagger
 * /api/faq/{id}:
 *   get:
 *     summary: Get a single active FAQ by ID (public)
 *     tags: [FAQ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: FAQ detail
 *       404:
 *         description: FAQ not found or inactive
 */
router.get('/:id', getFaq);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — auth required
// Static routes MUST come before /:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/faq/admin:
 *   get:
 *     summary: List all FAQs including inactive ones (admin)
 *     tags: [FAQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: app_source
 *         schema: { type: string, enum: [member, vendor, both] }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [general, account, payment, vendor, member, ads, other] }
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *         description: Filter by active/inactive
 *     responses:
 *       200:
 *         description: All FAQs
 *   post:
 *     summary: Create a new FAQ (admin)
 *     tags: [FAQ]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [question, answer]
 *             properties:
 *               question:
 *                 type: string
 *                 example: "How do I recharge my wallet?"
 *               answer:
 *                 type: string
 *                 example: "Go to Wallet → Recharge → Enter amount → Pay via Razorpay."
 *               category:
 *                 type: string
 *                 enum: [general, account, payment, vendor, member, ads, other]
 *                 default: general
 *               app_source:
 *                 type: string
 *                 enum: [member, vendor, both]
 *                 default: both
 *                 description: Which audience to show this FAQ to — member, vendor, or both
 *               order:
 *                 type: number
 *                 default: 0
 *                 description: Display order — lower number appears first
 *               is_active:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: FAQ created
 *       400:
 *         description: Missing required fields
 */
router.get('/admin',  auth, requireRole('admin'), adminListFaqs);
router.post('/admin', auth, requireRole('admin'), createFaq);

/**
 * @swagger
 * /api/faq/admin/reorder:
 *   patch:
 *     summary: Bulk update display order of FAQs (admin) — drag-and-drop support
 *     tags: [FAQ]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [faqs]
 *             properties:
 *               faqs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [id, order]
 *                   properties:
 *                     id:    { type: string }
 *                     order: { type: number }
 *                 example:
 *                   - { id: "665f...", order: 1 }
 *                   - { id: "665a...", order: 2 }
 *                   - { id: "665b...", order: 3 }
 *     responses:
 *       200:
 *         description: FAQs reordered successfully
 */
router.patch('/admin/reorder', auth, requireRole('admin'), reorderFaqs);

/**
 * @swagger
 * /api/faq/admin/{id}:
 *   put:
 *     summary: Update a FAQ (admin)
 *     tags: [FAQ]
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
 *               question:   { type: string }
 *               answer:     { type: string }
 *               category:   { type: string, enum: [general, account, payment, vendor, member, ads, other] }
 *               app_source: { type: string, enum: [member, vendor, both] }
 *               order:      { type: number }
 *               is_active:  { type: boolean }
 *     responses:
 *       200:
 *         description: FAQ updated
 *       404:
 *         description: FAQ not found
 *   delete:
 *     summary: Delete a FAQ permanently (admin)
 *     tags: [FAQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: FAQ deleted
 *       404:
 *         description: FAQ not found
 */
router.put('/admin/:id',    auth, requireRole('admin'), updateFaq);
router.delete('/admin/:id', auth, requireRole('admin'), deleteFaq);

/**
 * @swagger
 * /api/faq/admin/{id}/toggle:
 *   patch:
 *     summary: Toggle FAQ active/inactive (admin)
 *     tags: [FAQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: FAQ toggled
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "FAQ deactivated"
 *               data: { _id: "665f...", is_active: false }
 */
router.patch('/admin/:id/toggle', auth, requireRole('admin'), toggleFaq);

module.exports = router;
