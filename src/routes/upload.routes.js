const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const upload = require('../config/multer');
const User = require('../models/User');

/**
 * @swagger
 * /api/upload:
 *   post:
 *     summary: Upload a file (image/video)
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
 *       401:
 *         description: Not authorized
 *       400:
 *         description: No file uploaded or invalid file type
 *       500:
 *         description: Server error
 */
router.post('/', verifyToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a file' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

    res.json({
      fileName: req.file.filename,
      fileUrl: fileUrl
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/thumbnail', verifyToken, upload.any(), (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const files = Array.isArray(req.files) ? req.files : (req.file ? [req.file] : []);
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'Please upload at least one file' });
    }
    const items = files.map(f => ({
      fileName: f.filename,
      type: 'image',
      fileUrl: `${baseUrl}/uploads/${f.filename}`
    }));
    res.json({
      thumbnails: items,
      count: items.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

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
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Thumbnail(s) uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 thumbnails:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       fileName: { type: string }
 *                       type: { type: string, enum: [image], default: image }
 *                       fileUrl: { type: string }
 *                 count:
 *                   type: number
 *       401:
 *         description: Not authorized
 *       400:
 *         description: No file uploaded or invalid file type
 *       500:
 *         description: Server error
 */
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fileName:
 *                   type: string
 *                 fileUrl:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     username: { type: string }
 *                     full_name: { type: string }
 *                     avatar_url: { type: string }
 *       401:
 *         description: Not authorized
 *       400:
 *         description: No file uploaded or invalid file type
 *       500:
 *         description: Server error
 */
router.post('/avatar', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a file' });
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.userId,
      { avatar_url: fileUrl },
      { new: true, select: '_id username full_name avatar_url' }
    );
    return res.json({
      fileName: req.file.filename,
      fileUrl,
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
