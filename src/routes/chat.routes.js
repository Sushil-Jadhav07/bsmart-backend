const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const { upload, uploadAudio } = require('../config/multer');
const {
  createConversation,
  getOnlineUsers,
  getConversations,
  createGroupConversation,
  updateGroup,
  addGroupMember,
  removeGroupMember,
  acceptMessageRequest,
  declineMessageRequest,
  getConversationMessages,
  createMessage,
  markMessageSeen,
  addMessageReaction,
  removeMessageReaction,
  deleteMessage,
  uploadChatMedia,
  uploadVoiceMessage,
} = require('../controllers/chat.controller');

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: Direct message conversations and messages
 *
 * components:
 *   schemas:
 *     ChatParticipant:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         username:
 *           type: string
 *         full_name:
 *           type: string
 *         avatar_url:
 *           type: string
 *     ChatMessage:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         conversationId:
 *           type: string
 *         sender:
 *           oneOf:
 *             - type: string
 *             - $ref: '#/components/schemas/ChatParticipant'
 *         text:
 *           type: string
 *         mediaUrl:
 *           type: string
 *         mediaType:
 *           type: string
 *           enum: [image, video, audio, none]
 *         audioDuration:
 *           type: number
 *           nullable: true
 *         seenBy:
 *           type: array
 *           items:
 *             type: string
 *         reactions:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               userId:
 *                 oneOf:
 *                   - type: string
 *                   - $ref: '#/components/schemas/ChatParticipant'
 *               emoji:
 *                 type: string
 *               createdAt:
 *                 type: string
 *                 format: date-time
 *         isDeleted:
 *           type: boolean
 *         deletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     Conversation:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         participants:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ChatParticipant'
 *         lastMessage:
 *           nullable: true
 *           oneOf:
 *             - type: string
 *             - $ref: '#/components/schemas/ChatMessage'
 *         lastMessageAt:
 *           type: string
 *           format: date-time
 *         unreadCount:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/chat/conversations:
 *   post:
 *     summary: Create or return a direct conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [participantId]
 *             properties:
 *               participantId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Conversation returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Participant not found
 *       500:
 *         description: Server error
 */
router.post('/conversations', verifyToken, createConversation);
router.post('/groups', verifyToken, createGroupConversation);
router.patch('/groups/:conversationId', verifyToken, updateGroup);
router.post('/groups/:conversationId/members', verifyToken, addGroupMember);
router.delete('/groups/:conversationId/members/:userId', verifyToken, removeGroupMember);

/**
 * @swagger
 * /api/chat/conversations:
 *   get:
 *     summary: Get all conversations for the logged-in user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conversations fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Conversation'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/conversations', verifyToken, getConversations);
router.get('/online-users', verifyToken, getOnlineUsers);

/**
 * @swagger
 * /api/chat/conversations/{conversationId}/messages:
 *   get:
 *     summary: Get paginated messages for a conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Messages fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ChatMessage'
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 hasMore:
 *                   type: boolean
 *       400:
 *         description: Invalid conversationId
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Server error
 */
router.get('/conversations/:conversationId/messages', verifyToken, getConversationMessages);
router.put('/conversations/:conversationId/accept', verifyToken, acceptMessageRequest);
router.delete('/conversations/:conversationId/decline', verifyToken, declineMessageRequest);

/**
 * @swagger
 * /api/chat/conversations/{conversationId}/messages:
 *   post:
 *     summary: Send a new message in a conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *               mediaUrl:
 *                 type: string
 *               mediaType:
 *                 type: string
 *                 enum: [image, video, audio, none]
 *     responses:
 *       200:
 *         description: Message created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatMessage'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Server error
 */
router.post('/conversations/:conversationId/messages', verifyToken, createMessage);

/**
 * @swagger
 * /api/chat/conversations/{conversationId}/voice:
 *   post:
 *     summary: Upload and send a voice message in one step
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *               duration:
 *                 type: string
 *                 description: Duration in seconds
 *     responses:
 *       200:
 *         description: Voice message created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatMessage'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Server error
 */
router.post(
  '/conversations/:conversationId/voice',
  verifyToken,
  uploadAudio.single('audio'),
  uploadVoiceMessage
);

/**
 * @swagger
 * /api/chat/messages/{messageId}/seen:
 *   put:
 *     summary: Mark a message as seen by the logged-in user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatMessage'
 *       400:
 *         description: Invalid messageId
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Message not found
 *       500:
 *         description: Server error
 */
router.put('/messages/:messageId/seen', verifyToken, markMessageSeen);

/**
 * @swagger
 * /api/chat/messages/{id}/reaction:
 *   post:
 *     summary: Add or replace the logged-in user's reaction on a message
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [emoji]
 *             properties:
 *               emoji:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reaction updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatMessage'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Message not found
 *       500:
 *         description: Server error
 */
router.post('/messages/:id/reaction', verifyToken, addMessageReaction);

/**
 * @swagger
 * /api/chat/messages/{id}/reaction:
 *   delete:
 *     summary: Remove the logged-in user's reaction from a message
 *     tags: [Chat]
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
 *         description: Reaction removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatMessage'
 *       400:
 *         description: Invalid messageId
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Message not found
 *       500:
 *         description: Server error
 */
router.delete('/messages/:id/reaction', verifyToken, removeMessageReaction);

/**
 * @swagger
 * /api/chat/messages/{messageId}:
 *   delete:
 *     summary: Unsend a message sent by the logged-in user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message unsent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 messageId:
 *                   type: string
 *       400:
 *         description: Invalid messageId
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Message not found
 *       500:
 *         description: Server error
 */
router.delete('/messages/:messageId', verifyToken, deleteMessage);

/**
 * @swagger
 * /api/chat/conversations/{conversationId}/media:
 *   post:
 *     summary: Upload one or more media files for a chat conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               media:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Media uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 media:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       mediaUrl:
 *                         type: string
 *                       mediaType:
 *                         type: string
 *                         enum: [image, video]
 *                       originalName:
 *                         type: string
 *                       filename:
 *                         type: string
 *                       mimetype:
 *                         type: string
 *                       size:
 *                         type: integer
 *                 mediaUrl:
 *                   type: string
 *                   description: First uploaded media URL for backward compatibility
 *                 mediaType:
 *                   type: string
 *                   enum: [image, video]
 *                   description: First uploaded media type for backward compatibility
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Server error
 */
router.post('/conversations/:conversationId/media', verifyToken, upload.array('media', 10), uploadChatMedia);

module.exports = router;
