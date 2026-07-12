'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const {
  listPolicyTypes,
  getAllPolicies,
  createPolicy,
  getPolicyByType,
  updatePolicy,
  updatePolicyStatus,
  getPolicyHistory,
} = require('../controllers/policy.controller');

/**
 * @swagger
 * tags:
 *   - name: Policies
 *     description: Legal documents (Terms, Privacy, Refund, and any custom policy types)
 */

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — registered before the public "/:type" route so these literal paths
// are matched first (Express matches routes in registration order).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/policies/types:
 *   get:
 *     summary: List all policy types (admin) — lightweight, for dropdowns/menus
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of policy types with title, status, version, updatedAt
 */
router.get('/types', auth, requireRole('admin'), listPolicyTypes);

/**
 * @swagger
 * /api/policies:
 *   get:
 *     summary: Get all policies (admin dashboard list page)
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All policy documents keyed by type
 *   post:
 *     summary: Create a new policy type (admin)
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, title]
 *             properties:
 *               type:
 *                 type: string
 *                 example: cookies
 *                 description: Lowercase letters, numbers, hyphens, underscores only. Must be unique.
 *               title:
 *                 type: string
 *                 example: Cookie Policy
 *               content:
 *                 type: string
 *                 example: "<h1>Cookie Policy</h1><p>...</p>"
 *               status:
 *                 type: string
 *                 enum: [draft, published]
 *                 default: draft
 *     responses:
 *       201:
 *         description: Policy created
 *       400:
 *         description: Validation error
 *       409:
 *         description: A policy with this type already exists
 */
router.get('/', auth, requireRole('admin'), getAllPolicies);
router.post('/', auth, requireRole('admin'), createPolicy);

/**
 * @swagger
 * /api/policies/{type}/history:
 *   get:
 *     summary: Get version history for a policy (admin)
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Last 20 saved versions, newest first
 *       404:
 *         description: Policy not found
 */
router.get('/:type/history', auth, requireRole('admin'), getPolicyHistory);

/**
 * @swagger
 * /api/policies/{type}:
 *   put:
 *     summary: Save policy content (admin)
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string }
 *     responses:
 *       200:
 *         description: Policy saved successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Policy not found — create it first via POST /api/policies
 */
router.put('/:type', auth, requireRole('admin'), updatePolicy);

/**
 * @swagger
 * /api/policies/{type}/status:
 *   patch:
 *     summary: Toggle published/draft status only (admin) — does not touch content or history
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [draft, published] }
 *     responses:
 *       200:
 *         description: Status updated
 *       404:
 *         description: Policy not found
 */
router.patch('/:type/status', auth, requireRole('admin'), updatePolicyStatus);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — mobile app reads this to display policy pages. Must be registered
// last so it never swallows the literal admin routes above (/types, /, etc).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/policies/{type}:
 *   get:
 *     summary: Get a single policy by type (public — used by mobile app)
 *     tags: [Policies]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Policy document
 *       404:
 *         description: Policy not found
 */
router.get('/:type', getPolicyByType);

module.exports = router;
