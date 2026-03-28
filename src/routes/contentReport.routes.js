const router = require('express').Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const ctrl = require('../controllers/contentReport.controller');

/**
 * @swagger
 * tags:
 *   - name: Content Reports
 *     description: Report posts, reels, stories and ads
 */

/**
 * @swagger
 * /api/content-reports/reasons:
 *   get:
 *     summary: Get available report reasons
 *     tags: [Content Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Report reasons list
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               reasons:
 *                 - "I just don't like it"
 *                 - "Bullying or unwanted contact"
 *                 - "Suicide, self-injury or eating disorders"
 *                 - "Violence, hate or exploitation"
 *                 - "Selling or promoting restricted items"
 *                 - "Nudity or sexual activity"
 *                 - "Scam, fraud or spam"
 *                 - "False information"
 */
router.get('/reasons', auth, ctrl.getReportReasons);

/**
 * @swagger
 * /api/content-reports:
 *   post:
 *     summary: Report a post, reel, story or ad
 *     tags: [Content Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content_type, content_id, reason]
 *             properties:
 *               content_type:
 *                 type: string
 *                 enum: [post, reel, story, ad, comment]
 *               content_id:
 *                 type: string
 *               reason:
 *                 type: string
 *               details:
 *                 type: string
 *           example:
 *             content_type: "post"
 *             content_id: "67e3aa001122334455667801"
 *             reason: "Scam, fraud or spam"
 *             details: "This content looks misleading."
 *     responses:
 *       201:
 *         description: Report submitted successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Report submitted successfully"
 *               report:
 *                 _id: "67e3aa001122334455668101"
 *                 reporter_id: "67e3aa001122334455667711"
 *                 owner_id: "67e3aa001122334455667712"
 *                 content_type: "post"
 *                 content_id: "67e3aa001122334455667801"
 *                 reason: "Scam, fraud or spam"
 *                 details: "This content looks misleading."
 *                 status: "pending"
 *                 createdAt: "2026-03-28T10:00:00.000Z"
 *       400:
 *         description: Validation error or already reported
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Content not found
 */
router.post('/', auth, ctrl.createContentReport);

/**
 * @swagger
 * /api/content-reports/my:
 *   get:
 *     summary: Get my submitted reports
 *     tags: [Content Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: My report list
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               total: 2
 *               reports:
 *                 - _id: "67e3aa001122334455668101"
 *                   reporter_id: "67e3aa001122334455667711"
 *                   owner_id: "67e3aa001122334455667712"
 *                   content_type: "post"
 *                   content_id: "67e3aa001122334455667801"
 *                   reason: "Scam, fraud or spam"
 *                   details: "This content looks misleading."
 *                   status: "pending"
 *                   createdAt: "2026-03-28T10:00:00.000Z"
 *                   updatedAt: "2026-03-28T10:00:00.000Z"
 */
router.get('/my', auth, ctrl.getMyContentReports);

/**
 * @swagger
 * /api/content-reports/admin:
 *   get:
 *     summary: List reported content for admin review
 *     tags: [Content Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: content_type
 *         schema:
 *           type: string
 *           enum: [post, reel, story, ad, comment]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, reviewed, action_taken, rejected]
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
 *         description: Admin report list
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               total: 1
 *               page: 1
 *               limit: 20
 *               total_pages: 1
 *               reports:
 *                 - _id: "67e3aa001122334455668101"
 *                   reporter_id:
 *                     _id: "67e3aa001122334455667711"
 *                     username: "member_one"
 *                     full_name: "Member One"
 *                     avatar_url: "https://example.com/member.jpg"
 *                   owner_id:
 *                     _id: "67e3aa001122334455667712"
 *                     username: "vendor_one"
 *                     full_name: "Vendor One"
 *                     avatar_url: "https://example.com/vendor.jpg"
 *                   content_type: "ad"
 *                   content_id: "67e3aa001122334455667801"
 *                   reason: "False information"
 *                   details: "This ad claims unrealistic results."
 *                   status: "pending"
 *                   admin_note: ""
 *                   createdAt: "2026-03-28T10:00:00.000Z"
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.get('/admin', auth, requireRole('admin'), ctrl.listContentReports);

/**
 * @swagger
 * /api/content-reports/admin/{id}:
 *   patch:
 *     summary: Update report review status
 *     tags: [Content Reports]
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
 *                 enum: [pending, reviewed, action_taken, rejected]
 *               admin_note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Report updated successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Report updated successfully"
 *               report:
 *                 _id: "67e3aa001122334455668101"
 *                 reporter_id: "67e3aa001122334455667711"
 *                 owner_id: "67e3aa001122334455667712"
 *                 content_type: "post"
 *                 content_id: "67e3aa001122334455667801"
 *                 reason: "Scam, fraud or spam"
 *                 details: "This content looks misleading."
 *                 status: "reviewed"
 *                 admin_note: "Queued for moderation follow-up."
 *                 reviewed_by: "67e3aa001122334455667700"
 *                 reviewed_at: "2026-03-28T11:00:00.000Z"
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Report not found
 */
router.patch('/admin/:id', auth, requireRole('admin'), ctrl.updateContentReportStatus);

module.exports = router;
