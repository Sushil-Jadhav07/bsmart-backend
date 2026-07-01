'use strict';

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
 *     summary: Search for locations using Google Places API (New)
 *     description: |
 *       Returns matching places (businesses, cities, areas, landmarks) worldwide.
 *       Uses session tokens so all keystrokes in one search = 1 billed session (not per-request).
 *       Pass the same sessionToken for every keystroke in a single search session.
 *       Generate a new sessionToken when the user starts a fresh search or selects a result.
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
 *           UUID session token — groups all autocomplete calls in one search into 1 billed session.
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
 *                       fullText:
 *                         type: string
 *                         example: "Mumbai, Maharashtra, India"
 *             examples:
 *               success:
 *                 summary: Places found
 *                 value:
 *                   places:
 *                     - placeId: "ChIJwe1EZjDG5zsRaYxkjY_tpF0"
 *                       name: "Mumbai"
 *                       address: "Maharashtra, India"
 *                       fullText: "Mumbai, Maharashtra, India"
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
 */
router.get('/search', verifyToken, async (req, res) => {
  const { query, sessionToken } = req.query;

  if (!query || query.trim().length < 2) {
    return res.status(400).json({ message: 'Query must be at least 2 characters' });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: 'Google Places API key not configured' });
  }

  try {
    const body = {
      input: query.trim(),
      // Return both geocoding (cities, countries) and establishment (businesses, buildings)
      includedPrimaryTypes: [],
    };

    if (sessionToken) {
      body.sessionToken = sessionToken;
    }

    const response = await axios.post(
      'https://places.googleapis.com/v1/places:autocomplete',
      body,
      {
        headers: {
          'Content-Type':    'application/json',
          'X-Goog-Api-Key':  apiKey,
        },
      }
    );

    const suggestions = response.data.suggestions || [];

    const places = suggestions.map((s) => {
      const p = s.placePrediction;
      return {
        placeId:  p.placeId,
        name:     p.structuredFormat?.mainText?.text      || p.text?.text || '',
        address:  p.structuredFormat?.secondaryText?.text || '',
        fullText: p.text?.text || '',
      };
    });

    return res.json({ places });
  } catch (err) {
    const status  = err.response?.status;
    const message = err.response?.data?.error?.message || err.message;
    console.error('[Location] Google Places API error:', status, message);

    if (status === 400) {
      return res.status(400).json({ message: 'Invalid search query' });
    }
    if (status === 403) {
      return res.status(500).json({ message: 'Places API key invalid or API not enabled in Google Cloud Console' });
    }
    return res.status(500).json({ message: 'Failed to search locations', error: message });
  }
});

module.exports = router;
