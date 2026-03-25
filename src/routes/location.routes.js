const express = require('express');
const axios   = require('axios');
const router  = express.Router();
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
 *     summary: Search for locations using Google Places Autocomplete
 *     description: |
 *       Returns matching places (businesses, cities, areas, landmarks).
 *       Uses session tokens so all keystrokes in one search = 1 free session (not per-request billing).
 *       Pass the same sessionToken for every keystroke in a single search session.
 *       Generate a new sessionToken when the user starts a fresh search or clears the field.
 *     tags: [Location]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Location search text (min 2 characters)
 *         example: Mumbai
 *       - in: query
 *         name: sessionToken
 *         required: false
 *         schema:
 *           type: string
 *         description: |
 *           UUID session token — groups all autocomplete calls in one search into 1 free session.
 *           Generate once per search session using crypto.randomUUID() on the frontend.
 *           Reset to a new UUID after the user selects a result or clears the input.
 *         example: "550e8400-e29b-41d4-a716-446655440000"
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
 *                         example: "ChIJwe1EZjDG5zsRaYxkjY_tpF0"
 *                       name:
 *                         type: string
 *                         example: "Mumbai"
 *                       address:
 *                         type: string
 *                         example: "Maharashtra, India"
 *             examples:
 *               success:
 *                 summary: Places found
 *                 value:
 *                   places:
 *                     - placeId: "ChIJwe1EZjDG5zsRaYxkjY_tpF0"
 *                       name: "Mumbai"
 *                       address: "Maharashtra, India"
 *                     - placeId: "ChIJ4zLP2oAP5DsRme_GnlKMqaA"
 *                       name: "Mumbai Suburban"
 *                       address: "Maharashtra, India"
 *                     - placeId: "ChIJiWgA-tX88DsR5SsLQDTNe9c"
 *                       name: "Starbucks Mumbai"
 *                       address: "Bandra West, Mumbai, Maharashtra, India"
 *               zero_results:
 *                 summary: No matching places
 *                 value:
 *                   places: []
 *       400:
 *         description: Query too short (must be at least 2 characters)
 *       401:
 *         description: Unauthorized — invalid or missing JWT token
 *       500:
 *         description: Google Places API error
 *         content:
 *           application/json:
 *             examples:
 *               request_denied:
 *                 summary: API key missing or Places API not enabled
 *                 value:
 *                   message: "Location service error"
 *                   status: "REQUEST_DENIED"
 *               invalid_key:
 *                 summary: Invalid API key
 *                 value:
 *                   message: "Location service error"
 *                   status: "INVALID_KEY"
 */
router.get('/search', verifyToken, async (req, res) => {
  const { query, sessionToken } = req.query;

  if (!query || query.trim().length < 2) {
    return res.status(400).json({ message: 'Query must be at least 2 characters' });
  }

  try {
    const params = {
      input: query.trim(),
      key:   process.env.GOOGLE_PLACES_API_KEY,
      // 'establishment|geocode' returns BOTH businesses (restaurants, shops, landmarks)
      // AND geographic areas (cities, states, countries).
      // Using only 'geocode' misses businesses — this is the correct setting.
      types: 'establishment|geocode',
    };

    // Session token groups all keystrokes in one search into a single free session.
    // Without this, every keystroke is billed separately as a per-request call.
    if (sessionToken) {
      params.sessiontoken = sessionToken;
    }

    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/place/autocomplete/json',
      { params }
    );

    const status = response.data.status;

    if (status !== 'OK' && status !== 'ZERO_RESULTS') {
      console.error('[Location] Google API status:', status, response.data.error_message || '');
      return res.status(500).json({
        message: 'Location service error',
        status,  // expose status so frontend can show helpful error messages
      });
    }

    const places = (response.data.predictions || []).map((p) => ({
      placeId: p.place_id,
      name:    p.structured_formatting?.main_text    || p.description,
      address: p.structured_formatting?.secondary_text || '',
    }));

    res.json({ places });
  } catch (err) {
    console.error('[Location] Search error:', err.message);
    res.status(500).json({ message: 'Failed to search locations' });
  }
});

module.exports = router;