const express    = require('express');
const router     = express.Router();
const auth       = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  getSummaryReport,
  getClickReport,
  getEngagementReport,
  getGeographicReport,
  getPerformanceSummaryReport,
  getAdminSummaryReport,
} = require('../controllers/report.controller');

// Both vendor AND admin can access report routes
const allowReports = requireRole('vendor', 'admin');

/**
 * @swagger
 * /api/reports/summary:
 *   get:
 *     summary: Reports summary
 *     description: |
 *       Authenticated dashboard overview for summary cards.
 *       Supports `range` (7d, 30d, 90d) or explicit `start_date` / `end_date`.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d]
 *           default: 30d
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Admin summary metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_impressions: { type: number }
 *                     total_clicks: { type: number }
 *                     engagement_rate: { type: number }
 *                     total_spend: { type: number }
 *                     conversions: { type: number }
 *                     reach: { type: number }
 *                     total_users: { type: number }
 *                     total_vendors: { type: number }
 *                     total_posts: { type: number }
 *                     total_ads: { type: number }
 *                     total_ads_pending: { type: number }
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.get('/summary', auth, getAdminSummaryReport);

// ─── Shared filter parameters (reused across both endpoints) ─────────────────
/**
 * @swagger
 * components:
 *   parameters:
 *     reportStartDate:
 *       in: query
 *       name: startDate
 *       schema:
 *         type: string
 *         format: date
 *         example: "2025-01-01"
 *       description: Start of date range (inclusive). Defaults to all-time if omitted.
 *     reportEndDate:
 *       in: query
 *       name: endDate
 *       schema:
 *         type: string
 *         format: date
 *         example: "2025-03-31"
 *       description: End of date range (inclusive, full day). Defaults to all-time if omitted.
 *     reportAdId:
 *       in: query
 *       name: ad_id
 *       schema:
 *         type: string
 *         example: "664f1a2b3c4d5e6f7a8b9c0a"
 *       description: Narrow report to a single ad.
 *     reportVendorId:
 *       in: query
 *       name: vendor_id
 *       schema:
 *         type: string
 *         example: "664f1a2b3c4d5e6f7a8b9d0b"
 *       description: Admin only — scope report to a specific vendor.
 *     reportCountry:
 *       in: query
 *       name: country
 *       schema:
 *         type: string
 *         example: "India"
 *       description: Filter events by viewer country (case-insensitive partial match).
 *     reportGender:
 *       in: query
 *       name: gender
 *       schema:
 *         type: string
 *         enum: [male, female, other]
 *       description: Filter events by viewer gender.
 *     reportLanguage:
 *       in: query
 *       name: language
 *       schema:
 *         type: string
 *         example: "Hindi"
 *       description: Filter events by viewer language (case-insensitive partial match).
 *     reportPage:
 *       in: query
 *       name: page
 *       schema:
 *         type: integer
 *         default: 1
 *       description: Page number for pagination.
 *     reportLimit:
 *       in: query
 *       name: limit
 *       schema:
 *         type: integer
 *         default: 20
 *         maximum: 100
 *       description: Results per page (max 100).
 */

// ─────────────────────────────────────────────────────────────────────────────
// CLICK REPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/reports/clicks:
 *   get:
 *     summary: Click Report — click-through metrics per ad
 *     description: |
 *       Returns one row per ad with the following metrics:
 *       - **total_clicks** — all click events in the date window
 *       - **unique_clicks** — distinct users who clicked
 *       - **invalid_clicks** — fraud-flagged clicks
 *       - **cpc** — coins spent per click (total_coins_spent / total_clicks)
 *       - **click_rate** — percentage of impressions that led to a click
 *       - **impressions** — total ad views (from AdView) in the same window
 *
 *       Vendors see only their own ads. Admins see all ads (or filter by vendor_id).
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/reportStartDate'
 *       - $ref: '#/components/parameters/reportEndDate'
 *       - $ref: '#/components/parameters/reportAdId'
 *       - $ref: '#/components/parameters/reportVendorId'
 *       - $ref: '#/components/parameters/reportCountry'
 *       - $ref: '#/components/parameters/reportGender'
 *       - $ref: '#/components/parameters/reportLanguage'
 *       - $ref: '#/components/parameters/reportPage'
 *       - $ref: '#/components/parameters/reportLimit'
 *     responses:
 *       200:
 *         description: Click report data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 4
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 20
 *                 totalPages:
 *                   type: integer
 *                   example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       ad_id:
 *                         type: string
 *                         example: "664f1a2b3c4d5e6f7a8b9c0a"
 *                       ad_name:
 *                         type: string
 *                         example: "Summer Sale"
 *                       status:
 *                         type: string
 *                         enum: [pending, active, paused, rejected]
 *                       category:
 *                         type: string
 *                         example: "Fashion"
 *                       impressions:
 *                         type: integer
 *                         example: 74200
 *                       total_clicks:
 *                         type: integer
 *                         example: 1240
 *                       unique_clicks:
 *                         type: integer
 *                         example: 980
 *                       invalid_clicks:
 *                         type: integer
 *                         example: 12
 *                       cpc:
 *                         type: number
 *                         description: Coins per click
 *                         example: 2.30
 *                       click_rate:
 *                         type: number
 *                         description: Click rate as a percentage
 *                         example: 3.20
 *                       coins_spent:
 *                         type: number
 *                         example: 2852
 *             example:
 *               total: 4
 *               page: 1
 *               limit: 20
 *               totalPages: 1
 *               data:
 *                 - ad_id: "664f1a2b3c4d5e6f7a8b9c0a"
 *                   ad_name: "Summer Sale"
 *                   status: "active"
 *                   category: "Fashion"
 *                   impressions: 38750
 *                   total_clicks: 1240
 *                   unique_clicks: 980
 *                   invalid_clicks: 12
 *                   cpc: 2.30
 *                   click_rate: 3.20
 *                   coins_spent: 2852
 *                 - ad_id: "664f1a2b3c4d5e6f7a8b9c0b"
 *                   ad_name: "Brand Boost"
 *                   status: "active"
 *                   category: "Electronics"
 *                   impressions: 31428
 *                   total_clicks: 880
 *                   unique_clicks: 720
 *                   invalid_clicks: 8
 *                   cpc: 1.90
 *                   click_rate: 2.80
 *                   coins_spent: 1672
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — role not allowed
 *       500:
 *         description: Server error
 */
router.get('/clicks', auth, allowReports, getClickReport);

// ─────────────────────────────────────────────────────────────────────────────
// ENGAGEMENT REPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/reports/engagement:
 *   get:
 *     summary: Engagement Report — likes, comments, saves & engagement rate per ad
 *     description: |
 *       Returns one row per ad with the following metrics for the selected date window:
 *       - **likes** — like events from MemberAdAction
 *       - **dislikes** — dislike events from MemberAdAction
 *       - **comments** — non-deleted AdComment count
 *       - **saves** — save events from AdEngagement
 *       - **impressions** — total AdView count
 *       - **engagement_rate** — (likes + comments + saves) / impressions × 100
 *
 *       Demographic filters (country, gender, language) restrict rows to ads
 *       that received save-type engagement from viewers matching those demographics.
 *
 *       Vendors see only their own ads. Admins see all ads (or filter by vendor_id).
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/reportStartDate'
 *       - $ref: '#/components/parameters/reportEndDate'
 *       - $ref: '#/components/parameters/reportAdId'
 *       - $ref: '#/components/parameters/reportVendorId'
 *       - $ref: '#/components/parameters/reportCountry'
 *       - $ref: '#/components/parameters/reportGender'
 *       - $ref: '#/components/parameters/reportLanguage'
 *       - $ref: '#/components/parameters/reportPage'
 *       - $ref: '#/components/parameters/reportLimit'
 *     responses:
 *       200:
 *         description: Engagement report data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 4
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 20
 *                 totalPages:
 *                   type: integer
 *                   example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       ad_id:
 *                         type: string
 *                       ad_name:
 *                         type: string
 *                       status:
 *                         type: string
 *                       category:
 *                         type: string
 *                       impressions:
 *                         type: integer
 *                       likes:
 *                         type: integer
 *                       dislikes:
 *                         type: integer
 *                       comments:
 *                         type: integer
 *                       saves:
 *                         type: integer
 *                       engagement_rate:
 *                         type: number
 *                         description: Percentage of impressions that resulted in engagement
 *             example:
 *               total: 4
 *               page: 1
 *               limit: 20
 *               totalPages: 1
 *               data:
 *                 - ad_id: "664f1a2b3c4d5e6f7a8b9c0a"
 *                   ad_name: "Summer Sale"
 *                   status: "active"
 *                   category: "Fashion"
 *                   impressions: 38750
 *                   likes: 512
 *                   dislikes: 38
 *                   comments: 74
 *                   saves: 201
 *                   engagement_rate: 2.03
 *                 - ad_id: "664f1a2b3c4d5e6f7a8b9c0b"
 *                   ad_name: "Brand Boost"
 *                   status: "active"
 *                   category: "Electronics"
 *                   impressions: 31428
 *                   likes: 390
 *                   dislikes: 22
 *                   comments: 55
 *                   saves: 140
 *                   engagement_rate: 1.86
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — role not allowed
 *       500:
 *         description: Server error
 */
router.get('/engagement', auth, allowReports, getEngagementReport);

/**
 * @swagger
 * /api/reports/geographic:
 *   get:
 *     summary: Geographic Report - country-wise impressions, clicks, CTR and reach
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/reportStartDate'
 *       - $ref: '#/components/parameters/reportEndDate'
 *       - $ref: '#/components/parameters/reportAdId'
 *       - $ref: '#/components/parameters/reportVendorId'
 *       - $ref: '#/components/parameters/reportCountry'
 *       - $ref: '#/components/parameters/reportGender'
 *       - $ref: '#/components/parameters/reportLanguage'
 *       - $ref: '#/components/parameters/reportPage'
 *       - $ref: '#/components/parameters/reportLimit'
 *     responses:
 *       200:
 *         description: Geographic report data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.get('/geographic', auth, allowReports, getGeographicReport);


/**
 * @swagger
 * /api/reports/performance-summary:
 *   get:
 *     summary: Performance Summary — date-wise impressions, clicks, CTR, reach & frequency
 *     description: |
 *       Returns one row per calendar day with the following metrics for the selected
 *       date window and optional filters:
 *
 *       - **impressions** — total ad views (`AdView.view_count` sum) for that day
 *       - **clicks**      — total click events (`AdClick` count) for that day
 *       - **ctr**         — Click-Through Rate = clicks / impressions × 100 (%)
 *       - **reach**       — distinct users who saw the ad on that day
 *       - **frequency**   — average times each reached user saw the ad = impressions / reach
 *
 *       Vendors see only their own ads. Admins see all (or filter by `vendor_id`).
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/reportStartDate'
 *       - $ref: '#/components/parameters/reportEndDate'
 *       - $ref: '#/components/parameters/reportAdId'
 *       - $ref: '#/components/parameters/reportVendorId'
 *       - $ref: '#/components/parameters/reportCountry'
 *       - $ref: '#/components/parameters/reportGender'
 *       - $ref: '#/components/parameters/reportLanguage'
 *     responses:
 *       200:
 *         description: Performance summary data grouped by date
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 filters:
 *                   type: object
 *                 total_days:
 *                   type: integer
 *                   example: 5
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                         example: "2025-01-01"
 *                       impressions:
 *                         type: integer
 *                         example: 12400
 *                       clicks:
 *                         type: integer
 *                         example: 320
 *                       ctr:
 *                         type: number
 *                         description: Click-Through Rate (%)
 *                         example: 2.58
 *                       reach:
 *                         type: integer
 *                         description: Distinct users who viewed the ad
 *                         example: 9800
 *                       frequency:
 *                         type: number
 *                         description: Average impressions per reached user
 *                         example: 1.26
 *             example:
 *               filters:
 *                 startDate: "2025-01-01"
 *                 endDate: "2025-01-05"
 *                 ad_id: null
 *                 country: null
 *                 gender: null
 *                 language: null
 *               total_days: 5
 *               data:
 *                 - date: "2025-01-01"
 *                   impressions: 12400
 *                   clicks: 320
 *                   ctr: 2.58
 *                   reach: 9800
 *                   frequency: 1.26
 *                 - date: "2025-01-02"
 *                   impressions: 15200
 *                   clicks: 410
 *                   ctr: 2.70
 *                   reach: 11200
 *                   frequency: 1.36
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.get('/performance-summary', auth, allowReports, getPerformanceSummaryReport);

module.exports = router;
