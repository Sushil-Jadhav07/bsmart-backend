const express    = require('express');
const router     = express.Router();
const path       = require('path');
const fs         = require('fs');
const multer     = require('multer');
const verifyToken = require('../middleware/auth');
const { upload, makeUploader } = require('../config/multer');
const User       = require('../models/User');
const convertToHls = require('../utils/convertToHls');                        // local-disk HLS (kept for local dev)
const { convertToHlsAndUpload } = require('../utils/convertToHlsAndUpload'); // NEW — S3 → HLS → S3
const { getPublicBaseUrl } = require('../utils/publicUrl');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv']);

function isVideo(filename) {
  return VIDEO_EXTS.has(path.extname(filename || '').toLowerCase());
}

const uploadsDir = path.join(__dirname, '../../uploads');

// Build a CloudFront (or S3) URL from a file uploaded by multer-s3
function getFileUrl(req, file) {
  if (file.key || file.location) {
    let cloudfront = process.env.CLOUDFRONT_BASE_URL || '';
    if (cloudfront && !cloudfront.startsWith('http')) cloudfront = `https://${cloudfront}`;
    cloudfront = cloudfront.replace(/\/+$/, '');
    // Always prefer CloudFront when the key is available
    if (cloudfront && file.key) return `${cloudfront}/${file.key}`;
    if (file.location) return file.location;
    return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${file.key}`;
  }
  const baseUrl = getPublicBaseUrl(req);
  return `${baseUrl}/uploads/${file.filename}`;
}

function getFileName(file) {
  if (file.key) return file.key;
  return file.filename;
}

// ─── Shared video-upload handler ──────────────────────────────────────────────
//
// This is the single function that ALL video-accepting endpoints now call.
// It handles three cases:
//   1. File is on S3  → download, transcode to HLS, re-upload HLS to S3
//   2. File is on disk → transcode to HLS locally (local dev / no S3)
//   3. File is an image → return URL directly, no transcoding
//
async function handleVideoUpload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a file' });
    }

    // ── IMAGE path — nothing to transcode ─────────────────────────────────
    if (!isVideo(req.file.originalname)) {
      return res.json({
        fileName:   getFileName(req.file),
        fileUrl:    getFileUrl(req, req.file),
        media_type: 'image',
        hls:        false,
        media: {
          url:  getFileUrl(req, req.file),
          type: 'image',
          hls:  false,
        },
      });
    }

    // ── VIDEO on S3 — download → ffmpeg → re-upload HLS ──────────────────
    if (req.file.key) {
      const rawKey = req.file.key;
      // HLS folder sits next to the raw file, without the extension
      // e.g. "uploads/users/123/reels/1234567890-abc"
      const hlsFolder = rawKey.replace(/\.[^/.]+$/, '');

      try {
        const { m3u8Key, m3u8Url } = await convertToHlsAndUpload(rawKey, hlsFolder);

        return res.json({
          fileName:   m3u8Key,
          fileUrl:    m3u8Url,
          media_type: 'video',
          hls:        true,
          media: {
            url:  m3u8Url,
            type: 'video',
            hls:  true,
          },
        });
      } catch (hlsErr) {
        console.error('[Upload] S3 HLS conversion failed:', hlsErr.message);
        // Fallback — return the raw S3 URL so the upload doesn't completely fail.
        // The video will still play (without adaptive streaming) until fixed.
        const fallbackUrl = getFileUrl(req, req.file);
        return res.status(207).json({
          message:    'HLS conversion failed — raw video URL returned as fallback',
          fileName:   rawKey,
          fileUrl:    fallbackUrl,
          media_type: 'video',
          hls:        false,
          error:      hlsErr.message,
          media: {
            url:  fallbackUrl,
            type: 'video',
            hls:  false,
          },
        });
      }
    }

    // ── VIDEO on local disk — run ffmpeg locally (dev environment) ────────
    const baseName  = path.basename(req.file.filename, path.extname(req.file.filename));
    const inputPath = req.file.path;
    const baseUrl   = getPublicBaseUrl(req);

    try {
      await convertToHls(inputPath, uploadsDir, baseName);

      fs.unlink(inputPath, err => {
        if (err) console.warn('[Upload] Could not delete original video:', err.message);
      });

      const hlsUrl = `${baseUrl}/uploads/${baseName}/index.m3u8`;
      return res.json({
        fileName:   `${baseName}/index.m3u8`,
        fileUrl:    hlsUrl,
        media_type: 'video',
        hls:        true,
        media: {
          url:  hlsUrl,
          type: 'video',
          hls:  true,
        },
      });
    } catch (ffmpegErr) {
      console.error('[Upload] Local HLS conversion failed:', ffmpegErr.message);
      return res.status(500).json({
        message: 'Video conversion to HLS failed',
        error:   ffmpegErr.message,
      });
    }

  } catch (error) {
    console.error('[Upload] Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
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
router.post('/', verifyToken, upload.single('file'), handleVideoUpload);

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
      type:     'image',
      fileUrl:  getFileUrl(req, f),
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

    const fileUrl  = getFileUrl(req, req.file);
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
  limits:     { fileSize: 10 * 1024 * 1024 },
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
      if (err) return res.status(400).json({ message: err.message });
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
      return res.json({ promote_img: promoteImg, fileName, media_type: 'image' });
    } catch (error) {
      console.error('[Upload/promote-product] Error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// ─── Dedicated upload endpoints ───────────────────────────────────────────────
// Each one uses makeUploader() for S3 storage, then passes through
// handleVideoUpload so videos get HLS conversion automatically.

const uploadAds        = makeUploader('ads');
const uploadStory      = makeUploader('story');
const uploadPost       = makeUploader('post');
const uploadReel       = makeUploader('reel');
const uploadPromote    = makeUploader('promote');
const uploadTweet      = makeUploader('tweet');
const uploadAdsGallery = makeUploader('ads-gallery');

/**
 * @swagger
 * /api/upload/ads:
 *   post:
 *     summary: Upload an image or video for an ad. Videos are converted to HLS.
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
 *               file: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: File uploaded. Videos return HLS m3u8 URL.
 */
router.post('/ads', verifyToken, uploadAds.single('file'), handleVideoUpload);

/**
 * @swagger
 * /api/upload/story:
 *   post:
 *     summary: Upload an image or video for a story. Videos are converted to HLS.
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
 *               file: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: File uploaded. Videos return HLS m3u8 URL.
 */
router.post('/story', verifyToken, uploadStory.single('file'), handleVideoUpload);

/**
 * @swagger
 * /api/upload/post:
 *   post:
 *     summary: Upload an image or video for a post. Videos are converted to HLS.
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
 *               file: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: File uploaded. Videos return HLS m3u8 URL.
 */
router.post('/post', verifyToken, uploadPost.single('file'), handleVideoUpload);

/**
 * @swagger
 * /api/upload/reel:
 *   post:
 *     summary: Upload a video for a reel. Converted to HLS automatically.
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
 *               file: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Video uploaded and converted to HLS. Returns m3u8 URL.
 */
router.post('/reel', verifyToken, uploadReel.single('file'), handleVideoUpload);

/**
 * @swagger
 * /api/upload/promote:
 *   post:
 *     summary: Upload an image or video for a promoted reel. Videos are converted to HLS.
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
 *               file: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: File uploaded. Videos return HLS m3u8 URL.
 */
router.post('/promote', verifyToken, uploadPromote.single('file'), handleVideoUpload);

/**
 * @swagger
 * /api/upload/tweet:
 *   post:
 *     summary: Upload an image for a tweet (images only — no video transcoding).
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
 *               file: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Image uploaded successfully.
 */
router.post('/tweet', verifyToken, uploadTweet.single('file'), handleVideoUpload);

/**
 * @swagger
 * /api/upload/ads-gallery:
 *   post:
 *     summary: Upload an image for an ads gallery.
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
 *               file: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Image uploaded successfully.
 */
router.post('/ads-gallery', verifyToken, uploadAdsGallery.single('file'), handleVideoUpload);

module.exports = router;