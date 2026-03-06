const express = require('express');
const router = express.Router();
const Notification = require('../models/notification.model');
const verifyToken = require('../middleware/auth');

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
 *     responses:
 *       200:
 *         description: Notification marked as read
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
 *     responses:
 *       200:
 *         description: Notification deleted
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
