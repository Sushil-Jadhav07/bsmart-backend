const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Notification = require('../models/notification.model');
const Post = require('../models/Post');
const verifyToken = require('../middleware/auth');

/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664f1a2b3c4d5e6f7a8b9c0d"
 *         recipient:
 *           type: string
 *           example: "664f1a2b3c4d5e6f7a8b9c0d"
 *         sender:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             username:
 *               type: string
 *             full_name:
 *               type: string
 *             avatar_url:
 *               type: string
 *         type:
 *           type: string
 *           enum:
 *             - like
 *             - comment
 *             - follow
 *             - mention
 *             - order
 *             - payout
 *             - admin
 *             - vendor_approved
 *             - ad_approved
 *             - comment_like
 *             - comment_reply
 *             - post_save
 *             - post_tag
 *             - ad_comment
 *             - ad_like
 *             - ad_rejected
 *             - vendor_rejected
 *             - coins_credited
 *             - coins_debited
 *             - story_view
 *             - login_alert
 *             - follow_request
 *             - follow_accepted
 *             - subscribed_user_post
 *             - subscribed_user_reel
 *             - subscribed_vendor_post
 *             - subscription_expiring
 *             - subscription_expired
 *           example: "like"
 *         message:
 *           type: string
 *           example: "john_doe liked your post"
 *         link:
 *           type: string
 *           example: "/posts/664f1a2b3c4d5e6f7a8b9c0d"
 *         isRead:
 *           type: boolean
 *           example: false
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2025-03-06T10:30:00.000Z"
 */

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: >
 *     Real-time notification management.
 *     For `follow_request` notifications, use `/api/follow/requests/{requesterId}/accept`
 *     or `/api/follow/requests/{requesterId}/decline` to take action.
 */

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get all notifications for logged-in user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Notification'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter = { recipient: req.user._id };

    const typeParam = req.query.type;
    const typeMap = {
      like:     ['like', 'ad_like', 'comment_like'],
      comment:  ['comment', 'comment_reply', 'ad_comment', 'tweet_comment'],
      follow:   ['follow', 'follow_request', 'follow_accepted'],
      mention:  ['mention', 'post_tag', 'reel_tag', 'ad_tag', 'promote_reel_tag'],
    };
    if (typeParam && typeMap[typeParam]) {
      filter.type = { $in: typeMap[typeParam] };
    } else if (typeParam === 'unread') {
      filter.isRead = false;
    }

    const cloudfront = process.env.CLOUDFRONT_BASE_URL
      ? process.env.CLOUDFRONT_BASE_URL.replace(/\/+$/, '')
      : null;

    const toCfUrl = (url) => {
      if (!url || typeof url !== 'string') return url;
      if (cloudfront && url.includes('api.bebsmart.in/uploads/')) {
        return url.replace(/https?:\/\/api\.bebsmart\.in\/uploads\//, `${cloudfront}/uploads/`);
      }
      if (cloudfront && url && !url.startsWith('http')) {
        const clean = url.replace(/^\/+/, '');
        const key = clean.startsWith('uploads/') ? clean : `uploads/${clean}`;
        return `${cloudfront}/${key}`;
      }
      return url;
    };

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sender', 'username full_name avatar_url')
        .lean(),
      Notification.countDocuments(filter),
    ]);

    const postIds = [];
    for (const n of notifications) {
      if (n.link) {
        const match = n.link.match(/\/posts\/([a-f0-9]{24})/);
        if (match && mongoose.Types.ObjectId.isValid(match[1])) {
          postIds.push(match[1]);
        }
      }
    }

    let postMap = new Map();
    if (postIds.length > 0) {
      const posts = await Post.find({ _id: { $in: postIds } })
        .select('_id caption type media likes_count comments_count')
        .lean();
      postMap = new Map(posts.map((p) => [String(p._id), p]));
    }

    const result = notifications.map((n) => {
      if (n.sender && n.sender.avatar_url) {
        n.sender.avatar_url = toCfUrl(n.sender.avatar_url);
      }

      let postId = null;
      if (n.link) {
        const match = n.link.match(/\/posts\/([a-f0-9]{24})/);
        if (match) postId = match[1];
      }

      let relatedPost = null;
      if (postId && postMap.has(postId)) {
        const p = { ...postMap.get(postId) };
        if (Array.isArray(p.media)) {
          p.media = p.media.map((m) => ({
            ...m,
            fileUrl: toCfUrl(m.fileUrl || m.fileName),
            thumbnails: Array.isArray(m.thumbnails)
              ? m.thumbnails.map((t) => ({ ...t, fileUrl: toCfUrl(t.fileUrl || t.fileName) }))
              : m.thumbnails,
          }));
        }
        relatedPost = p;
      }

      return { ...n, postId, relatedPost };
    });

    res.json({
      notifications: result,
      page,
      limit,
      total,
      hasMore: skip + notifications.length < total,
      appliedFilter: typeParam || 'all',
    });
  } catch (err) {
    console.error('[Notifications] GET error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Get count of unread notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread notifications count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   example: 5
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ 
      recipient: req.user._id, 
      isRead: false 
    }); 
    res.json({ count }); 
  } catch (err) { 
    res.status(500).json({ message: 'Server error' }); 
  } 
});

/**
 * @swagger
 * /api/notifications/mark-all-read:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "All notifications marked as read"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.patch('/mark-all-read', verifyToken, async (req, res) => {
  try {
    await Notification.updateMany( 
      { recipient: req.user._id, isRead: false }, 
      { isRead: true } 
    ); 
    res.json({ message: 'All notifications marked as read' }); 
  } catch (err) { 
    res.status(500).json({ message: 'Server error' }); 
  } 
});

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark a single notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *         example: "664f1a2b3c4d5e6f7a8b9c0d"
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Notification marked as read"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    await Notification.findOneAndUpdate( 
      { _id: req.params.id, recipient: req.user._id }, 
      { isRead: true } 
    ); 
    res.json({ message: 'Notification marked as read' }); 
  } catch (err) { 
    res.status(500).json({ message: 'Server error' }); 
  } 
});

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Delete a notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *         example: "664f1a2b3c4d5e6f7a8b9c0d"
 *     responses:
 *       200:
 *         description: Notification deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Deleted"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await Notification.findOneAndDelete({ 
      _id: req.params.id, 
      recipient: req.user._id 
    }); 
    res.json({ message: 'Deleted' }); 
  } catch (err) { 
    res.status(500).json({ message: 'Server error' }); 
  } 
});

module.exports = router;
