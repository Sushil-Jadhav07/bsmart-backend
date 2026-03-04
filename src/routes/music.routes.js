const express = require('express');
const router = express.Router();
const spotifyClient = require('../config/spotify');
const auth = require('../middleware/auth');

/**
 * Helper to handle errors
 */
const handleError = (res, error) => {
  console.error('Spotify API Error:', error.response?.data || error.message);
  if (error.response) {
    return res.status(error.response.status).json(error.response.data);
  }
  return res.status(500).json({ message: 'Internal Server Error' });
};

/**
 * Helper to convert ms to mm:ss
 */
const msToMinutes = (ms) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
};

// Apply auth middleware to all routes
router.use(auth);

/**
 * @swagger
 * tags:
 *   name: Music
 *   description: Spotify Integration Endpoints
 */

/**
 * @swagger
 * /api/music/search:
 *   get:
 *     summary: Search for tracks, artists, albums, playlists
 *     tags: [Music]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           default: track
 *         description: Comma-separated list of types (album, artist, playlist, track)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/search', async (req, res) => {
  try {
    const { q, type = 'track', limit = 10, offset = 0 } = req.query;
    if (!q) return res.status(400).json({ message: 'Query parameter "q" is required' });

    const client = await spotifyClient(); // Get authenticated axios instance

    const response = await client.get('/search', {
      params: { q, type, limit, offset }
    });
    
    res.json(response.data);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @swagger
 * /api/music/tracks/search:
 *   get:
 *     summary: Search specifically for songs (tracks) by name
 *     tags: [Music]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the song to search
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of songs matching the name
 */
router.get('/tracks/search', async (req, res) => {
  try {
    const { name, limit = 10 } = req.query;
    if (!name) return res.status(400).json({ message: 'Query parameter "name" is required' });

    const client = await spotifyClient();
    const response = await client.get('/search', {
      params: { q: name, type: 'track', limit }
    });
    
    // Format duration and ensure preview_url is present (Spotify may return null)
    if (response.data.tracks && response.data.tracks.items) {
      response.data.tracks.items.forEach(track => {
        track.duration_formatted = msToMinutes(track.duration_ms);
        // Note: Spotify deprecated 30s preview_url for many tracks in 2024. 
        // If it's null, we can't do much without a premium user token context or using an alternative source.
        // We will pass it through as is (null or string).
      });
    }

    res.json(response.data.tracks);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @swagger
 * /api/music/new-releases:
 *   get:
 *     summary: Get list of new album releases
 *     tags: [Music]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *           default: US
 *     responses:
 *       200:
 *         description: New releases
 */
router.get('/new-releases', async (req, res) => {
  try {
    const { limit = 10, country = 'US' } = req.query;
    const response = await (await spotifyClient()).get('/browse/new-releases', {
      params: { limit, country }
    });
    res.json(response.data);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @swagger
 * /api/music/featured-playlists:
 *   get:
 *     summary: Get list of featured playlists
 *     tags: [Music]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *           default: US
 *     responses:
 *       200:
 *         description: Featured playlists
 */
router.get('/featured-playlists', async (req, res) => {
  try {
    const { limit = 10, country = 'US' } = req.query;
    const response = await (await spotifyClient()).get('/browse/featured-playlists', {
      params: { limit, country }
    });
    res.json(response.data);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @swagger
 * /api/music/tracks/{id}:
 *   get:
 *     summary: Get a track by ID
 *     tags: [Music]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Track details
 */
router.get('/tracks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await (await spotifyClient()).get(`/tracks/${id}`);
    const track = response.data;
    // Add formatted duration
    track.duration_formatted = msToMinutes(track.duration_ms);
    res.json(track);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @swagger
 * /api/music/artists/{id}:
 *   get:
 *     summary: Get artist details and top tracks
 *     tags: [Music]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Artist details and top tracks
 */
router.get('/artists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await spotifyClient();

    const [artistRes, topTracksRes] = await Promise.all([
      client.get(`/artists/${id}`),
      client.get(`/artists/${id}/top-tracks?market=US`)
    ]);

    res.json({
      artist: artistRes.data,
      top_tracks: topTracksRes.data.tracks
    });
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @swagger
 * /api/music/albums/{id}/tracks:
 *   get:
 *     summary: Get album tracks
 *     tags: [Music]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Album tracks
 */
router.get('/albums/:id/tracks', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await (await spotifyClient()).get(`/albums/${id}/tracks`);
    res.json(response.data);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @swagger
 * /api/music/genres:
 *   get:
 *     summary: Get available genre seeds
 *     tags: [Music]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of genres
 */
router.get('/genres', async (req, res) => {
  try {
    const response = await (await spotifyClient()).get('/recommendations/available-genre-seeds');
    res.json(response.data);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @swagger
 * /api/music/recommendations:
 *   get:
 *     summary: Get recommendations based on seeds
 *     tags: [Music]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: seed_genres
 *         schema:
 *           type: string
 *       - in: query
 *         name: seed_artists
 *         schema:
 *           type: string
 *       - in: query
 *         name: seed_tracks
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Recommendations
 */
router.get('/recommendations', async (req, res) => {
  try {
    const { seed_genres, seed_artists, seed_tracks, limit = 10 } = req.query;
    
    if (!seed_genres && !seed_artists && !seed_tracks) {
      return res.status(400).json({ message: 'At least one seed (genre, artist, or track) is required' });
    }

    const response = await (await spotifyClient()).get('/recommendations', {
      params: { seed_genres, seed_artists, seed_tracks, limit }
    });
    res.json(response.data);
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
