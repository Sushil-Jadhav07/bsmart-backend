const mongoose = require('mongoose');

// One entry per media kind actually published to that side's Cloudflare
// session — a voice call ends up with just an 'audio' entry, a video call
// with both 'audio' and 'video'. `mid` is the m-line id Cloudflare needs to
// close that specific track when the call ends.
const trackEntrySchema = new mongoose.Schema({
  mid:  { type: String, required: true },
  name: { type: String, enum: ['audio', 'video'], required: true },
}, { _id: false });

const callLogSchema = new mongoose.Schema({
  caller_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  call_type: { type: String, enum: ['voice', 'video'], required: true },

  // pending   — ringing, no answer yet
  // answered  — receiver accepted, call connected
  // missed    — timed out or caller cancelled before pickup
  // rejected  — receiver explicitly declined
  // busy      — receiver already on another call
  // ended     — a connected call was hung up by either side
  status: {
    type: String,
    enum: ['pending', 'answered', 'missed', 'rejected', 'busy', 'ended'],
    default: 'pending',
    index: true,
  },

  // Cloudflare Realtime SFU session — each participant gets their OWN
  // session and pushes their local track(s) to it (one for voice, two —
  // audio+video — for a video call); the other side pulls them by
  // referencing this session_id + the track names in caller_tracks/
  // receiver_tracks. Set once that participant's browser has actually
  // published (not at ring time — no Cloudflare session is created until
  // the call is answered and WebRTC negotiation begins).
  caller_session_id: { type: String, default: null },
  caller_tracks: { type: [trackEntrySchema], default: [] },
  receiver_session_id: { type: String, default: null },
  receiver_tracks: { type: [trackEntrySchema], default: [] },

  started_at:  { type: Date, default: Date.now }, // when call:initiate was received
  answered_at: { type: Date, default: null },
  ended_at:    { type: Date, default: null },
  duration_seconds: { type: Number, default: 0 }, // 0 until answered+ended

  end_reason: { type: String, default: '' }, // free text, e.g. "timeout", "caller_cancelled", "network_error"
}, { timestamps: true });

callLogSchema.index({ caller_id: 1, createdAt: -1 });
callLogSchema.index({ receiver_id: 1, createdAt: -1 });

module.exports = mongoose.model('CallLog', callLogSchema);
