const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { 
  getSuggestions, 
  getSuggestedUsers, 
  getSuggestedReels, 
  getSuggestedAds,
  getSuggestedVendors
} = require('../controllers/suggestion.controller');

/**
 * @swagger
 * tags:
 *   name: Suggestions
 *   description: Suggestions for reels, ads, and users
 */

/**
 * @swagger
 * /api/suggestions:
 *   get:
 *     summary: Get combined suggestions for reels, ads, and users
 *     tags: [Suggestions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of suggestions to return for each category
 *     responses:
 *       200:
 *         description: Suggestions retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/', auth, getSuggestions);

/**
 * @swagger
 * /api/suggestions/users:
 *   get:
 *     summary: Get suggested users
 *     tags: [Suggestions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: User suggestions retrieved successfully
 */
router.get('/users', auth, getSuggestedUsers);

/**
 * @swagger
 * /api/suggestions/reels:
 *   get:
 *     summary: Get suggested reels
 *     tags: [Suggestions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Reel suggestions retrieved successfully
 */
router.get('/reels', auth, getSuggestedReels);

/**
 * @swagger
 * /api/suggestions/ads:
 *   get:
 *     summary: Get suggested ads
 *     tags: [Suggestions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Ad suggestions retrieved successfully
 */
router.get('/ads', auth, getSuggestedAds);

/**
 * @swagger
 * /api/suggestions/vendors:
 *   get:
 *     summary: Get suggested vendors
 *     tags: [Suggestions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Vendor suggestions retrieved successfully
 */
router.get('/vendors', auth, getSuggestedVendors);

module.exports = router;
