const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const verifyToken = require('../middleware/auth');
const { upload, makeUploader } = require('../config/multer');
const User = require('../models/User');
const convertToHls = require('../utils/convertToHls');
const { getPublicBaseUrl } = require('../utils/publicUrl');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv']);

function isVideo(filename) {
  return VIDEO_EXTS.has(path.extname(filename || '').toLowerCase());
}

const uploadsDir = path.join(__dirname, '../../uploads');

// Helper: get file URL — works for both S3 and local disk
function getFileUrl(req, file) {
  if (file.key || file.location) {
    let cloudfront = process.env.CLOUDFRONT_BASE_URL || '';
    if (cloudfront && !cloudfront.startsWith('http')) cloudfront = `https://${cloudfront}`;
    cloudfront = cloudfront.replace(/\/+$/, '');
    if (cloudfront && file.key) return `${cloudfront}/${file.key}`;
    if (file.location) return file.location;
    // location absent (private bucket) — build URL from key
    return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${file.key}`;
  }
  // Local disk upload
  const baseUrl = getPublicBaseUrl(req);
  return `${baseUrl}/uploads/${file.filename}`;
}

// Helper: get file name/key
function getFileName(file) {
  if (file.key) return file.key;       // S3 key e.g. uploads/users/123/posts/abc.jpg
  return file.filename;                 // local disk filename
}

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

    // Check if it's a video
    if (isVideo(req.file.originalname)) {

      // If file is on S3 (has location), we skip HLS conversion for now
      // and return the S3 URL directly
      if (req.file.location) {
        const fileUrl = getFileUrl(req, req.file);
        const fileName = getFileName(req.file);
        return res.json({
          fileName,
          fileUrl,
          media_type: 'video',
          hls: false,
        });
      }

      // Local disk — do HLS conversion
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

    // Image — return URL
    const fileUrl = getFileUrl(req, req.file);
    const fileName = getFileName(req.file);

    return res.json({
      fileName,
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
    const files = Array.isArray(req.files) ? req.files : (req.file ? [req.file] : []);
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'Please upload at least one file' });
    }
    const items = files.map(f => ({
      fileName: getFileName(f),
      type: 'image',
      fileUrl: getFileUrl(req, f),
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

    const fileUrl = getFileUrl(req, req.file);
    const fileName = getFileName(req.file);

    const user = await User.findByIdAndUpdate(
      req.userId,
      { avatar_url: fileUrl },
      { new: true, select: '_id username full_name avatar_url' }
    );
    return res.json({ fileName, fileUrl, user });
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
 *     responses:
 *       200:
 *         description: Image uploaded successfully
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

      const promoteImg = getFileUrl(req, req.file);
      const fileName   = getFileName(req.file);

      return res.json({
        promote_img: promoteImg,
        fileName,
        media_type: 'image',
      });
    } catch (error) {
      console.error('[Upload/promote-product] Error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// ─── Dedicated upload endpoints ──────────────────────────────────────────────
const uploadAds     = makeUploader('ads');
const uploadStory   = makeUploader('story');
const uploadPost    = makeUploader('post');
const uploadReel    = makeUploader('reel');
const uploadPromote = makeUploader('promote');

// Shared handler factory — builds a consistent response for any upload type
function mediaHandler(videoType, imageType) {
  return (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'Please upload a file' });
      }
      const type    = isVideo(req.file.originalname) ? videoType : imageType;
      const fileUrl = getFileUrl(req, req.file);
      const fileName = getFileName(req.file);
      return res.json({
        fileName,
        fileUrl,
        media_type: type,
        hls:        false,
        media:      { url: fileUrl, type, hls: false },
      });
    } catch (err) {
      console.error('[Upload]', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  };
}

/**
 * @swagger
 * /api/upload/ads:
 *   post:
 *     summary: Upload an image or video for an ad
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
 *         description: File uploaded — stores at uploads/users/{id}/ads/
 */
router.post('/ads', verifyToken, uploadAds.single('file'), mediaHandler('video', 'image'));

/**
 * @swagger
 * /api/upload/story:
 *   post:
 *     summary: Upload an image or video for a story
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
 *         description: File uploaded — stores at uploads/users/{id}/story/
 */
router.post('/story', verifyToken, uploadStory.single('file'), mediaHandler('reel', 'image'));

/**
 * @swagger
 * /api/upload/post:
 *   post:
 *     summary: Upload an image or video for a post
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
 *         description: File uploaded — stores at uploads/users/{id}/post/
 */
router.post('/post', verifyToken, uploadPost.single('file'), mediaHandler('video', 'image'));

/**
 * @swagger
 * /api/upload/reel:
 *   post:
 *     summary: Upload a video for a reel
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
 *         description: File uploaded — stores at uploads/users/{id}/reel/
 */
router.post('/reel', verifyToken, uploadReel.single('file'), mediaHandler('reel', 'image'));

/**
 * @swagger
 * /api/upload/promote:
 *   post:
 *     summary: Upload an image or video for a promoted reel
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
 *         description: File uploaded — stores at uploads/users/{id}/promote/
 */
router.post('/promote', verifyToken, uploadPromote.single('file'), mediaHandler('video', 'image'));

module.exports = router;