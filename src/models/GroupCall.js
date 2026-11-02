const mongoose = require('mongoose');

// Mirrors CallLog's per-side track bookkeeping (see that model) — one entry
// per media kind this participant has actually published to their own
// Cloudflare Realtime session.
const trackEntrySchema = new mongoose.Schema({
  mid:  { type: String, required: true },
  name: { type: String, enum: ['audio', 'video'], required: true },
}, { _id: false });

const participantSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // invited  — rung, no response yet
  // joined   — currently in the call
  // declined — explicitly rejected
  // missed   — timed out without responding
  // left     — was joined, then left/was removed
  status: {
    type: String,
    enum: ['invited', 'joined', 'declined', 'missed', 'left'],
    default: 'invited',
  },

  // This participant's own Cloudflare Realtime session — same one-session-
  // per-participant model as the 1:1 call (see CallLog).
  session_id: { type: String, default: null },
  tracks: { type: [trackEntrySchema], default: [] },

  joined_at: { type: Date, default: null },
  left_at: { type: Date, default: null },
}, { _id: false });

const groupCallSchema = new mongoose.Schema({
  // null for a call escalated from a 1:1 CallLog — it isn't tied to any
  // group chat, just the two original parties plus whoever got added.
  conversation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null, index: true },
  initiator_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  call_type: { type: String, enum: ['voice', 'video'], required: true },

  // The initiator is seeded into `participants` as already-joined at
  // creation time, so the call is live ('active') from the moment it's
  // created — there is no separate 'ringing' top-level state the way a 1:1
  // CallLog has 'pending'; ringing is tracked per-participant instead.
  status: { type: String, enum: ['active', 'ended'], default: 'active', index: true },

  participants: { type: [participantSchema], default: [] },

  started_at: { type: Date, default: Date.now },
  ended_at: { type: Date, default: null },
}, { timestamps: true });

groupCallSchema.index({ conversation_id: 1, createdAt: -1 });
groupCallSchema.index({ 'participants.user_id': 1, createdAt: -1 });

module.exports = mongoose.model('GroupCall', groupCallSchema);
