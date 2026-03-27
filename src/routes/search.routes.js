const router = require('express').Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/search.controller');

/**
 * @swagger
 * tags:
 *   - name: Search
 *     description: Instagram-like global search and search history
 */

/**
 * @swagger
 * /api/search:
 *   get:
 *     summary: Search users, posts and reels
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search keyword. Matches username, full name, user id and post/reel caption.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 25
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               query: "suraj"
 *               counts:
 *                 users: 1
 *                 posts: 2
 *                 reels: 1
 *               results:
 *                 users:
 *                   - _id: "67e3aa001122334455667711"
 *                     username: "suraj"
 *                     full_name: "Suraj Kumar"
 *                     avatar_url: "https://example.com/avatar.jpg"
 *                     role: "member"
 *                     bio: "Creator"
 *                 posts:
 *                   - _id: "67e3aa001122334455667801"
 *                     user_id: "67e3aa001122334455667711"
 *                     username: "suraj"
 *                     full_name: "Suraj Kumar"
 *                     avatar_url: "https://example.com/avatar.jpg"
 *                     caption: "My first post"
 *                     type: "post"
 *                     media: []
 *                     createdAt: "2026-03-27T10:00:00.000Z"
 *                 reels:
 *                   - _id: "67e3aa001122334455667802"
 *                     user_id: "67e3aa001122334455667711"
 *                     username: "suraj"
 *                     full_name: "Suraj Kumar"
 *                     avatar_url: "https://example.com/avatar.jpg"
 *                     caption: "My first reel"
 *                     type: "reel"
 *                     media: []
 *                     createdAt: "2026-03-27T10:05:00.000Z"
 *       400:
 *         description: q is required
 *       401:
 *         description: Not authorized
 */
router.get('/', auth, ctrl.searchAll);

/**
 * @swagger
 * /api/search/history/{userId}:
 *   get:
 *     summary: Get recent search history by user id
 *     tags: [Search]
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
 *         description: Recent search history
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               user_id: "67e3aa001122334455667711"
 *               total: 2
 *               history:
 *                 - _id: "67e3aa001122334455668001"
 *                   user_id: "67e3aa001122334455667711"
 *                   query: "suraj"
 *                   searches_count: 3
 *                   searched_at: "2026-03-27T10:20:00.000Z"
 *                   createdAt: "2026-03-27T09:20:00.000Z"
 *                   updatedAt: "2026-03-27T10:20:00.000Z"
 *       400:
 *         description: Invalid userId
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.get('/history/:userId', auth, ctrl.getSearchHistory);

/**
 * @swagger
 * /api/search/history/{userId}:
 *   delete:
 *     summary: Delete all search history of a user
 *     tags: [Search]
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
 *         description: All search history deleted
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               user_id: "67e3aa001122334455667711"
 *               deleted_count: 5
 *               message: "Search history cleared successfully"
 *       400:
 *         description: Invalid userId
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.delete('/history/:userId', auth, ctrl.deleteAllSearchHistory);

/**
 * @swagger
 * /api/search/history/{userId}/{historyId}:
 *   delete:
 *     summary: Delete a single search history item
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: historyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Single search history item deleted
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               user_id: "67e3aa001122334455667711"
 *               history_id: "67e3aa001122334455668001"
 *               message: "Search history item deleted successfully"
 *       400:
 *         description: Invalid userId or historyId
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Search history item not found
 */
router.delete('/history/:userId/:historyId', auth, ctrl.deleteSingleSearchHistory);

module.exports = router;
