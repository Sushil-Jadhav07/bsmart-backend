const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true
  },
  ratio: {
    type: String,
    default: '1/1'
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
  type: {
    type: String,
    default: 'image'
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
