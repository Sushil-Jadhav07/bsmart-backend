const router = require('express').Router();

// TEMP diagnostic — delete once the container-rollout propagation issue is
// confirmed resolved. Lets us verify a deploy actually reached the running
// instance without depending on an authed call or container introspection.
router.get('/_debug-version', (req, res) => {
  const cloudflareRealtime = require('../services/cloudflareRealtime.service');
  res.json({
    v: 'v4-env-forwarding-fix',
    cloudflareRealtimeConfigured: cloudflareRealtime.isConfigured(),
    hasAppId: !!process.env.CLOUDFLARE_REALTIME_APP_ID,
    hasAppToken: !!process.env.CLOUDFLARE_REALTIME_APP_TOKEN,
  });
});
const auth = require('../middleware/auth');
const {
  registerVoipToken,
  checkCanCall,
  listMyCalls,
  getCallById,
  publishTrack,
  pullTrack,
  renegotiate,
} = require('../controllers/call.controller');

/**
 * @swagger
 * tags:
 *   name: Calls
 *   description: Voice/video call signaling support — history, permission check, and device tokens. Actual call setup/teardown happens over Socket.io (call:initiate, call:accept, call:reject, call:end), not REST.
 */

/**
 * @swagger
 * /api/calls/voip-token:
 *   post:
 *     summary: Register this device's Apple PushKit VoIP token (iOS call ringing)
 *     description: Android uses the existing POST /api/push/register-fcm instead — this is iOS-only.
 *     tags: [Calls]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [voip_token]
 *             properties:
 *               voip_token: { type: string }
 *     responses:
 *       200:
 *         description: Token saved
 *       400:
 *         description: voip_token is required
 */
router.post('/voip-token', auth, registerVoipToken);

/**
 * @swagger
 * /api/calls/can-call/{userId}:
 *   get:
 *     summary: Check whether the current user is allowed to call another user
 *     description: Calling requires a mutual follow (both users follow each other).
 *     tags: [Calls]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ can_call: boolean }"
 */
router.get('/can-call/:userId', auth, checkCanCall);

/**
 * @swagger
 * /api/calls:
 *   get:
 *     summary: Get the logged-in user's call history (incoming and outgoing)
 *     tags: [Calls]
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
 *         description: Paginated call history
 */
router.get('/', auth, listMyCalls);

/**
 * @swagger
 * /api/calls/{id}:
 *   get:
 *     summary: Get a single call's detail (either party only)
 *     tags: [Calls]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Call detail
 *       404:
 *         description: Call not found (also returned if you weren't a party to it)
 */
router.get('/:id', auth, getCallById);

/**
 * @swagger
 * /api/calls/{id}/webrtc/publish:
 *   post:
 *     summary: Publish my local audio track to Cloudflare Realtime for an active (answered) call
 *     description: Call must be in 'answered' status. Creates my Cloudflare session on first call. `mid` is the m-line id of the audio track from my SDP offer.
 *     tags: [Calls]
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
 *             required: [sdpOffer, mid]
 *             properties:
 *               sdpOffer: { type: string }
 *               mid: { type: string }
 *     responses:
 *       200:
 *         description: "{ sdpAnswer } — set as the RTCPeerConnection's remote description"
 */
router.post('/:id/webrtc/publish', auth, publishTrack);

/**
 * @swagger
 * /api/calls/{id}/webrtc/pull:
 *   post:
 *     summary: Pull the other party's published audio track into my session
 *     description: Requires both parties to have called publishTrack first. Returns requiresImmediateRenegotiation + sdpOffer when Cloudflare needs a new m-line answered via the renegotiate endpoint.
 *     tags: [Calls]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ requiresImmediateRenegotiation, sdpOffer }"
 *       409:
 *         description: The other party has not published yet
 */
router.post('/:id/webrtc/pull', auth, pullTrack);

/**
 * @swagger
 * /api/calls/{id}/webrtc/renegotiate:
 *   put:
 *     summary: Answer a renegotiation offer returned by the pull endpoint
 *     tags: [Calls]
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
