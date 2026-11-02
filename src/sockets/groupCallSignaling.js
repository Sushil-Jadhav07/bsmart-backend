// Group voice/video call signaling — parallels src/sockets/callSignaling.js
// (1:1 calls) exactly: roster changes ride this Socket.io connection, actual
// WebRTC media negotiation is REST (see src/controllers/groupCall.controller.js).
// A group call always rings every member of the Conversation it's started
// from; anyone pressing "call" while one is already active just joins it.

const mongoose = require('mongoose');
const GroupCall = require('../models/GroupCall');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const sendNotification = require('../utils/sendNotification');
const { closeSession } = require('../services/cloudflareRealtime.service');
const { sendVoipPush } = require('../utils/sendVoipPush');
const admin = require('../lib/firebase');

const RING_TIMEOUT_MS = 45 * 1000; // matches the 1:1 call's ring timeout
const MAX_GROUP_CALL_PARTICIPANTS = 12; // caps concurrent JOINED participants, not invite size

// `${groupCallId}:${userId}` -> timeout handle, mirrors callSignaling.js's
// ringTimeouts map but keyed per invited participant (each has their own
// 45s clock, independent of the others).
const ringTimeouts = new Map();
const timeoutKey = (groupCallId, userId) => `${groupCallId}:${userId}`;
const clearRingTimeout = (groupCallId, userId) => {
  const key = timeoutKey(groupCallId, userId);
  const handle = ringTimeouts.get(key);
  if (handle) {
    clearTimeout(handle);
    ringTimeouts.delete(key);
  }
};

const emitToUserSockets = (io, onlineUsers, userId, event, payload) => {
  const socketIds = onlineUsers.get(String(userId));
  if (!socketIds) return;
  for (const socketId of socketIds) io.to(socketId).emit(event, payload);
};

const userLabel = (user) => user?.full_name || user?.username || 'Someone';

const notifyIncomingGroupCall = async (invitee, groupCall, initiator, conversationTitle, conversationAvatar) => {
  const payload = {
    groupCallId: String(groupCall._id),
    conversationId: groupCall.conversation_id ? String(groupCall.conversation_id) : null,
    conversationTitle: conversationTitle || '',
    conversationAvatar: conversationAvatar || '',
    initiatorId: String(initiator._id),
    initiatorName: userLabel(initiator),
    initiatorAvatar: initiator.avatar_url || '',
    callType: groupCall.call_type,
  };

  if (admin && invitee.fcm_token) {
    try {
      await admin.messaging().send({
        token: invitee.fcm_token,
        android: { priority: 'high' },
        data: { type: 'incoming_group_call', ...payload },
      });
    } catch (err) {
      console.error('[GroupCall] Android call push failed:', err.message);
    }
  }
  if (invitee.voip_token) {
    sendVoipPush(invitee.voip_token, { type: 'incoming_group_call', ...payload }).catch(() => {});
  }
};

const notifyMissedGroupCall = async (app, groupCall, conversationTitle, missedUserId) => {
  try {
    await sendNotification(app, {
      recipient: missedUserId,
      sender: groupCall.initiator_id,
      type: 'call_missed',
      message: conversationTitle
        ? `You missed a group ${groupCall.call_type} call in ${conversationTitle}.`
        : `You missed a group ${groupCall.call_type} call.`,
      link: '/messages',
    });
  } catch (err) {
    console.error('[GroupCall] missed-call notification failed:', err.message);
  }
};

// Builds the roster the ack/response hands back to a (re)joining
// participant — every OTHER currently-joined participant who has actually
// published already, so the joiner only tries to pull from peers who can
// answer. A joined-but-not-yet-published peer is picked up later via the
// normal group-call:peer-ready broadcast once they do publish — same as
// any other late publisher.
const buildRoster = (groupCall, excludeUserId) => (
  groupCall.participants
    .filter((p) => (
      p.status === 'joined'
      && String(p.user_id?._id || p.user_id) !== String(excludeUserId)
      && p.session_id && p.tracks?.length
    ))
    .map((p) => ({
      userId: String(p.user_id?._id || p.user_id),
      name: userLabel(p.user_id),
      avatar: p.user_id?.avatar_url || '',
      sessionId: p.session_id,
      tracks: p.tracks,
    }))
);

// Rings a batch of newly-invited participants for a group call — shared by
// group-call:initiate (fresh call), group-call:invite (adding people to an
// already-active call), and callSignaling.js's 1:1-to-group escalation.
const ringInvitees = (io, onlineUsers, app, groupCall, initiator, conversationTitle, conversationAvatar, inviteeUsers) => {
  for (const invitee of inviteeUsers) {
    emitToUserSockets(io, onlineUsers, invitee._id, 'group-call:ringing', {
      groupCallId: groupCall._id,
      conversationId: groupCall.conversation_id || null,
      conversationTitle: conversationTitle || '',
      conversationAvatar: conversationAvatar || '',
      initiatorId: initiator._id,
      initiatorName: userLabel(initiator),
      initiatorAvatar: initiator?.avatar_url || '',
      callType: groupCall.call_type,
    });
    notifyIncomingGroupCall(invitee, groupCall, initiator, conversationTitle, conversationAvatar).catch(() => {});

    const handle = setTimeout(
      () => handleGroupCallMissed(io, onlineUsers, app, groupCall._id, invitee._id).catch(() => {}),
      RING_TIMEOUT_MS,
    );
    ringTimeouts.set(timeoutKey(groupCall._id, invitee._id), handle);
  }
};

const registerGroupCallHandlers = (io, socket, { onlineUsers, app }) => {
  // ── group-call:initiate ────────────────────────────────────────────────
  // Client sends: { conversationId, callType: 'voice' | 'video' }
  socket.on('group-call:initiate', async ({ conversationId, callType }, ack) => {
    const respond = (data) => { if (typeof ack === 'function') ack(data); };
    try {
      const userId = socket.userId;
      if (!userId) return respond({ error: 'Not registered' });
      if (!mongoose.Types.ObjectId.isValid(conversationId)) return respond({ error: 'Invalid conversationId' });
      if (!['voice', 'video'].includes(callType)) return respond({ error: 'callType must be voice or video' });

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return respond({ error: 'Conversation not found' });
      const isMember = conversation.participants.some((p) => String(p) === String(userId));
      if (!isMember) return respond({ error: 'You are not a member of this group' });

      // An active call already exists for this conversation — join it
      // instead of starting a duplicate.
      const existing = await GroupCall.findOne({ conversation_id: conversationId, status: 'active' })
        .populate('participants.user_id', 'username full_name avatar_url');
      if (existing) {
        const result = await joinCall(io, onlineUsers, existing, conversationId, userId);
        // joinCall doesn't load the conversation — fill these in here since
        // the initiator (joining someone else's already-active call via the
        // same "call" button) needs them for its own overlay header.
        if (!result.error) {
          result.conversationTitle = conversation.groupName || '';
          result.conversationAvatar = conversation.groupAvatar || '';
        }
        return respond(result);
      }

      const initiator = await User.findById(userId).select('full_name username avatar_url');
      const now = new Date();
      const groupCall = await GroupCall.create({
        conversation_id: conversationId,
        initiator_id: userId,
        call_type: callType,
        status: 'active',
        participants: conversation.participants.map((pid) => (
          String(pid) === String(userId)
            ? { user_id: pid, status: 'joined', joined_at: now }
            : { user_id: pid, status: 'invited' }
        )),
      });

      const invitees = conversation.participants.filter((pid) => String(pid) !== String(userId));
      const inviteeUsers = await User.find({ _id: { $in: invitees } }).select('full_name username avatar_url fcm_token voip_token');
      ringInvitees(io, onlineUsers, app, groupCall, initiator, conversation.groupName, conversation.groupAvatar, inviteeUsers);

      return respond({
        groupCallId: groupCall._id,
        status: 'active',
        callType,
        conversationTitle: conversation.groupName || '',
        conversationAvatar: conversation.groupAvatar || '',
        roster: [],
      });
    } catch (err) {
      console.error('[GroupCall] initiate error:', err.message);
      return respond({ error: 'Server error' });
    }
  });

  // ── group-call:join ──────────────────────────────────────────────────────
  socket.on('group-call:join', async ({ groupCallId }, ack) => {
    const respond = (data) => { if (typeof ack === 'function') ack(data); };
    try {
      const userId = socket.userId;
      if (!userId) return respond({ error: 'Not registered' });

      const groupCall = await GroupCall.findById(groupCallId)
        .populate('participants.user_id', 'username full_name avatar_url');
      if (!groupCall) return respond({ error: 'Call not found' });

      const result = await joinCall(io, onlineUsers, groupCall, groupCall.conversation_id, userId);
      return respond(result);
    } catch (err) {
      console.error('[GroupCall] join error:', err.message);
      return respond({ error: 'Server error' });
    }
  });

  // ── group-call:decline ───────────────────────────────────────────────────
  socket.on('group-call:decline', async ({ groupCallId }) => {
    try {
      const userId = socket.userId;
      if (!userId) return;
      const groupCall = await GroupCall.findById(groupCallId);
      if (!groupCall || groupCall.status !== 'active') return;

      clearRingTimeout(groupCallId, userId);
      // Atomic update filtered on current status — avoids both the
      // array-save version-conflict race (see publishTrack) and a logical
      // race against the ring-timeout firing at the same moment.
      await GroupCall.updateOne(
        { _id: groupCallId, 'participants.user_id': userId, 'participants.status': 'invited' },
        { $set: { 'participants.$.status': 'declined' } },
      );
    } catch (err) {
      console.error('[GroupCall] decline error:', err.message);
    }
  });

  // ── group-call:leave ─────────────────────────────────────────────────────
  // Used both for "hang up before joining" and "leave a live call".
  socket.on('group-call:leave', async ({ groupCallId, reason }) => {
    try {
      const userId = socket.userId;
      if (!userId) return;
      const groupCall = await GroupCall.findById(groupCallId);
      if (!groupCall) return;

      clearRingTimeout(groupCallId, userId);
      const entry = groupCall.participants.find((p) => String(p.user_id) === String(userId));
      if (!entry) return;

      const wasJoined = entry.status === 'joined';
      const stillJoinedAfter = groupCall.participants.some((p) => (
        String(p.user_id) !== String(userId) && p.status === 'joined'
      ));

      // Atomic update — see publishTrack for why load-mutate-save on this
      // array field is unsafe under concurrent writes. $set can target both
      // the leaving participant's own entry (positional) and the
      // top-level status/ended_at in the same call.
      const setFields = { 'participants.$.status': 'left', 'participants.$.left_at': new Date() };
      if (wasJoined && !stillJoinedAfter) {
        setFields.status = 'ended';
        setFields.ended_at = new Date();
      }
      await GroupCall.updateOne({ _id: groupCallId, 'participants.user_id': userId }, { $set: setFields });

      if (wasJoined && entry.session_id) closeSession(entry.session_id, entry.tracks).catch(() => {});

      if (wasJoined) {
        for (const p of groupCall.participants) {
          if (p.status === 'joined' && String(p.user_id) !== String(userId)) {
            emitToUserSockets(io, onlineUsers, p.user_id, 'group-call:participant-left', { groupCallId, userId });
          }
        }
      }
    } catch (err) {
      console.error('[GroupCall] leave error:', err.message);
    }
  });

  // ── group-call:track-published ───────────────────────────────────────────
  // Sent after a client's POST /api/group-calls/:id/webrtc/publish succeeds
  // — tells every other currently-joined participant to pull from them.
  socket.on('group-call:track-published', async ({ groupCallId }) => {
    try {
      const userId = socket.userId;
      if (!userId) return;
      const groupCall = await GroupCall.findById(groupCallId);
      if (!groupCall || groupCall.status !== 'active') return;
      const self = groupCall.participants.find((p) => String(p.user_id) === String(userId));
      if (!self || self.status !== 'joined') return;

      for (const p of groupCall.participants) {
        if (p.status === 'joined' && String(p.user_id) !== String(userId)) {
          emitToUserSockets(io, onlineUsers, p.user_id, 'group-call:peer-ready', { groupCallId, fromUserId: userId });
        }
      }
    } catch (err) {
      console.error('[GroupCall] track-published error:', err.message);
    }
  });

  // ── group-call:invite ────────────────────────────────────────────────────
  // Adds new people to an already-active call. Client sends: { groupCallId, userIds }
  socket.on('group-call:invite', async ({ groupCallId, userIds }, ack) => {
    const respond = (data) => { if (typeof ack === 'function') ack(data); };
    try {
      const userId = socket.userId;
      if (!userId) return respond({ error: 'Not registered' });
      if (!Array.isArray(userIds) || !userIds.length) return respond({ error: 'userIds is required' });

      const groupCall = await GroupCall.findById(groupCallId);
      if (!groupCall || groupCall.status !== 'active') return respond({ error: 'Call not found' });
      const self = groupCall.participants.find((p) => String(p.user_id) === String(userId));
      if (!self || self.status !== 'joined') return respond({ error: 'You are not in this call' });

      const existingIds = new Set(groupCall.participants.map((p) => String(p.user_id)));
      const newIds = [...new Set(userIds.map(String))].filter((id) => !existingIds.has(id));
      if (!newIds.length) return respond({ success: true });

      // Atomic $push — see publishTrack for why load-mutate-save on this
      // array field is unsafe under concurrent writes (e.g. two people
      // inviting different new participants at the same moment).
      await GroupCall.updateOne(
        { _id: groupCallId },
        { $push: { participants: { $each: newIds.map((id) => ({ user_id: id, status: 'invited' })) } } },
      );

      const [initiator, inviteeUsers, conversation] = await Promise.all([
        User.findById(userId).select('full_name username avatar_url'),
        User.find({ _id: { $in: newIds } }).select('full_name username avatar_url fcm_token voip_token'),
        groupCall.conversation_id ? Conversation.findById(groupCall.conversation_id).select('groupName groupAvatar') : null,
      ]);

      ringInvitees(io, onlineUsers, app, groupCall, initiator, conversation?.groupName, conversation?.groupAvatar, inviteeUsers);

      return respond({ success: true });
    } catch (err) {
      console.error('[GroupCall] invite error:', err.message);
      return respond({ error: 'Server error' });
    }
  });
};

// Shared by both group-call:initiate (when an active call already exists)
// and group-call:join — flips the requester's participant entry to
// 'joined' and returns the roster they should start pulling from.
const joinCall = async (io, onlineUsers, groupCall, conversationId, userId) => {
  if (groupCall.status !== 'active') return { error: 'Call has ended' };

  const entry = groupCall.participants.find((p) => String(p.user_id?._id || p.user_id) === String(userId));
  if (!entry) return { error: 'You are not a member of this group' };

  const joinedCount = groupCall.participants.filter((p) => p.status === 'joined').length;
  if (entry.status !== 'joined' && joinedCount >= MAX_GROUP_CALL_PARTICIPANTS) {
    return { error: 'This call is full' };
  }

  clearRingTimeout(groupCall._id, userId);
  const alreadyJoined = entry.status === 'joined';
  if (!alreadyJoined) {
    // Atomic update — see publishTrack for why load-mutate-save on this
    // array field is unsafe under concurrent joins. Keep the in-memory
    // copy in sync too, since buildRoster() below reads it.
    await GroupCall.updateOne(
      { _id: groupCall._id, 'participants.user_id': userId },
      { $set: { 'participants.$.status': 'joined', 'participants.$.joined_at': new Date() } },
    );
    entry.status = 'joined';
    entry.joined_at = new Date();
  }

  const roster = buildRoster(groupCall, userId);

  if (!alreadyJoined) {
    for (const p of groupCall.participants) {
      if (p.status === 'joined' && String(p.user_id?._id || p.user_id) !== String(userId)) {
        emitToUserSockets(io, onlineUsers, p.user_id?._id || p.user_id, 'group-call:participant-joined', {
          groupCallId: groupCall._id,
          userId,
          name: userLabel(entry.user_id),
          avatar: entry.user_id?.avatar_url || '',
        });
      }
    }
  }

  return {
    groupCallId: groupCall._id,
    conversationId,
    status: 'joined',
    callType: groupCall.call_type,
    roster,
  };
};

// Ring timed out with no answer/decline for this one invitee — doesn't
// affect the call for anyone else already in it.
const handleGroupCallMissed = async (io, onlineUsers, app, groupCallId, userId) => {
  const groupCall = await GroupCall.findById(groupCallId);
  if (!groupCall || groupCall.status !== 'active') return;

  // Atomic, filtered on still-invited — if this participant already
  // joined/declined in the meantime (racing this timeout), the filter
  // won't match and nothing happens.
  const result = await GroupCall.updateOne(
    { _id: groupCallId, 'participants.user_id': userId, 'participants.status': 'invited' },
    { $set: { 'participants.$.status': 'missed' } },
  );
  if (result.matchedCount === 0) return;

  emitToUserSockets(io, onlineUsers, userId, 'group-call:missed', { groupCallId });

  const conversation = groupCall.conversation_id
    ? await Conversation.findById(groupCall.conversation_id).select('groupName')
    : null;
  await notifyMissedGroupCall(app, groupCall, conversation?.groupName, userId);
};

module.exports = { registerGroupCallHandlers, ringInvitees };
