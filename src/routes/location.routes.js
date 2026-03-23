const express = require('express');
const axios = require('axios');
const router = express.Router();
const verifyToken = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Location
 *   description: Google Places location search
 */

/**
 * @swagger
 * /api/location/search:
 *   get:
 *     summary: Search for locations using Google Places
 *     tags: [Location]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Location search text (e.g. "Mumbai")
 *         example: Mumbai
 *     responses:
 *       200:
 *         description: List of matching places
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 places:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       placeId:
 *                         type: string
 *                         example: ChIJwe1EZjDG5zsRaYxkjY_tpF0
 *                       name:
 *                         type: string
 *                         example: Mumbai
 *                       address:
 *                         type: string
 *                         example: Maharashtra, India
 *       400:
 *         description: Query too short
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Google API error
 */
router.get('/search', verifyToken, async (req, res) => {
  const { query } = req.query;

  if (!query || query.trim().length < 2) {
    return res.status(400).json({ message: 'Query must be at least 2 characters' });
  }

  try {
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/place/autocomplete/json',
      {
        params: {
          input: query.trim(),
          key: process.env.GOOGLE_PLACES_API_KEY,
          types: 'geocode',
        },
      }
    );

    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      console.error('[Location] Google API status:', response.data.status);
      return res.status(500).json({
        message: 'Location service error',
        status: response.data.status  // helpful for debugging
      });
    }

    const places = (response.data.predictions || []).map((p) => ({
      placeId: p.place_id,
      name: p.structured_formatting?.main_text || p.description,
      address: p.structured_formatting?.secondary_text || '',
    }));

    res.json({ places });
  } catch (err) {
    console.error('[Location] Search error:', err.message);
    res.status(500).json({ message: 'Failed to search locations' });
  }
});

module.exports = router;