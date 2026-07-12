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
  getPoliciesByApp,
  updatePolicy,
  updatePolicyMeta,
  updatePolicyStatus,
  getPolicyHistory,
  deletePolicy,
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
 *               app_source:
 *                 type: string
 *                 enum: [member, vendor, both]
 *                 default: both
 *                 description: Which app this policy applies to
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

/**
 * @swagger
 * /api/policies/{type}/meta:
 *   patch:
 *     summary: Edit policy type metadata — title and/or app_source (admin). Does not touch content, version, history, or status.
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
 *             properties:
 *               title:      { type: string, example: "Terms & Conditions" }
 *               app_source: { type: string, enum: [member, vendor, both] }
 *     responses:
 *       200:
 *         description: Policy metadata updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Policy not found
 *   delete:
 *     summary: Delete a policy type permanently — content and history are removed with it (admin)
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
 *         description: Policy deleted
 *       404:
 *         description: Policy not found
 */
router.patch('/:type/meta', auth, requireRole('admin'), updatePolicyMeta);
router.delete('/:type', auth, requireRole('admin'), deletePolicy);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — no auth required.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/policies/app/{appSource}:
 *   get:
 *     summary: List published policies for one app (public — no auth)
 *     description: Returns published policies where app_source matches the given app, plus any marked "both". Optionally narrow to a single policy with ?type=.
 *     tags: [Policies]
 *     parameters:
 *       - in: path
 *         name: appSource
 *         required: true
 *         schema: { type: string, enum: [member, vendor] }
 *       - in: query
 *         name: type
 *         required: false
 *         schema: { type: string }
 *         description: Filter to a single policy type (e.g. "terms", "community-guidelines")
 *         example: community-guidelines
 *     responses:
 *       200:
 *         description: List of published policies for that app (or a single-item list when ?type= is used)
 *       400:
 *         description: appSource must be member or vendor
 *       404:
 *         description: No published policy found for the given type
 */
router.get('/app/:appSource', getPoliciesByApp);

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
