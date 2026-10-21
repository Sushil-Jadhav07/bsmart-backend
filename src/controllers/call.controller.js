const mongoose = require('mongoose');
const CallLog = require('../models/CallLog');
const User = require('../models/User');
const { canCall } = require('../utils/callPermission');
const cloudflareRealtime = require('../services/cloudflareRealtime.service');

// Loads a call the requesting user is a party to (as caller or receiver),
// and tells the caller which side `req.userId` is on — the WebRTC endpoints
// below store/read caller_* vs receiver_* fields on CallLog accordingly.
const loadCallForParty = async (callId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(callId)) return { error: 'Invalid call ID' };
  const call = await CallLog.findById(callId);
  if (!call) return { error: 'Call not found' };
  const isCaller = String(call.caller_id) === String(userId);
  const isReceiver = String(call.receiver_id) === String(userId);
  if (!isCaller && !isReceiver) return { error: 'Call not found' };
  if (call.status !== 'answered') return { error: 'Call is not active' };
  return { call, isCaller };
};

// ─── Register this device's Apple PushKit VoIP token ─────────────────────────
// Android reuses the existing FCM token (POST /api/push/register-fcm) — this
// is only for iOS call-ringing, which needs a separate token type.
exports.registerVoipToken = async (req, res) => {
  try {
    const { voip_token } = req.body;
    if (!voip_token) {
      return res.status(400).json({ message: 'voip_token is required' });
    }
    await User.findByIdAndUpdate(req.userId, { voip_token });
    return res.json({ success: true, message: 'VoIP token registered' });
  } catch (error) {
    console.error('[registerVoipToken]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Can the current user call this user right now? ──────────────────────────
// Lets the frontend decide whether to show a call button before attempting
// call:initiate over the socket.
exports.checkCanCall = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    const allowed = await canCall(req.userId, userId);
    return res.json({ success: true, can_call: allowed });
  } catch (error) {
    console.error('[checkCanCall]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── My call history (incoming + outgoing) ────────────────────────────────────
exports.listMyCalls = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

    const query = { $or: [{ caller_id: req.userId }, { receiver_id: req.userId }] };
    const [total, calls] = await Promise.all([
      CallLog.countDocuments(query),
      CallLog.find(query)
        .populate('caller_id', 'username full_name avatar_url')
        .populate('receiver_id', 'username full_name avatar_url')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    return res.json({ success: true, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum), calls });
  } catch (error) {
    console.error('[listMyCalls]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── WebRTC: publish my local audio track ─────────────────────────────────────
// Body: { sdpOffer, mid }. Creates a Cloudflare Realtime session for me (if I
// don't have one yet for this call) and pushes my audio track to it. Returns
// the SDP answer my RTCPeerConnection should set as its remote description.
exports.publishTrack = async (req, res) => {
  try {
    const { sdpOffer, mid } = req.body;
    if (!sdpOffer || !mid) return res.status(400).json({ message: 'sdpOffer and mid are required' });

    const { call, isCaller, error } = await loadCallForParty(req.params.id, req.userId);
    if (error) return res.status(error === 'Call not found' ? 404 : 400).json({ message: error });

    let sessionId = isCaller ? call.caller_session_id : call.receiver_session_id;
    if (!sessionId) {
      try {
        sessionId = await cloudflareRealtime.createSession();
      } catch (cfErr) {
        console.error('[publishTrack] createSession failed:', cfErr.message);
        return res.status(503).json({ v: 'v3', message: 'Call media is not available right now', detail: cfErr.message, configured: cloudflareRealtime.isConfigured() });
      }
      if (!sessionId) return res.status(503).json({ v: 'v3', message: 'Call media is not available right now (no session, no throw)', configured: cloudflareRealtime.isConfigured() });
    }

    const sdpAnswer = await cloudflareRealtime.pushTrack(sessionId, sdpOffer, mid);
    if (!sdpAnswer) return res.status(502).json({ v: 'v3', message: 'Failed to publish audio track' });

    if (isCaller) {
      call.caller_session_id = sessionId;
      call.caller_track_name = 'audio';
    } else {
      call.receiver_session_id = sessionId;
      call.receiver_track_name = 'audio';
    }
    await call.save();

    return res.json({ success: true, sdpAnswer });
  } catch (error) {
    console.error('[publishTrack]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── WebRTC: pull the other party's audio track ───────────────────────────────
// No body needed — the peer's session/track is read from CallLog, which is
// only populated once they've called publishTrack themselves. Returns
// requiresImmediateRenegotiation + an sdpOffer to answer via renegotiate()
// when Cloudflare needs a new m-line added for the incoming track.
exports.pullTrack = async (req, res) => {
  try {
    const { call, isCaller, error } = await loadCallForParty(req.params.id, req.userId);
    if (error) return res.status(error === 'Call not found' ? 404 : 400).json({ message: error });

    const mySessionId = isCaller ? call.caller_session_id : call.receiver_session_id;
    const peerSessionId = isCaller ? call.receiver_session_id : call.caller_session_id;
    const peerTrackName = isCaller ? call.receiver_track_name : call.caller_track_name;
    if (!mySessionId) return res.status(400).json({ message: 'You must publish your own track before pulling' });
    if (!peerSessionId || !peerTrackName) return res.status(409).json({ message: 'The other party has not published yet' });

    const result = await cloudflareRealtime.pullTrack(mySessionId, peerSessionId, peerTrackName);
    if (!result) return res.status(502).json({ message: 'Failed to pull audio track' });

    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('[pullTrack]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── WebRTC: answer a renegotiation offer from pullTrack ──────────────────────
// Body: { sdpAnswer }.
exports.renegotiate = async (req, res) => {
  try {
    const { sdpAnswer } = req.body;
    if (!sdpAnswer) return res.status(400).json({ message: 'sdpAnswer is required' });

    const { call, isCaller, error } = await loadCallForParty(req.params.id, req.userId);
    if (error) return res.status(error === 'Call not found' ? 404 : 400).json({ message: error });

    const sessionId = isCaller ? call.caller_session_id : call.receiver_session_id;
    if (!sessionId) return res.status(400).json({ message: 'No session to renegotiate' });

    const ok = await cloudflareRealtime.renegotiate(sessionId, sdpAnswer);
    if (!ok) return res.status(502).json({ message: 'Renegotiation failed' });

    return res.json({ success: true });
  } catch (error) {
    console.error('[renegotiate]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── A single call's detail (either party only) ──────────────────────────────
exports.getCallById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid call ID' });
    }
    const call = await CallLog.findById(id)
      .populate('caller_id', 'username full_name avatar_url')
      .populate('receiver_id', 'username full_name avatar_url')
      .lean();
    if (!call) return res.status(404).json({ message: 'Call not found' });

    const isParty = [String(call.caller_id._id), String(call.receiver_id._id)].includes(String(req.userId));
    if (!isParty) return res.status(404).json({ message: 'Call not found' });

    return res.json({ success: true, call });
  } catch (error) {
    console.error('[getCallById]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
