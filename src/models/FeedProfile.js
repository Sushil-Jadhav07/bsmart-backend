const mongoose = require('mongoose');

// Per-user personalization state for the feed.
//
//  history  → signals rebuilt from scratch out of existing data (likes, saves,
//             reel watches, tweet likes/reposts, own posts). Idempotent, so it
//             can be recomputed daily without double counting.
//  learned  → signals accumulated from FeedEvent batches, decayed over time.
//
// Both have the shape { interests: {term: w}, authors: {userId: w},
// languages: {code: w}, types: {post|reel|tweet: w} }.

const feedProfileSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  // Set by the user (onboarding / settings). Explicit languages override inference.
  preferred_languages: { type: [String], default: [] },
  declared_interests: { type: [String], default: [] },
  history: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  history_built_at: { type: Date, default: null },
  learned: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  learned_updated_at: { type: Date, default: null },
}, { timestamps: true, minimize: false });

module.exports = mongoose.model('FeedProfile', feedProfileSchema);
