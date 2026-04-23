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
  leaveGroupConversation,
  deleteGroupConversationForUser,
  acceptMessageRequest,
  declineMessageRequest,
  getConversationMessages,
  createMessage,
  shareContentToUsers,
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
 *   description: Direct messages, group chats, requests, and chat messages
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
 *         isGroup:
 *           type: boolean
 *         groupName:
 *           type: string
 *         groupAvatar:
 *           type: string
 *         groupAdmin:
 *           oneOf:
 *             - type: string
 *             - $ref: '#/components/schemas/ChatParticipant'
 *         createdBy:
 *           oneOf:
 *             - type: string
 *             - $ref: '#/components/schemas/ChatParticipant'
 *         isRequest:
 *           type: boolean
 *         requestStatus:
 *           type: string
 *           enum: [pending, accepted, declined]
 *         requestedBy:
 *           nullable: true
 *           oneOf:
 *             - type: string
 *             - $ref: '#/components/schemas/ChatParticipant'
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
 *     OnlineUsersResponse:
 *       type: object
 *       properties:
 *         onlineUserIds:
 *           type: array
 *           items:
 *             type: string
 *     CreateGroupConversationRequest:
 *       type: object
 *       required: [participantIds]
 *       properties:
 *         participantIds:
 *           type: array
 *           items:
 *             type: string
 *         groupName:
 *           type: string
 *         groupAvatar:
 *           type: string
 *     ShareContentRequest:
 *       type: object
 *       required: [recipientIds, contentType, contentId]
 *       properties:
 *         recipientIds:
 *           type: array
 *           items:
 *             type: string
 *         contentType:
 *           type: string
 *           enum: [post, reel, ad]
 *         contentId:
 *           type: string
 *         note:
 *           type: string
 *     UpdateGroupRequest:
 *       type: object
 *       properties:
 *         groupName:
 *           type: string
 *         groupAvatar:
 *           type: string
 *     AddGroupMemberRequest:
 *       type: object
 *       required: [userId]
 *       properties:
 *         userId:
 *           type: string
 *     SimpleSuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         conversationDeleted:
 *           type: boolean
 *           nullable: true
 */

/**
 * @swagger
 * /api/chat/conversations:
 *   post:
 *     summary: Create or return a direct conversation or pending request
 *     description: Creates a normal direct chat for mutual followers, otherwise creates or returns a pending message request. Existing pending direct chats are automatically converted to normal chats once the follow relationship becomes mutual.
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

/**
 * @swagger
 * /api/chat/groups:
 *   post:
 *     summary: Create a new group conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateGroupConversationRequest'
 *     responses:
 *       201:
 *         description: Group conversation created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: One or more participants not found
 *       500:
 *         description: Server error
 */
router.post('/groups', verifyToken, createGroupConversation);

/**
 * @swagger
 * /api/chat/share:
 *   post:
 *     summary: Share a post, reel, or ad to followed users in chat
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ShareContentRequest'
 *     responses:
 *       200:
 *         description: Content shared successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Can only share to users you are following
 *       404:
 *         description: Shared content not found
 *       500:
 *         description: Server error
 */
router.post('/share', verifyToken, shareContentToUsers);

/**
 * @swagger
 * /api/chat/groups/{conversationId}:
 *   patch:
 *     summary: Update a group's name or avatar
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
 *             $ref: '#/components/schemas/UpdateGroupRequest'
 *     responses:
 *       200:
 *         description: Group updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       400:
 *         description: Invalid conversationId
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only the group admin can update the group
 *       404:
 *         description: Group conversation not found
 *       500:
 *         description: Server error
 */
router.patch('/groups/:conversationId', verifyToken, updateGroup);

/**
 * @swagger
 * /api/chat/groups/{conversationId}/members:
 *   post:
 *     summary: Add a member to a group conversation
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
 *             $ref: '#/components/schemas/AddGroupMemberRequest'
 *     responses:
 *       200:
 *         description: Group member added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only the group admin can add members
 *       404:
 *         description: Group conversation or user not found
 *       500:
 *         description: Server error
 */
router.post('/groups/:conversationId/members', verifyToken, addGroupMember);

/**
 * @swagger
 * /api/chat/groups/{conversationId}/members/{userId}:
 *   delete:
 *     summary: Remove a member from a group conversation or leave the group
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Group member removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/Conversation'
 *                 - $ref: '#/components/schemas/SimpleSuccessResponse'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to remove this member
 *       404:
 *         description: Group conversation or member not found
 *       500:
 *         description: Server error
 */
router.delete('/groups/:conversationId/members/:userId', verifyToken, removeGroupMember);
router.post('/groups/:conversationId/leave', verifyToken, leaveGroupConversation);
router.delete('/groups/:conversationId/delete', verifyToken, deleteGroupConversationForUser);

/**
 * @swagger
 * /api/chat/conversations:
 *   get:
 *     summary: Get all conversations for the logged-in user
 *     description: Returns normal chats or incoming message requests depending on the type query. Pending direct chats are automatically normalized to accepted chats when both users follow each other.
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [normal, requests]
 *           default: normal
 *         description: Fetch normal conversations or only incoming message requests
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

/**
 * @swagger
 * /api/chat/online-users:
 *   get:
 *     summary: Get currently online user IDs
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: ids
 *         schema:
 *           type: string
 *         description: Optional comma-separated list of user IDs to filter against
 *     responses:
 *       200:
 *         description: Online users fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OnlineUsersResponse'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /api/chat/conversations/{conversationId}/accept:
 *   put:
 *     summary: Accept an incoming message request
 *     description: Moves a pending incoming request into the normal chat list by marking it as accepted.
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message request accepted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       400:
 *         description: Invalid request or request is not pending
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only the recipient can accept
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Server error
 */
router.put('/conversations/:conversationId/accept', verifyToken, acceptMessageRequest);

/**
 * @swagger
 * /api/chat/conversations/{conversationId}/decline:
 *   delete:
 *     summary: Decline an incoming message request
 *     description: Deletes a pending incoming request conversation and its messages.
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message request declined successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SimpleSuccessResponse'
 *       400:
 *         description: Invalid request or request is not pending
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only the recipient can decline
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Server error
 */
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
