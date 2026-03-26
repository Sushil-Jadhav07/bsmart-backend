const router     = require('express').Router();
const auth       = require('../middleware/auth');
const ctrl       = require('../controllers/highlight.controller');

/**
 * @swagger
 * /api/highlights:
 *   post:
 *     summary: Create a new highlight
 *     tags: [Highlights]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateHighlightRequest'
 *     responses:
 *       201:
 *         description: Highlight created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Highlight'
 *       400:
 *         description: Title is required
 *       401:
 *         description: Not authorized
 */
router.post('/',              auth, ctrl.createHighlight);

/**
 * @swagger
 * /api/highlights/user/{userId}:
 *   get:
 *     summary: Get highlights of a user
 *     tags: [Highlights]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of highlights
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Highlight'
 *       401:
 *         description: Not authorized
 */
router.get('/user/:userId',   auth, ctrl.getUserHighlights);  // public-ish: any logged-in user

/**
 * @swagger
 * /api/highlights/{id}/items:
 *   post:
 *     summary: Add story items to a highlight
 *     tags: [Highlights]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Highlight ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddHighlightItemsRequest'
 *     responses:
 *       200:
 *         description: Items added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 items_count:
 *                   type: integer
 *       400:
 *         description: story_item_ids required
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Highlight not found
 *   get:
 *     summary: Get items of a highlight
 *     tags: [Highlights]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Highlight ID
 *     responses:
 *       200:
 *         description: Highlight items
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StoryItem'
 *       401:
 *         description: Not authorized
 */
router.post('/:id/items',     auth, ctrl.addItems);
router.get('/:id/items',      auth, ctrl.getItems);

/**
 * @swagger
 * /api/highlights/{id}:
 *   patch:
 *     summary: Update a highlight
 *     tags: [Highlights]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Highlight ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateHighlightRequest'
 *     responses:
 *       200:
 *         description: Highlight updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Highlight'
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Highlight not found
 *   delete:
 *     summary: Delete a highlight
 *     tags: [Highlights]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Highlight ID
 *     responses:
 *       200:
 *         description: Highlight deleted
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
 *         description: Highlight not found
 */
/**
 * @swagger
 * /api/highlights/{id}/items/{itemId}:
 *   delete:
 *     summary: Remove an item from a highlight
 *     tags: [Highlights]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Highlight ID
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *         description: Highlight item ID
 *     responses:
 *       200:
 *         description: Item removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Item not found
 *
 * components:
 *   schemas:
 *     Highlight:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         user_id:
 *           type: string
 *         title:
 *           type: string
 *         cover_url:
 *           type: string
 *         items_count:
 *           type: integer
 *         order:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateHighlightRequest:
 *       type: object
 *       required: [title]
 *       properties:
 *         title:
 *           type: string
 *           example: Travel
 *         cover_url:
 *           type: string
 *           example: https://example.com/cover.jpg
 *     UpdateHighlightRequest:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           example: Best Moments
 *         cover_url:
 *           type: string
 *           example: https://example.com/new-cover.jpg
 *     AddHighlightItemsRequest:
 *       type: object
 *       required: [story_item_ids]
 *       properties:
 *         story_item_ids:
 *           type: array
 *           items:
 *             type: string
 *           example:
 *             - 660d2ef6d4c57d0012345678
 *             - 660d2ef6d4c57d0012345679
 */
router.patch('/:id',          auth, ctrl.updateHighlight);
router.delete('/:id/items/:itemId', auth, ctrl.removeItem);
router.delete('/:id',         auth, ctrl.deleteHighlight);

module.exports = router;
