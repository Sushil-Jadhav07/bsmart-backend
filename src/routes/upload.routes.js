const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const verifyToken = require('../middleware/auth');
const { upload } = require('../config/multer');
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

// ─── POST /api/upload/promote-product ────────────────────────────────────────
/**
 * @swagger
 * /api/upload/promote-product:
 *   post:
 *     summary: Upload a product image for a promote reel product card
 *     description: |
 *       Accepts a single image file and returns the full URL to be stored
 *       as `promote_img` in the products array when creating / updating a
 *       promote reel.
 *
 *       **Allowed types:** JPEG, JPG, PNG, WEBP, GIF
 *       **Max size:** 10 MB
 *
 *       Example workflow:
 *       1. Upload each product image → get back `{ promote_img: "https://..." }`
 *       2. Include the URL in the `products[]` array body when calling
 *          `POST /api/promote-reels` or `PATCH /api/promote-reels/:id`
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Product image file (JPEG / PNG / WEBP / GIF, max 10 MB)
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 promote_img:
 *                   type: string
 *                   example: "https://api.bebsmart.in/uploads/1717000000000-123456789.jpg"
 *                   description: Full URL — use this as `promote_img` in the products array
 *                 fileName:
 *                   type: string
 *                   example: "1717000000000-123456789.jpg"
 *                 media_type:
 *                   type: string
 *                   example: image
 *       400:
 *         description: No file provided or invalid file type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *       500:
 *         description: Server error
 */

// Dedicated image-only multer instance for product images (10 MB cap)
const productImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename:    (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname).toLowerCase());
  },
});

const productImageFilter = (_req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|gif/;
  const extOk   = allowed.test(path.extname(file.originalname).toLowerCase());
  const mimeOk  = file.mimetype.startsWith('image/');
  if (extOk && mimeOk) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed for product images (JPEG, PNG, WEBP, GIF).'));
  }
};

const uploadProductImage = multer({
  storage:    productImageStorage,
  limits:     { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: productImageFilter,
});

router.post(
  '/promote-product',
  verifyToken,
  (req, res, next) => {
    uploadProductImage.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File too large. Maximum size is 10 MB.' });
        }
        return res.status(400).json({ message: err.message });
      }
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'Please upload an image file.' });
      }

      const baseUrl    = getPublicBaseUrl(req);
      const promoteImg = `${baseUrl}/uploads/${req.file.filename}`;

      return res.json({
        promote_img: promoteImg,         // ← key name matches the model field
        fileName:    req.file.filename,
        media_type:  'image',
      });
    } catch (error) {
      console.error('[Upload/promote-product] Error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

module.exports = router;