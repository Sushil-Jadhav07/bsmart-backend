const router = require('express').Router();
const auth = require('../middleware/auth');
const {
  savePost,
  unsavePost,
  savePromoteReel,
  unsavePromoteReel,
  saveAd,
  unsaveAd,
  getSavedItems,
} = require('../controllers/saved.controller');

/**
 * @swagger
 * tags:
 *   name: Saved
 *   description: Save and retrieve saved posts, reels, promote reels and ads
 */

/**
 * @swagger
 * /api/saved:
 *   get:
 *     summary: Get all saved items for the logged-in user
 *     tags: [Saved]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unified saved items list
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               user_id: "67e3aa001122334455667711"
 *               total: 4
 *               counts:
 *                 posts: 1
 *                 reels: 1
 *                 promote_reels: 1
 *                 ads: 1
 *               items:
 *                 - item_type: "post"
 *                   _id: "67e3aa001122334455667801"
 *                   is_saved_by_me: true
 *                   savedAt: "2026-06-12T10:00:00.000Z"
 *                 - item_type: "reel"
 *                   _id: "67e3aa001122334455667802"
 *                   is_saved_by_me: true
 *                   savedAt: "2026-06-12T09:00:00.000Z"
 *                 - item_type: "promote_reel"
 *                   _id: "67e3aa001122334455667803"
 *                   is_saved_by_me: true
 *                   savedAt: "2026-06-12T08:00:00.000Z"
 *                 - item_type: "ad"
 *                   _id: "67e3aa001122334455667804"
 *                   is_saved_by_me: true
 *                   savedAt: "2026-06-12T07:00:00.000Z"
 */
router.get('/', auth, (req, res) => {
  req.params.userId = String(req.userId);
  return getSavedItems(req, res);
});

/**
 * @swagger
 * /api/saved/{userId}:
 *   get:
 *     summary: Get all saved items for a specific user
 *     tags: [Saved]
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
 *         description: Unified saved items list for the user
 *       400:
 *         description: Invalid userId
 *       401:
 *         description: Unauthorized
 */
router.get('/:userId', auth, getSavedItems);

/**
 * @swagger
 * /api/saved/posts/{id}:
 *   post:
 *     summary: Save a post or reel
 *     tags: [Saved]
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
 *         description: Post saved
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Post saved"
 *               saved: true
 *               saved_count: 12
 *       404:
 *         description: Post not found
 *       409:
 *         description: Already saved
 */
router.post('/posts/:id', auth, savePost);

/**
 * @swagger
 * /api/saved/posts/{id}/unsave:
 *   post:
 *     summary: Unsave a post or reel
 *     tags: [Saved]
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
 *         description: Post unsaved
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Post unsaved"
 *               saved: false
 *               saved_count: 11
 *       400:
 *         description: Not saved yet
 */
router.post('/posts/:id/unsave', auth, unsavePost);

/**
 * @swagger
 * /api/saved/promote-reels/{id}:
 *   post:
 *     summary: Save a promote reel
 *     tags: [Saved]
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
 *         description: Promote reel saved
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Promote reel saved"
 *               saved: true
 *               saved_count: 5
 *       404:
 *         description: Promote reel not found
 *       409:
 *         description: Already saved
 */
router.post('/promote-reels/:id', auth, savePromoteReel);

/**
 * @swagger
 * /api/saved/promote-reels/{id}/unsave:
 *   post:
 *     summary: Unsave a promote reel
 *     tags: [Saved]
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
 *         description: Promote reel unsaved
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Promote reel unsaved"
 *               saved: false
 *               saved_count: 4
 *       400:
 *         description: Not saved yet
 */
router.post('/promote-reels/:id/unsave', auth, unsavePromoteReel);

/**
 * @swagger
 * /api/saved/ads/{id}:
 *   post:
 *     summary: Save an ad
 *     tags: [Saved]
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
 *         description: Ad saved
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Ad saved"
 *               saved: true
 *               saved_count: 3
 *       404:
 *         description: Ad not found
 *       409:
 *         description: Already saved
 */
router.post('/ads/:id', auth, saveAd);

/**
 * @swagger
 * /api/saved/ads/{id}/unsave:
 *   post:
 *     summary: Unsave an ad
 *     tags: [Saved]
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
 *         description: Ad unsaved
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Ad unsaved"
 *               saved: false
 *               saved_count: 2
 *       400:
 *         description: Not saved yet
 */
router.post('/ads/:id/unsave', auth, unsaveAd);

module.exports = router;
