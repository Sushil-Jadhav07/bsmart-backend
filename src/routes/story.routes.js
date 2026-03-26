const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const verifyToken = require('../middleware/auth');
const { dynamicRateLimit } = require('../middleware/rateLimit');
const { createStory, getStoriesFeed, getStoriesByUserId, getStoryItems, viewStoryItem, getStoryViews, getStoriesArchive, deleteStory } = require('../controllers/story.controller');
const upload = require('../config/multer');

// ─── Stories feed rate limiter (dynamic — values set via query params) ───────
// Pass `limit` in the request query to control the rate limit.
// Falls back to env vars (STORIES_FEED_RATE_LIMIT_MAX / STORIES_FEED_RATE_LIMIT_WINDOW_MS)
// or defaults (60 req / 60 000 ms) if not supplied.
const storiesFeedRateLimit = dynamicRateLimit({
  keyPrefix:    'stories:feed',
  envMaxKey:    'STORIES_FEED_RATE_LIMIT_MAX',
  envWindowKey: 'STORIES_FEED_RATE_LIMIT_WINDOW_MS',
  defaultMax:    60,
  defaultWindow: 60 * 1000,
});

/**
 * @swagger
 * /api/stories:
 *   post:
 *     summary: Create or append story items for current user
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateStoryRequest'
 *     responses:
 *       200:
 *         description: Story created/appended
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateStoryResponse'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Not authorized
 */
router.post('/', verifyToken, createStory);

/**
 * @swagger
 * /api/stories/feed:
 *   get:
 *     summary: Get active stories feed
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 30
 *         description: "Max requests allowed per window for rate limiting (e.g. 30 = max 30 requests per minute)"
 *     responses:
 *       200:
 *         description: List of active stories
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StoryFeedItem'
 *       401:
 *         description: Not authorized
 *       429:
 *         description: Too many requests — rate limit exceeded
 *         content:
 *           application/json:
 *             example:
 *               message: "Too many requests, please slow down."
 *               limit: 30
 *               retry_after_ms: 45000
 */
router.get('/feed', verifyToken, storiesFeedRateLimit, getStoriesFeed);

/**
 * @swagger
 * /api/stories/user/{userId}:
 *   get:
 *     summary: Get active stories by userId
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID whose active stories should be returned
 *     responses:
 *       200:
 *         description: List of active stories for the requested user
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StoryFeedItem'
 *       400:
 *         description: Invalid userId
 *       401:
 *         description: Not authorized
 *       404:
 *         description: User not found
 */
router.get('/user/:userId', verifyToken, getStoriesByUserId);

/**
 * @swagger
 * /api/stories/{storyId}/items:
 *   get:
 *     summary: Get ordered items of a story
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Story items
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StoryItem'
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Story not found
 */
router.get('/:storyId/items', verifyToken, getStoryItems);

/**
 * @swagger
 * /api/stories/items/{itemId}/view:
 *   post:
 *     summary: Mark a story item as viewed
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: View recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Story item not found
 */
router.post('/items/:itemId/view', verifyToken, viewStoryItem);

/**
 * @swagger
 * /api/stories/{storyId}/views:
 *   get:
 *     summary: Get viewers list of a story (owner only)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Viewers list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StoryViewsResponse'
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Story not found
 */
router.get('/:storyId/views', verifyToken, getStoryViews);

/**
 * @swagger
 * /api/stories/upload:
 *   post:
 *     summary: Upload an image or video for a story item
 *     description: |
 *       Accepts images (JPEG, PNG, GIF, WEBP) and videos (MP4, MOV, AVI, MKV, WEBM, FLV, WMV).
 *       Videos are automatically converted to HLS (.m3u8) for smooth streaming — identical to the post upload flow.
 *       Use the returned `media` object directly in the `POST /api/stories` items array.
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Image or video file (max 500MB)
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fileName:
 *                   type: string
 *                 fileUrl:
 *                   type: string
 *                 media_type:
 *                   type: string
 *                   enum: [image, reel]
 *                   description: image for photos; reel for videos (HLS)
 *                 hls:
 *                   type: boolean
 *                   description: true when video was converted to HLS stream
 *                 media:
 *                   type: object
 *                   description: Ready-to-use object for POST /api/stories items[].media[]
 *                   properties:
 *                     url:
 *                       type: string
 *                     type:
 *                       type: string
 *                       enum: [image, reel]
 *                     hls:
 *                       type: boolean
 *             examples:
 *               image_upload:
 *                 summary: Image uploaded
 *                 value:
 *                   fileName: "1714000000000-123456789.jpg"
 *                   fileUrl: "https://api.bebsmart.in/uploads/1714000000000-123456789.jpg"
 *                   media_type: "image"
 *                   hls: false
 *                   media:
 *                     url: "https://api.bebsmart.in/uploads/1714000000000-123456789.jpg"
 *                     type: "image"
 *                     hls: false
 *               video_upload:
 *                 summary: Video uploaded and converted to HLS
 *                 value:
 *                   fileName: "1714000000000-123456789/index.m3u8"
 *                   fileUrl: "https://api.bebsmart.in/uploads/1714000000000-123456789/index.m3u8"
 *                   media_type: "reel"
 *                   hls: true
 *                   media:
 *                     url: "https://api.bebsmart.in/uploads/1714000000000-123456789/index.m3u8"
 *                     type: "reel"
 *                     hls: true
 *       400:
 *         description: No file uploaded or unsupported file type
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error or HLS conversion failed
 */
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a file' });
    }

    const baseUrl  = `${req.protocol}://${req.get('host')}`;
    const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv']);
    const uploadsDir = path.join(__dirname, '../../uploads');

    const isVideoFile = VIDEO_EXTS.has(
      path.extname(req.file.originalname || req.file.filename).toLowerCase()
    );

    // ─── VIDEO → HLS conversion (same as /api/upload) ─────────────────────
    if (isVideoFile) {
      const baseName  = path.basename(req.file.filename, path.extname(req.file.filename));
      const inputPath = req.file.path;

      try {
        const convertToHls = require('../utils/convertToHls');
        await convertToHls(inputPath, uploadsDir, baseName);

        // Remove the raw uploaded file after HLS conversion
        fs.unlink(inputPath, (err) => {
          if (err) console.warn('[Story Upload] Could not delete original video:', err.message);
        });

        const hlsUrl = `${baseUrl}/uploads/${baseName}/index.m3u8`;
        return res.json({
          fileName:   `${baseName}/index.m3u8`,
          fileUrl:    hlsUrl,
          media_type: 'reel',
          hls:        true,
          media: {
            url:  hlsUrl,
            type: 'reel',
            hls:  true
          }
        });
      } catch (hlsErr) {
        console.error('[Story Upload] HLS conversion failed:', hlsErr.message);
        // HLS failed — fall back to serving the raw video (no delete)
        const rawUrl = `${baseUrl}/uploads/${req.file.filename}`;
        return res.json({
          fileName:   req.file.filename,
          fileUrl:    rawUrl,
          media_type: 'reel',
          hls:        false,
          media: {
            url:  rawUrl,
            type: 'reel',
            hls:  false
          }
        });
      }
    }

    // ─── IMAGE ─────────────────────────────────────────────────────────────
    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;
    res.json({
      fileName:   req.file.filename,
      fileUrl,
      media_type: 'image',
      hls:        false,
      media: {
        url:  fileUrl,
        type: 'image',
        hls:  false
      }
    });

  } catch (error) {
    console.error('[Story Upload] Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @swagger
 * /api/stories/archive:
 *   get:
 *     summary: Get archived stories for current user
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Archived stories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stories:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Story'
 *       401:
 *         description: Not authorized
 *
 * components:
 *   schemas:
 *     CreateStoryRequest:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/StoryItemPayload'
 *       example:
 *         items:
 *           - media:
 *               url: "http://localhost:5000/uploads/photo.jpg"
 *               type: "image"
 *               hls: false
 *             transform:
 *               x: 0.5
 *               y: 0.5
 *               scale: 1
 *               rotation: 0
 *             filter:
 *               name: "none"
 *               intensity: 0
 *             texts:
 *               - content: "Hello"
 *                 x: 0
 *                 y: 0
 *                 fontSize: 24
 *                 fontFamily: "classic"
 *                 color: "white"
 *                 align: "center"
 *                 rotation: 0
 *                 background:
 *                   enabled: false
 *             mentions:
 *               - user_id: "603e2f9d8c9a4b2f88d1e111"
 *                 username: "alice"
 *                 x: 0.2
 *                 y: 0.3
 *           - media:
 *               url: "http://localhost:5000/uploads/abc123/index.m3u8"
 *               type: "reel"
 *               hls: true
 *               durationSec: 15
 *             transform:
 *               x: 0.5
 *               y: 0.5
 *               scale: 1
 *               rotation: 0
 *             filter:
 *               name: "none"
 *     StoryItemPayload:
 *       type: object
 *       required: [media]
 *       properties:
 *         media:
 *           type: array
 *           items:
 *             type: object
 *             required: [url, type]
 *             properties:
 *               url: { type: string }
 *               type: { type: string, enum: [image, video, reel], description: 'image = photo; reel = HLS stream; video = raw video fallback' }
 *               thumbnail: { type: string }
 *               durationSec: { type: number, description: 'Seconds — images default to 15, videos default to 30' }
 *               width: { type: number }
 *               height: { type: number }
 *               hls: { type: boolean, description: 'true when url is an HLS .m3u8 stream' }
 *         transform:
 *           type: object
 *           properties:
 *             x: { type: number, default: 0.5 }
 *             y: { type: number, default: 0.5 }
 *             scale: { type: number, default: 1 }
 *             rotation: { type: number, default: 0 }
 *             boxWidth: { type: number }
 *             boxHeight: { type: number }
 *         filter:
 *           type: object
 *           properties:
 *             name: { type: string, default: none }
 *             intensity: { type: number }
 *         texts:
 *           type: array
 *           items:
 *             type: object
 *             required: [content, fontSize]
 *             properties:
 *               content: { type: string }
 *               x: { type: number }
 *               y: { type: number }
 *               fontSize: { type: number }
 *               fontFamily: { type: string, enum: [classic, modern, neon, typewriter] }
 *               color: { type: string }
 *               align: { type: string, enum: [left, center, right], default: center }
 *               rotation: { type: number }
 *               background:
 *                 type: object
 *                 properties:
 *                   enabled: { type: boolean, default: false }
 *                   color: { type: string }
 *                   opacity: { type: number }
 *         mentions:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               user_id: { type: string }
 *               username: { type: string }
 *               x: { type: number }
 *               y: { type: number }
 *     Story:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         user_id: { type: string }
 *         items_count: { type: number }
 *         views_count: { type: number }
 *         expiresAt: { type: string, format: date-time }
 *         isArchived: { type: boolean }
 *         archivedAt: { type: string, format: date-time }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     StoryItem:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         story_id: { type: string }
 *         user_id: { type: string }
 *         order: { type: number }
 *         media:
 *           $ref: '#/components/schemas/StoryItemPayload/properties/media'
 *         transform:
 *           $ref: '#/components/schemas/StoryItemPayload/properties/transform'
 *         filter:
 *           $ref: '#/components/schemas/StoryItemPayload/properties/filter'
 *         texts:
 *           $ref: '#/components/schemas/StoryItemPayload/properties/texts'
 *         mentions:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               user_id: { type: string }
 *               username: { type: string }
 *               x: { type: number }
 *               y: { type: number }
 *         expiresAt: { type: string, format: date-time }
 *         isDeleted: { type: boolean }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     CreateStoryResponse:
 *       type: object
 *       properties:
 *         success: { type: boolean }
 *         story:
 *           $ref: '#/components/schemas/Story'
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/StoryItem'
 *     StoryFeedItem:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         user:
 *           type: object
 *           properties:
 *             username: { type: string }
 *             avatar_url: { type: string }
 *         items_count: { type: number }
 *         views_count: { type: number }
 *         preview_item:
 *           $ref: '#/components/schemas/StoryItem'
 *         seen: { type: boolean }
 *     StoryViewsResponse:
 *       type: object
 *       properties:
 *         viewers:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               viewer:
 *                 type: object
 *                 properties:
 *                   _id: { type: string }
 *                   username: { type: string }
 *                   avatar_url: { type: string }
 *               viewedAt: { type: string, format: date-time }
 *         total_views:
 *           type: number
 *         unique_viewers:
 *           type: number
 */
router.get('/archive', verifyToken, getStoriesArchive);

/**
 * @swagger
 * /api/stories/{storyId}:
 *   delete:
 *     summary: Delete a story (owner only)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Story deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Story not found
 */
router.delete('/:storyId', verifyToken, deleteStory);

module.exports = router;
