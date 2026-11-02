const mongoose = require('mongoose');
const GroupCall = require('../models/GroupCall');
const cloudflareRealtime = require('../services/cloudflareRealtime.service');

// Loads a group call and the requesting user's own participant entry —
// mirrors call.controller.js's loadCallForParty, generalized to the
// participants array instead of a caller/receiver pair.
const loadCallForParticipant = async (groupCallId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(groupCallId)) return { error: 'Invalid call ID' };
  const groupCall = await GroupCall.findById(groupCallId);
  if (!groupCall) return { error: 'Call not found' };
  const self = groupCall.participants.find((p) => String(p.user_id) === String(userId));
  if (!self) return { error: 'Call not found' };
  if (self.status !== 'joined') return { error: 'You have not joined this call' };
  return { groupCall, self };
};

// ─── WebRTC: publish my local track(s) ─────────────────────────────────────────
// Body: { sdpOffer, tracks: [{ mid, kind }] } — same shape as the 1:1
// endpoint (see call.controller.js's publishTrack).
exports.publishTrack = async (req, res) => {
  try {
    const { sdpOffer, tracks, mid } = req.body;
    const trackList = Array.isArray(tracks) && tracks.length ? tracks : (mid ? [{ mid, kind: 'audio' }] : null);
    if (!sdpOffer || !trackList) return res.status(400).json({ message: 'sdpOffer and tracks are required' });

    const { groupCall, self, error } = await loadCallForParticipant(req.params.id, req.userId);
    if (error) return res.status(error === 'Call not found' ? 404 : 400).json({ message: error });

    let sessionId = self.session_id;
    if (!sessionId) {
      try {
        sessionId = await cloudflareRealtime.createSession();
      } catch (cfErr) {
        console.error('[GroupCall publishTrack] createSession failed:', cfErr.message);
        return res.status(503).json({ message: 'Call media is not available right now', detail: cfErr.message, configured: cloudflareRealtime.isConfigured() });
      }
      if (!sessionId) return res.status(503).json({ message: 'Call media is not available right now', configured: cloudflareRealtime.isConfigured() });
    }

    const sdpAnswer = await cloudflareRealtime.pushTrack(sessionId, sdpOffer, trackList.map((t) => ({ mid: t.mid, trackName: t.kind })));
    if (!sdpAnswer) return res.status(502).json({ message: 'Failed to publish track(s)' });

    // Atomic positional update targeting only my own participant entry, not
    // load-mutate-save on the shared document — in a group call, several
    // participants publish around the same time, and Mongoose's optimistic
    // version check on the participants array would make all but the first
    // save fail with "No matching document found for id ... for version
    // ...". See call.controller.js's publishTrack for the same fix on 1:1 calls.
    await GroupCall.updateOne(
      { _id: groupCall._id, 'participants.user_id': req.userId },
      { $set: {
        'participants.$.session_id': sessionId,
        'participants.$.tracks': trackList.map((t) => ({ mid: t.mid, name: t.kind })),
      } },
    );

    return res.json({ success: true, sdpAnswer });
  } catch (error) {
    console.error('[GroupCall publishTrack]', error);
    return res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// ─── WebRTC: pull one specific peer's track(s) ─────────────────────────────────
// Body: { fromUserId }. The client calls this once per peer — on its
// initial roster (from the join response) and again on each
// group-call:peer-ready event — rather than one call pulling everyone.
exports.pullTrack = async (req, res) => {
  try {
    const { fromUserId } = req.body;
    if (!fromUserId) return res.status(400).json({ message: 'fromUserId is required' });

    const { groupCall, self, error } = await loadCallForParticipant(req.params.id, req.userId);
    if (error) return res.status(error === 'Call not found' ? 404 : 400).json({ message: error });

    const peer = groupCall.participants.find((p) => String(p.user_id) === String(fromUserId));
    if (!peer || peer.status !== 'joined') return res.status(409).json({ message: 'That participant is not in the call' });
    if (!peer.session_id || !peer.tracks?.length) return res.status(409).json({ message: 'That participant has not published yet' });

    const result = await cloudflareRealtime.pullTrack(self.session_id, peer.session_id, peer.tracks.map((t) => t.name));
    if (!result) return res.status(502).json({ message: 'Failed to pull track(s)' });

    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('[GroupCall pullTrack]', error);
    return res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// ─── WebRTC: answer a renegotiation offer from pullTrack ───────────────────────
exports.renegotiate = async (req, res) => {
  try {
    const { sdpAnswer } = req.body;
    if (!sdpAnswer) return res.status(400).json({ message: 'sdpAnswer is required' });

    const { self, error } = await loadCallForParticipant(req.params.id, req.userId);
    if (error) return res.status(error === 'Call not found' ? 404 : 400).json({ message: error });
    if (!self.session_id) return res.status(400).json({ message: 'No session to renegotiate' });

    const ok = await cloudflareRealtime.renegotiate(self.session_id, sdpAnswer);
    if (!ok) return res.status(502).json({ message: 'Renegotiation failed' });

    return res.json({ success: true });
  } catch (error) {
    console.error('[GroupCall renegotiate]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── My group call history ──────────────────────────────────────────────────
exports.listMyGroupCalls = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

    const query = { 'participants.user_id': req.userId };
    const [total, calls] = await Promise.all([
      GroupCall.countDocuments(query),
      GroupCall.find(query)
        .populate('conversation_id', 'groupName groupAvatar')
        .populate('participants.user_id', 'username full_name avatar_url')
        .populate('initiator_id', 'username full_name avatar_url')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    return res.json({ success: true, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum), calls });
  } catch (error) {
    console.error('[GroupCall listMyGroupCalls]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── A single group call's detail (participants only) ──────────────────────
exports.getGroupCallById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid call ID' });

    const groupCall = await GroupCall.findById(id)
      .populate('conversation_id', 'groupName groupAvatar')
      .populate('participants.user_id', 'username full_name avatar_url')
      .lean();
    if (!groupCall) return res.status(404).json({ message: 'Call not found' });

    const isParty = groupCall.participants.some((p) => String(p.user_id?._id) === String(req.userId));
    if (!isParty) return res.status(404).json({ message: 'Call not found' });

    return res.json({ success: true, call: groupCall });
  } catch (error) {
    console.error('[GroupCall getGroupCallById]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
