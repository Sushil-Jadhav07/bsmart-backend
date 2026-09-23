const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');
const { getPublicBaseUrl } = require('../utils/publicUrl');

// R2 is S3-API-compatible — same SDK, just a different endpoint/region/creds.
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;

const getFolderName = (req, file) => {
  const userId = req.user?._id || req.user?.id || 'unknown';
  const mime = file.mimetype;

  if (req.baseUrl.includes('post') || req.path.includes('post')) {
    return `uploads/users/${userId}/posts`;
  } else if (req.baseUrl.includes('reel') || req.path.includes('reel')) {
    return `uploads/users/${userId}/reels`;
  } else if (req.baseUrl.includes('story') || req.path.includes('story')) {
    return `uploads/users/${userId}/stories`;
  } else if (req.baseUrl.includes('ad') || req.path.includes('ad')) {
    return `uploads/users/${userId}/ads`;
  } else if (req.baseUrl.includes('profile') || req.path.includes('profile')) {
    return `uploads/users/${userId}/profile`;
  } else if (mime.startsWith('video/')) {
    return `uploads/users/${userId}/videos`;
  } else if (mime.startsWith('image/')) {
    return `uploads/users/${userId}/images`;
  } else {
    return `uploads/users/${userId}/others`;
  }
};

const storage = multerS3({
  s3: s3,
  bucket: BUCKET,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: function (req, file, cb) {
    const folder = getFolderName(req, file);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname || '');
    cb(null, `${folder}/${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|gif|webp|mp4|mov|avi|mkv|webm|flv|wmv/;
  const extname = filetypes.test(path.extname(file.originalname || '').toLowerCase());
  const mimetype = file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/');
  if (mimetype && (extname || !file.originalname)) {
    return cb(null, true);
  }
  cb(new Error('File type not supported!'));
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 },
  fileFilter: fileFilter
});

const audioStorage = multerS3({
  s3: s3,
  bucket: BUCKET,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: function (req, file, cb) {
    const userId = req.user?._id || req.user?.id || 'unknown';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `uploads/users/${userId}/audio/${uniqueSuffix}.webm`);
  }
});

const audioFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error('Only audio files are allowed'));
  }
};

const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: audioFileFilter,
});

function buildPublicUrl(key) {
  let base = process.env.R2_PUBLIC_BASE_URL || '';
  if (!base) {
    throw new Error(
      'R2_PUBLIC_BASE_URL is not set — enable public access on the R2 bucket and set this to its r2.dev or custom domain URL.'
    );
  }
  if (!base.startsWith('http')) base = `https://${base}`;
  base = base.replace(/\/+$/, '');
  return `${base}/${key}`;
}

function getFileUrl(req, file) {
  if (file.key) return buildPublicUrl(file.key);

  if (file.location) {
    try {
      const url = new URL(file.location);
      const key = url.pathname.replace(/^\//, '');
      if (key) return buildPublicUrl(key);
    } catch {}
    return file.location;
  }

  const baseUrl  = getPublicBaseUrl(req);
  const filename = file.filename || '';
  return `${baseUrl}/uploads/${filename}`;
}

function getFileName(file) {
  return file.key || file.filename;
}

function makeUploader(subfolder) {
  const s3Storage = multerS3({
    s3,
    bucket: BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key(req, file, cb) {
      const userId = req.user?._id || req.user?.id || 'unknown';
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname || '');
      cb(null, `uploads/users/${userId}/${subfolder}/${uniqueSuffix}${ext}`);
    },
  });
  return multer({ storage: s3Storage, limits: { fileSize: 5 * 1024 * 1024 * 1024 }, fileFilter });
}

module.exports = { upload, uploadAudio, getFileUrl, getFileName, makeUploader };
