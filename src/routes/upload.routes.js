const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const verifyToken = require('../middleware/auth');
const upload = require('../config/multer');
const User = require('../models/User');
const convertToHls = require('../utils/convertToHls');
const { getPublicBaseUrl } = require('../utils/publicUrl');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv']);

function isVideo(filename) {
  return VIDEO_EXTS.has(path.extname(filename || '').toLowerCase());
}

const uploadsDir = path.join(__dirname, '../../uploads');

// ─── POST /api/upload ─────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/upload:
 *   post:
 *     summary: Upload a file (image or video). Videos are auto-converted to HLS (.m3u8).
 *     tags: [Upload]
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
 *     responses:
 *       200:
 *         description: File uploaded. Videos return HLS m3u8 URL.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fileName: { type: string }
 *                 fileUrl:
 *                   type: string
 *                   description: For videos this is the HLS .m3u8 playlist URL
 *                 media_type: { type: string, enum: [image, video] }
 *                 hls: { type: boolean }
 */
router.post('/', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a file' });
    }

    const baseUrl = getPublicBaseUrl(req);

    if (isVideo(req.file.originalname)) {
      const baseName = path.basename(req.file.filename, path.extname(req.file.filename));
      const inputPath = req.file.path;

      try {
        await convertToHls(inputPath, uploadsDir, baseName);

        // Delete the raw uploaded video after successful HLS conversion
        fs.unlink(inputPath, (err) => {
          if (err) console.warn('[Upload] Could not delete original video:', err.message);
        });

        const hlsUrl = `${baseUrl}/uploads/${baseName}/index.m3u8`;
        return res.json({
          fileName: `${baseName}/index.m3u8`,
          fileUrl: hlsUrl,
          media_type: 'video',
          hls: true,
        });
      } catch (ffmpegErr) {
        console.error('[Upload] HLS conversion failed:', ffmpegErr.message);
        return res.status(500).json({
          message: 'Video conversion to HLS failed',
          error: ffmpegErr.message,
        });
      }
    }

    // Image — return direct URL
    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;
    return res.json({
      fileName: req.file.filename,
      fileUrl,
      media_type: 'image',
      hls: false,
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── POST /api/upload/thumbnail ───────────────────────────────────────────────
/**
 * @swagger
 * /api/upload/thumbnail:
 *   post:
 *     summary: Upload thumbnail image(s) for reels
 *     tags: [Reels]
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
 *     responses:
 *       200:
 *         description: Thumbnail(s) uploaded successfully
 */
router.post('/thumbnail', verifyToken, upload.any(), (req, res) => {
  try {
    const baseUrl = getPublicBaseUrl(req);
    const files = Array.isArray(req.files) ? req.files : (req.file ? [req.file] : []);
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'Please upload at least one file' });
    }
    const items = files.map(f => ({
      fileName: f.filename,
      type: 'image',
      fileUrl: `${baseUrl}/uploads/${f.filename}`,
    }));
    res.json({ thumbnails: items, count: items.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── POST /api/upload/avatar ──────────────────────────────────────────────────
/**
 * @swagger
 * /api/upload/avatar:
 *   post:
 *     summary: Upload avatar image for current user and update profile
 *     tags: [Upload]
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
 *     responses:
 *       200:
 *         description: Avatar uploaded and user updated
 */
router.post('/avatar', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a file' });
    }
    const baseUrl = getPublicBaseUrl(req);
    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.userId,
      { avatar_url: fileUrl },
      { new: true, select: '_id username full_name avatar_url' }
    );
    return res.json({ fileName: req.file.filename, fileUrl, user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
