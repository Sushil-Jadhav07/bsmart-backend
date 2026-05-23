const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
});

const BUCKET = process.env.S3_BUCKET_NAME;

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
    const ext = path.extname(file.originalname);
    cb(null, `${folder}/${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|gif|webp|mp4|mov|avi|mkv|webm|flv|wmv/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/');
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('File type not supported!'));
  }
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

module.exports = { upload, uploadAudio };