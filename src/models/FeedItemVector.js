const mongoose = require('mongoose');

// Written by the Python AI service (ai-service/): one document per indexed
// post, reel, tweet, ad or promote reel. The Node API only reads the
// auto-detected interest `topics`; the embedding itself is stored as binary
// and used by the AI service.

const feedItemVectorSchema = new mongoose.Schema({
  item_id: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  item_type: { type: String },
  author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date },
  topics: { type: [String], default: [] },
  tags: [{ _id: false, label: String, score: Number }],
  model: { type: String },
  indexed_at: { type: Date },
}, { collection: 'feeditemvectors', strict: false });

module.exports = mongoose.model('FeedItemVector', feedItemVectorSchema);
