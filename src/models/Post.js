const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ["image", "video"],
    default: "image"
  },
  crop: {
    mode: {
      type: String,
      enum: ["original", "1:1", "4:5", "16:9"],
      default: "original"
    },
    zoom: {
      type: Number,
      default: 1
    },
    x: {
      type: Number,
      default: 0
    },
    y: {
      type: Number,
      default: 0
    }
  },
  filter: {
    name: {
      type: String,
      default: 'Original'
    },
    css: {
      type: String,
      default: ''
    }
  },
  adjustments: {
    brightness: { type: Number, default: 0 },
    contrast: { type: Number, default: 0 },
    saturation: { type: Number, default: 0 },
    temperature: { type: Number, default: 0 },
    fade: { type: Number, default: 0 },
    vignette: { type: Number, default: 0 }
  }
}, { _id: false });

const postSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  caption: {
    type: String,
    default: ''
  },
  location: {
    type: String,
    default: ''
  },
  media: {
    type: [mediaSchema],
    default: [],
    validate: [arrayLimit, '{PATH} must have at least 1 media item']
  },
  tags: {
    type: Array,
    default: []
  },
  people_tags: {
    type: [{
      user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      username: String,
      x: Number,  // relative x position 0..1
      y: Number   // relative y position 0..1
    }],
    default: []
  },
  hide_likes_count: {
    type: Boolean,
    default: false
  },
  turn_off_commenting: {
    type: Boolean,
    default: false
  },
  likes_count: {
    type: Number,
    default: 0
  },
  comments_count: {
    type: Number,
    default: 0
  },
  latest_comments: {
    type: [{
      _id: mongoose.Schema.Types.ObjectId,
      text: String,
      user: {
        id: mongoose.Schema.Types.ObjectId,
        username: String,
        avatar_url: String
      },
      createdAt: Date,
      replies: {
        type: [{
          _id: mongoose.Schema.Types.ObjectId,
          text: String,
          user: {
            id: mongoose.Schema.Types.ObjectId,
            username: String,
            avatar_url: String
          },
          createdAt: Date
        }],
        default: []
      }
    }],
    default: []
  },
  likes: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    default: []
  },
  type: {
    type: String,
    enum: ['post', 'reel', 'promote', 'advertise'],
    default: 'post'
  }
}, {
  timestamps: true
});

function arrayLimit(val) {
  return val && val.length > 0;
}

module.exports = mongoose.model('Post', postSchema);
