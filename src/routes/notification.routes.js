const express = require('express');
const router = express.Router();
const Notification = require('../models/notification.model');
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
 *   description: Real-time notification management
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
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('sender', 'username full_name avatar_url');
    res.json(notifications);
  } catch (err) {
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
