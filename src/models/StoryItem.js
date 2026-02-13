const mongoose = require('mongoose');

const textSchema = new mongoose.Schema({
  content: { type: String, required: true },
  x: Number,
  y: Number,
  fontSize: { type: Number, required: true },
  fontFamily: { type: String, enum: ['classic','modern','neon','typewriter'] },
  color: String,
  align: { type: String, enum: ['left','center','right'], default: 'center' },
  rotation: Number,
  background: {
    enabled: { type: Boolean, default: false },
    color: String,
    opacity: Number
  }
}, { _id: false });

const storyItemSchema = new mongoose.Schema({
  story_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Story', required: true, index: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  order: { type: Number, required: true },
  media: {
    url: { type: String, required: true },
    type: { type: String, enum: ['image','reel'], required: true },
    thumbnail: String,
    durationSec: Number,
    width: Number,
    height: Number
  },
  transform: {
    x: { type: Number, default: 0.5 },
    y: { type: Number, default: 0.5 },
    scale: { type: Number, default: 1 },
    rotation: { type: Number, default: 0 },
    boxWidth: Number,
    boxHeight: Number
  },
  filter: {
    name: { type: String, default: 'none' },
    intensity: Number
  },
  texts: { type: [textSchema], default: [] },
  mentions: {
    type: [{
      user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      username: { type: String },
      x: { type: Number },
      y: { type: Number }
    }],
    default: []
  },
  expiresAt: { type: Date, required: true, index: true },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

storyItemSchema.index({ story_id: 1, order: 1 });
storyItemSchema.index({ user_id: 1, expiresAt: 1 });

module.exports = mongoose.model('StoryItem', storyItemSchema);
