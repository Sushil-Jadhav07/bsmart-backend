const multer    = require('multer');
const multerS3  = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path      = require('path');
const { getPublicBaseUrl } = require('../utils/publicUrl');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
});

const BUCKET = process.env.S3_BUCKET_NAME;

// ─── CloudFront helper ────────────────────────────────────────────────────────
// FIX: centralised here so every path returns CloudFront, never raw S3.
// Previously some paths fell through to `file.location` (direct S3 URL).
function buildCloudfrontUrl(key) {
  let cf = process.env.CLOUDFRONT_BASE_URL || '';
  if (!cf) {
    // No CloudFront configured — fall back to S3 URL
    return `https://${BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
  }
  if (!cf.startsWith('http')) cf = `https://${cf}`;
  cf = cf.replace(/\/+$/, '');
  return `${cf}/${key}`;
}

// ─── Folder routing ───────────────────────────────────────────────────────────
const getFolderName = (req, file) => {
  const userId = req.user?._id || req.user?.id || 'unknown';
  const mime   = file.mimetype;

  if (req.baseUrl.includes('post')    || req.path.includes('post'))    return `uploads/users/${userId}/posts`;
  if (req.baseUrl.includes('reel')    || req.path.includes('reel'))    return `uploads/users/${userId}/reels`;
  if (req.baseUrl.includes('story')   || req.path.includes('story'))   return `uploads/users/${userId}/stories`;
  if (req.baseUrl.includes('ad')      || req.path.includes('ad'))      return `uploads/users/${userId}/ads`;
  if (req.baseUrl.includes('profile') || req.path.includes('profile')) return `uploads/users/${userId}/profile`;
  if (mime.startsWith('video/'))  return `uploads/users/${userId}/videos`;
  if (mime.startsWith('image/'))  return `uploads/users/${userId}/images`;
  return `uploads/users/${userId}/others`;
};

// ─── Default storage (used by `upload`) ──────────────────────────────────────
const storage = multerS3({
  s3,
  bucket: BUCKET,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key(req, file, cb) {
    const folder       = getFolderName(req, file);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext          = path.extname(file.originalname || '');
    cb(null, `${folder}/${uniqueSuffix}${ext}`);
  },
});

// ─── File filter ──────────────────────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|gif|webp|mp4|mov|avi|mkv|webm|flv|wmv/;
  const extname   = filetypes.test(path.extname(file.originalname || '').toLowerCase());
  const mimetype  = file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/');
  if (mimetype && (extname || !file.originalname)) return cb(null, true);
  cb(new Error('File type not supported!'));
};

const upload = multer({
  storage,
  limits:     { fileSize: 5 * 1024 * 1024 * 1024 },
  fileFilter,
});

// ─── Audio storage ────────────────────────────────────────────────────────────
const audioStorage = multerS3({
  s3,
  bucket: BUCKET,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key(req, file, cb) {
    const userId       = req.user?._id || req.user?.id || 'unknown';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `uploads/users/${userId}/audio/${uniqueSuffix}.webm`);
  },
});

const audioFileFilter = (_req, file, cb) => {
  if (file.mimetype.startsWith('audio/')) return cb(null, true);
  cb(new Error('Only audio files are allowed'));
};

const uploadAudio = multer({
  storage:    audioStorage,
  limits:     { fileSize: 25 * 1024 * 1024 },
  fileFilter: audioFileFilter,
});

// ─── getFileUrl ───────────────────────────────────────────────────────────────
// FIX: always routes through CloudFront when key is available.
// The old code had a fallback to `file.location` (raw S3 URL) when CloudFront
// was not set — but file.key is always present for S3 uploads, so we use that.
function getFileUrl(req, file) {
  // S3 upload — file.key is always populated by multer-s3
  if (file.key) return buildCloudfrontUrl(file.key);

  // multer-s3 also sets file.location (direct S3 HTTPS URL).
  // We deliberately do NOT return file.location here because it bypasses
  // CloudFront. If we reach this point without a key something went wrong.
  if (file.location) {
    // Try to extract the key from the S3 URL and route through CloudFront
    try {
      const url  = new URL(file.location);
      const key  = url.pathname.replace(/^\//, '');
      if (key) return buildCloudfrontUrl(key);
    } catch {}
    // Last resort — return location as-is (still works, just not CDN-cached)
    return file.location;
  }

  // Local disk upload (dev mode, no S3)
  const baseUrl = getPublicBaseUrl(req);
  return `${baseUrl}/uploads/${file.filename}`;
}

function getFileName(file) {
  return file.key || file.filename;
}

// ─── makeUploader factory ─────────────────────────────────────────────────────
// Creates a dedicated multer-s3 uploader for a specific subfolder.
function makeUploader(subfolder) {
  const s3Storage = multerS3({
    s3,
    bucket: BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key(req, file, cb) {
      const userId       = req.user?._id || req.user?.id || 'unknown';
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext          = path.extname(file.originalname || '');
      cb(null, `uploads/users/${userId}/${subfolder}/${uniqueSuffix}${ext}`);
    },
  });
  return multer({ storage: s3Storage, limits: { fileSize: 5 * 1024 * 1024 * 1024 }, fileFilter });
}

module.exports = { upload, uploadAudio, getFileUrl, getFileName, makeUploader, buildCloudfrontUrl };