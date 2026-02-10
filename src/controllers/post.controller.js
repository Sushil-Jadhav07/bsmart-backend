const Post = require('../models/Post');
const User = require('../models/User');
const Comment = require('../models/Comment');

// Helper to transform post with fileUrl and is_liked_by_me
const transformPost = (post, baseUrl, currentUserId = null) => {
  const postObj = post.toObject ? post.toObject() : post;
  
  if (postObj.media && Array.isArray(postObj.media)) {
    postObj.media = postObj.media.map(item => ({
      ...item,
      fileUrl: `${baseUrl}/uploads/${item.fileName}`
    }));
  }

  if (currentUserId && postObj.likes) {
    postObj.is_liked_by_me = postObj.likes.some(id => id.toString() === currentUserId.toString());
  } else {
    postObj.is_liked_by_me = false;
  }
  
  return postObj;
};

// @desc    Create a new post
// @route   POST /api/posts
// @access  Private
exports.createPost = async (req, res) => {
  try {
    const { caption, location, media, tags, people_tags, hide_likes_count, turn_off_commenting, type } = req.body;

    // Validate media
    if (!media || media.length === 0) {
      return res.status(400).json({ message: 'At least one media item is required' });
    }

    const validCropModes = ["original", "1:1", "4:5", "16:9"];

    for (const item of media) {
      if (!item.fileName) {
        return res.status(400).json({ message: 'Each media item must have a fileName' });
      }
      if (item.crop && item.crop.mode && !validCropModes.includes(item.crop.mode)) {
        return res.status(400).json({ message: `Invalid crop mode: ${item.crop.mode}` });
      }
    }

    const post = await Post.create({
      user_id: req.userId,
      caption,
      location,
      media,
      tags,
      people_tags,
      hide_likes_count,
      turn_off_commenting,
      type
    });

    // Increment user posts_count
    await User.findByIdAndUpdate(req.userId, { $inc: { posts_count: 1 } });

    // Populate user info immediately for the response
    const populatedPost = await post.populate('user_id', 'username full_name avatar_url');

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(201).json(transformPost(populatedPost, baseUrl));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get posts feed
// @route   GET /api/posts/feed
// @access  Private
exports.getFeed = async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate('user_id', 'username full_name avatar_url');

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const transformedPosts = posts.map(post => transformPost(post, baseUrl));

    res.json(transformedPosts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get single post
// @route   GET /api/posts/:id
// @access  Private
exports.getPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('user_id', 'username full_name avatar_url');

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Fetch comments for the post
    const comments = await Comment.find({ post_id: req.params.id })
      .sort({ createdAt: -1 });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const transformedPost = transformPost(post, baseUrl, req.userId);
    
    // Attach comments
    transformedPost.comments = comments;

    res.json(transformedPost);
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete post
// @route   DELETE /api/posts/:id
// @access  Private
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check ownership
    if (post.user_id.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized to delete this post' });
    }

    await post.deleteOne();

    // Decrement user posts_count
    await User.findByIdAndUpdate(req.userId, { $inc: { posts_count: -1 } });

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
