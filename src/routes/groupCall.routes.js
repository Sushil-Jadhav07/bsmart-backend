const router = require('express').Router();
const auth = require('../middleware/auth');
const {
  publishTrack,
  pullTrack,
  renegotiate,
  listMyGroupCalls,
  getGroupCallById,
} = require('../controllers/groupCall.controller');

/**
 * @swagger
 * tags:
 *   name: GroupCalls
 *   description: Group voice/video call signaling support — history and WebRTC media. Call setup/roster changes (initiate, join, decline, leave) happen over Socket.io (group-call:initiate, group-call:join, group-call:decline, group-call:leave, group-call:track-published), not REST — see src/sockets/groupCallSignaling.js.
 */

/**
 * @swagger
 * /api/group-calls:
 *   get:
 *     summary: Get the logged-in user's group call history
 *     tags: [GroupCalls]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated group call history
 */
router.get('/', auth, listMyGroupCalls);

/**
 * @swagger
 * /api/group-calls/{id}:
 *   get:
 *     summary: Get a single group call's detail (participants only)
 *     tags: [GroupCalls]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Group call detail
 *       404:
 *         description: Call not found (also returned if you weren't a participant)
 */
router.get('/:id', auth, getGroupCallById);

/**
 * @swagger
 * /api/group-calls/{id}/webrtc/publish:
 *   post:
 *     summary: Publish my local track(s) to Cloudflare Realtime for a group call I've joined
 *     description: "`tracks` is one entry per media kind in my SDP offer — one (`audio`) for a voice call, two (`audio` + `video`) for a video call."
 *     tags: [GroupCalls]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sdpOffer, tracks]
 *             properties:
 *               sdpOffer: { type: string }
 *               tracks:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     mid: { type: string }
 *                     kind: { type: string, enum: [audio, video] }
 *     responses:
 *       200:
 *         description: "{ sdpAnswer } — set as the RTCPeerConnection's remote description"
 */
router.post('/:id/webrtc/publish', auth, publishTrack);

/**
 * @swagger
 * /api/group-calls/{id}/webrtc/pull:
 *   post:
 *     summary: Pull one specific joined peer's published track(s) into my session
 *     description: Called once per peer — on the initial roster handed back when joining, and again on each group-call:peer-ready event.
 *     tags: [GroupCalls]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fromUserId]
 *             properties:
 *               fromUserId: { type: string }
 *     responses:
 *       200:
 *         description: "{ requiresImmediateRenegotiation, sdpOffer }"
 *       409:
 *         description: That participant is not in the call, or has not published yet
 */
router.post('/:id/webrtc/pull', auth, pullTrack);

/**
 * @swagger
 * /api/group-calls/{id}/webrtc/renegotiate:
 *   put:
 *     summary: Answer a renegotiation offer returned by the pull endpoint
 *     tags: [GroupCalls]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sdpAnswer]
 *             properties:
 *               sdpAnswer: { type: string }
 *     responses:
 *       200:
 *         description: Renegotiation accepted
 */
router.put('/:id/webrtc/renegotiate', auth, renegotiate);

module.exports = router;
