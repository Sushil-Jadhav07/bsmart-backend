const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const { createStory, getStoriesFeed, getStoryItems, viewStoryItem, getStoryViews, getStoriesArchive, deleteStory } = require('../controllers/story.controller');

/**
 * @swagger
 * /api/stories:
 *   post:
 *     summary: Create or append story items for current user
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateStoryRequest'
 *     responses:
 *       200:
 *         description: Story created/appended
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateStoryResponse'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Not authorized
 */
router.post('/', verifyToken, createStory);

/**
 * @swagger
 * /api/stories/feed:
 *   get:
 *     summary: Get active stories feed
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active stories
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StoryFeedItem'
 *       401:
 *         description: Not authorized
 */
router.get('/feed', verifyToken, getStoriesFeed);

/**
 * @swagger
 * /api/stories/{storyId}/items:
 *   get:
 *     summary: Get ordered items of a story
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Story items
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StoryItem'
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Story not found
 */
router.get('/:storyId/items', verifyToken, getStoryItems);

/**
 * @swagger
 * /api/stories/items/{itemId}/view:
 *   post:
 *     summary: Mark a story item as viewed
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: View recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Story item not found
 */
router.post('/items/:itemId/view', verifyToken, viewStoryItem);

/**
 * @swagger
 * /api/stories/{storyId}/views:
 *   get:
 *     summary: Get viewers list of a story (owner only)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Viewers list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StoryViewsResponse'
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Story not found
 */
router.get('/:storyId/views', verifyToken, getStoryViews);

/**
 * @swagger
 * /api/stories/archive:
 *   get:
 *     summary: Get archived stories for current user
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Archived stories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stories:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Story'
 *       401:
 *         description: Not authorized
 *
 * components:
 *   schemas:
 *     CreateStoryRequest:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/StoryItemPayload'
 *       example:
 *         items:
 *           - media:
 *               url: "http://localhost:5000/uploads/photo.jpg"
 *               type: "image"
 *             transform:
 *               x: 0.5
 *               y: 0.5
 *               scale: 1
 *               rotation: 0
 *             filter:
 *               name: "none"
 *               intensity: 0
 *             texts:
 *               - content: "Hello"
 *                 x: 0
 *                 y: 0
 *                 fontSize: 24
 *                 fontFamily: "classic"
 *                 color: "white"
 *                 align: "center"
 *                 rotation: 0
 *                 background:
 *                   enabled: false
 *             mentions:
 *               - user_id: "603e2f9d8c9a4b2f88d1e111"
 *                 username: "alice"
 *                 x: 0.2
 *                 y: 0.3
 *               - user_id: "603e2f9d8c9a4b2f88d1e222"
 *                 username: "bob"
 *                 x: 0.7
 *                 y: 0.6
 *     StoryItemPayload:
 *       type: object
 *       required: [media]
 *       properties:
 *         media:
 *           type: object
 *           required: [url, type]
 *           properties:
 *             url: { type: string }
 *             type: { type: string, enum: [image, reel] }
 *             thumbnail: { type: string }
 *             durationSec: { type: number, description: 'If image omitted defaults to 15' }
 *             width: { type: number }
 *             height: { type: number }
 *         transform:
 *           type: object
 *           properties:
 *             x: { type: number, default: 0.5 }
 *             y: { type: number, default: 0.5 }
 *             scale: { type: number, default: 1 }
 *             rotation: { type: number, default: 0 }
 *             boxWidth: { type: number }
 *             boxHeight: { type: number }
 *         filter:
 *           type: object
 *           properties:
 *             name: { type: string, default: none }
 *             intensity: { type: number }
 *         texts:
 *           type: array
 *           items:
 *             type: object
 *             required: [content, fontSize]
 *             properties:
 *               content: { type: string }
 *               x: { type: number }
 *               y: { type: number }
 *               fontSize: { type: number }
 *               fontFamily: { type: string, enum: [classic, modern, neon, typewriter] }
 *               color: { type: string }
 *               align: { type: string, enum: [left, center, right], default: center }
 *               rotation: { type: number }
 *               background:
 *                 type: object
 *                 properties:
 *                   enabled: { type: boolean, default: false }
 *                   color: { type: string }
 *                   opacity: { type: number }
 *         mentions:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               user_id: { type: string }
 *               username: { type: string }
 *               x: { type: number }
 *               y: { type: number }
 *     Story:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         user_id: { type: string }
 *         items_count: { type: number }
 *         views_count: { type: number }
 *         expiresAt: { type: string, format: date-time }
 *         isArchived: { type: boolean }
 *         archivedAt: { type: string, format: date-time }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     StoryItem:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         story_id: { type: string }
 *         user_id: { type: string }
 *         order: { type: number }
 *         media:
 *           $ref: '#/components/schemas/StoryItemPayload/properties/media'
 *         transform:
 *           $ref: '#/components/schemas/StoryItemPayload/properties/transform'
 *         filter:
 *           $ref: '#/components/schemas/StoryItemPayload/properties/filter'
 *         texts:
 *           $ref: '#/components/schemas/StoryItemPayload/properties/texts'
 *         mentions:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               user_id: { type: string }
 *               username: { type: string }
 *               x: { type: number }
 *               y: { type: number }
 *         expiresAt: { type: string, format: date-time }
 *         isDeleted: { type: boolean }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     CreateStoryResponse:
 *       type: object
 *       properties:
 *         success: { type: boolean }
 *         story:
 *           $ref: '#/components/schemas/Story'
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/StoryItem'
 *     StoryFeedItem:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         user:
 *           type: object
 *           properties:
 *             username: { type: string }
 *             avatar_url: { type: string }
 *         items_count: { type: number }
 *         views_count: { type: number }
 *         preview_item:
 *           $ref: '#/components/schemas/StoryItem'
 *         seen: { type: boolean }
 *     StoryViewsResponse:
 *       type: object
 *       properties:
 *         viewers:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               viewer:
 *                 type: object
 *                 properties:
 *                   _id: { type: string }
 *                   username: { type: string }
 *                   avatar_url: { type: string }
 *               viewedAt: { type: string, format: date-time }
 *         total_views:
 *           type: number
 *         unique_viewers:
 *           type: number
 */
router.get('/archive', verifyToken, getStoriesArchive);

/**
 * @swagger
 * /api/stories/{storyId}:
 *   delete:
 *     summary: Delete a story (owner only)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Story deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Story not found
 */
router.delete('/:storyId', verifyToken, deleteStory);

module.exports = router;
