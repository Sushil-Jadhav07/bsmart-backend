// Voice/video call signaling over the existing Socket.io connection.
// Media itself (audio/video packets) goes peer-to-peer or through Cloudflare
// Realtime's TURN/SFU relay — this module only coordinates who is calling
// whom and what state the call is in. See src/services/cloudflareRealtime.service.js
// for the media session piece, which needs real Cloudflare credentials to work.

const mongoose = require('mongoose');
const CallLog = require('../models/CallLog');
const User = require('../models/User');
const sendNotification = require('../utils/sendNotification');
const { canCall } = require('../utils/callPermission');
const { closeSession } = require('../services/cloudflareRealtime.service');
const { sendVoipPush } = require('../utils/sendVoipPush');
const admin = require('../lib/firebase');

const RING_TIMEOUT_MS = 45 * 1000;

// callId -> timeout handle, so a server restart simply drops stale timers
// rather than leaving a phantom ring; CallLog.status is the source of truth.
const ringTimeouts = new Map();

const clearRingTimeout = (callId) => {
  const handle = ringTimeouts.get(String(callId));
  if (handle) {
    clearTimeout(handle);
    ringTimeouts.delete(String(callId));
  }
};

// Sends the "your phone should ring" push to both platforms. This does not
// touch the in-app Notification list — ringing is ephemeral, not a feed item.
const notifyIncomingCall = async (receiver, call, caller) => {
  const payload = {
    callId: String(call._id),
    callerId: String(caller._id),
    callerName: caller.full_name || caller.username,
    callerAvatar: caller.avatar_url || '',
    callType: call.call_type,
  };

  // Android — high-priority FCM data message so flutter_callkit_incoming can
  // show the full-screen incoming-call UI even if the app is backgrounded
  // or killed. Adjust the `data` keys to match whatever flutter_callkit_incoming
  // is actually wired to read once the Flutter side is built.
  if (admin && receiver.fcm_token) {
    try {
      await admin.messaging().send({
        token: receiver.fcm_token,
        android: { priority: 'high' },
        data: {
          type: 'incoming_call',
          ...payload,
        },
      });
    } catch (err) {
      console.error('[Call] Android call push failed:', err.message);
    }
  }

  // iOS — PushKit VoIP push. No-ops until APNS_* env vars + the `apn`
  // package are set up; see src/utils/sendVoipPush.js.
  if (receiver.voip_token) {
    sendVoipPush(receiver.voip_token, { type: 'incoming_call', ...payload }).catch(() => {});
  }
};

const emitToUserSockets = (io, onlineUsers, userId, event, payload) => {
  const socketIds = onlineUsers.get(String(userId));
  if (!socketIds) return;
  for (const socketId of socketIds) io.to(socketId).emit(event, payload);
};

const registerCallHandlers = (io, socket, { onlineUsers, app }) => {
  // ── call:initiate ────────────────────────────────────────────────────────
  // Client sends: { receiverId, callType: 'voice' | 'video' }
  socket.on('call:initiate', async ({ receiverId, callType }, ack) => {
    const respond = (data) => { if (typeof ack === 'function') ack(data); };
    try {
      const callerId = socket.userId;
      if (!callerId) return respond({ error: 'Not registered' });
      if (!mongoose.Types.ObjectId.isValid(receiverId)) return respond({ error: 'Invalid receiverId' });
      if (!['voice', 'video'].includes(callType)) return respond({ error: 'callType must be voice or video' });
      if (String(receiverId) === String(callerId)) return respond({ error: 'Cannot call yourself' });

      const allowed = await canCall(callerId, receiverId);
      if (!allowed) return respond({ error: 'You and this user must follow each other to call' });

      // Busy check — either party already in a pending/answered call.
      const existing = await CallLog.findOne({
        status: { $in: ['pending', 'answered'] },
        $or: [{ caller_id: callerId }, { receiver_id: callerId }, { caller_id: receiverId }, { receiver_id: receiverId }],
      }).lean();
      if (existing) {
        const call = await CallLog.create({ caller_id: callerId, receiver_id: receiverId, call_type: callType, status: 'busy', end_reason: 'line_busy' });
        return respond({ callId: call._id, status: 'busy' });
      }

      const [caller, receiver] = await Promise.all([
        User.findById(callerId).select('full_name username avatar_url'),
        User.findById(receiverId).select('full_name username avatar_url fcm_token voip_token'),
      ]);
      if (!receiver) return respond({ error: 'User not found' });

      // No Cloudflare session is created here — each side creates its own
      // session lazily once the call is answered and WebRTC negotiation
      // actually begins (see POST /api/calls/:id/webrtc/publish). Avoids
      // spinning up media sessions for calls that are never answered.
      const call = await CallLog.create({
        caller_id: callerId,
        receiver_id: receiverId,
        call_type: callType,
        status: 'pending',
      });

      emitToUserSockets(io, onlineUsers, receiverId, 'call:ringing', {
        callId: call._id,
        callerId,
        callerName: caller?.full_name || caller?.username,
        callerAvatar: caller?.avatar_url || '',
        callType,
      });
      notifyIncomingCall(receiver, call, caller).catch(() => {});

      const handle = setTimeout(() => handleMissed(io, onlineUsers, app, call._id).catch(() => {}), RING_TIMEOUT_MS);
      ringTimeouts.set(String(call._id), handle);

      return respond({ callId: call._id, status: 'pending' });
    } catch (err) {
      console.error('[Call] initiate error:', err.message);
      return respond({ error: 'Server error' });
    }
  });

  // ── call:accept ──────────────────────────────────────────────────────────
  socket.on('call:accept', async ({ callId }, ack) => {
    const respond = (data) => { if (typeof ack === 'function') ack(data); };
    try {
      const call = await CallLog.findById(callId);
      if (!call || call.status !== 'pending') return respond({ error: 'Call is no longer pending' });
      if (String(call.receiver_id) !== String(socket.userId)) return respond({ error: 'Not your call to accept' });

      clearRingTimeout(callId);
      call.status = 'answered';
      call.answered_at = new Date();
      await call.save();

      emitToUserSockets(io, onlineUsers, call.caller_id, 'call:accepted', { callId });
      return respond({ callId, status: 'answered' });
    } catch (err) {
      console.error('[Call] accept error:', err.message);
      return respond({ error: 'Server error' });
    }
  });

  // ── call:reject ───────────────────────────────────────────────────────────
  socket.on('call:reject', async ({ callId, reason }) => {
    try {
      const call = await CallLog.findById(callId);
      if (!call || call.status !== 'pending') return;
      if (String(call.receiver_id) !== String(socket.userId)) return;

      clearRingTimeout(callId);
      call.status = 'rejected';
      call.ended_at = new Date();
      call.end_reason = reason || 'declined';
      await call.save();

      emitToUserSockets(io, onlineUsers, call.caller_id, 'call:rejected', { callId });
    } catch (err) {
      console.error('[Call] reject error:', err.message);
    }
  });

  // ── call:track-published ─────────────────────────────────────────────────
  // Sent after a client's POST /api/calls/:id/webrtc/publish succeeds. Once
  // BOTH sides have published (CallLog has both session/track pairs set),
  // tells both clients it's safe to pull the other's track.
  socket.on('call:track-published', async ({ callId }) => {
    try {
      const call = await CallLog.findById(callId);
      if (!call || call.status !== 'answered') return;
      const isParty = [String(call.caller_id), String(call.receiver_id)].includes(String(socket.userId));
      if (!isParty) return;

      if (call.caller_session_id && call.caller_track_name && call.receiver_session_id && call.receiver_track_name) {
        emitToUserSockets(io, onlineUsers, call.caller_id, 'call:peer-ready', { callId });
        emitToUserSockets(io, onlineUsers, call.receiver_id, 'call:peer-ready', { callId });
      }
    } catch (err) {
      console.error('[Call] track-published error:', err.message);
    }
  });

  // ── call:end ─────────────────────────────────────────────────────────────
  // Used both for "hang up before pickup" (→ missed) and "hang up a live call" (→ ended).
  socket.on('call:end', async ({ callId, reason }) => {
    try {
      const call = await CallLog.findById(callId);
      if (!call) return;
      const isParty = [String(call.caller_id), String(call.receiver_id)].includes(String(socket.userId));
      if (!isParty || !['pending', 'answered'].includes(call.status)) return;

      clearRingTimeout(callId);
      const wasAnswered = call.status === 'answered';
      call.status = wasAnswered ? 'ended' : 'missed';
      call.ended_at = new Date();
      call.end_reason = reason || (wasAnswered ? 'hangup' : 'caller_cancelled');
      if (wasAnswered && call.answered_at) {
        call.duration_seconds = Math.max(0, Math.round((call.ended_at - call.answered_at) / 1000));
      }
      await call.save();

      if (call.caller_session_id) closeSession(call.caller_session_id, call.caller_track_name).catch(() => {});
      if (call.receiver_session_id) closeSession(call.receiver_session_id, call.receiver_track_name).catch(() => {});

      const otherParty = String(socket.userId) === String(call.caller_id) ? call.receiver_id : call.caller_id;
      emitToUserSockets(io, onlineUsers, otherParty, 'call:ended', {
        callId,
        status: call.status,
        duration_seconds: call.duration_seconds,
        end_reason: call.end_reason,
      });

      if (!wasAnswered) await notifyMissedCall(app, call);
    } catch (err) {
      console.error('[Call] end error:', err.message);
    }
  });
};

// Ring timed out with no answer/reject/cancel.
const handleMissed = async (io, onlineUsers, app, callId) => {
  const call = await CallLog.findById(callId);
  if (!call || call.status !== 'pending') return;

  call.status = 'missed';
  call.ended_at = new Date();
  call.end_reason = 'timeout';
  await call.save();

  // No Cloudflare sessions exist yet at this point — they're only created
  // once a call is answered and a side actually publishes a track.

  emitToUserSockets(io, onlineUsers, call.caller_id, 'call:missed', { callId });
  emitToUserSockets(io, onlineUsers, call.receiver_id, 'call:missed', { callId });

  await notifyMissedCall(app, call);
};

const notifyMissedCall = async (app, call) => {
  try {
    await sendNotification(app, {
      recipient: call.receiver_id,
      sender: call.caller_id,
      type: 'call_missed',
      message: `You missed a ${call.call_type} call.`,
      link: '/calls',
    });
  } catch (err) {
    console.error('[Call] missed-call notification failed:', err.message);
  }
};

module.exports = { registerCallHandlers };
