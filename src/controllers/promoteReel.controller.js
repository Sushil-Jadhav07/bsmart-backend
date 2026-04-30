const PromoteReel = require('../models/PromoteReel');
const Comment     = require('../models/Comment');
const User        = require('../models/User');
const sendNotification = require('../utils/sendNotification');
const { canViewAuthorContent, getBlockedPrivateUserIds } = require('../utils/privacyVisibility');

// ─── Helper: transform a promote reel doc into the API response shape ──────
const transformPromoteReel = (doc, baseUrl, currentUserId = null) => {
  const obj = doc.toObject ? doc.toObject() : doc;

  const toAbsolute = (val) => {
    if (!val) return val;
    const s = String(val);
    return s.startsWith('http') ? s : `${baseUrl}${s.startsWith('/') ? '' : '/'}${s}`;
  };

  obj.promote_reel_id = obj._id;
  obj.item_type = 'promote_reel';

  // Resolve media URLs
  if (Array.isArray(obj.media)) {
    obj.media = obj.media.map(item => {
      const fileUrl = item.fileName
        ? `${baseUrl}/uploads/${item.fileName}`
        : toAbsolute(item.fileUrl);

      let thumbnailArray = [];
      if (Array.isArray(item.thumbnails)) {
        thumbnailArray = item.thumbnails.map(t => ({
          ...t,
          fileUrl: t.fileName ? `${baseUrl}/uploads/${t.fileName}` : toAbsolute(t.fileUrl)
        }));
      } else if (item.thumbnail && item.thumbnail.fileName) {
        thumbnailArray = [{
          ...item.thumbnail,
          fileUrl: `${baseUrl}/uploads/${item.thumbnail.fileName}`
        }];
      }

      return {
        ...item,
        type: 'video',
        media_type: 'video',
        fileUrl,
        url: fileUrl,
        thumbnail: thumbnailArray
      };
    });
  }

  obj.is_liked_by_me = currentUserId && Array.isArray(obj.likes)
    ? obj.likes.some(id => id.toString() === currentUserId.toString())
    : false;

  // Normalise comment counts
  const raw = obj.commentsCount ?? obj.comments_count ?? obj.commentCount ?? obj.comment_count ?? 0;
  const count = Number.isFinite(Number(raw)) ? Number(raw) : 0;
  obj.commentsCount  = count;
  obj.comments_count = count;
  obj.commentCount   = count;
  obj.comment_count  = count;

  return obj;
};

// ═══════════════════════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════════════════════

// ─── Create promote reel ───────────────────────────────────────────────────
// POST /api/promote-reels
exports.createPromoteReel = async (req, res) => {
  try {
    const {
      caption, location, media, tags, people_tags,
      hide_likes_count, turn_off_commenting, products
    } = req.body;

    if (!media || media.length === 0) {
      return res.status(400).json({ message: 'At least one media item is required' });
    }

    const validCropModes = ['original', '1:1', '4:5', '16:9'];
    for (const item of media) {
      if (!item.fileName) {
        return res.status(400).json({ message: 'Each media item must have a fileName' });
      }
      if (item.crop && item.crop.mode && !validCropModes.includes(item.crop.mode)) {
        return res.status(400).json({ message: `Invalid crop mode: ${item.crop.mode}` });
      }
    }

    // Normalise media (force type = video, handle aliased keys)
    const normalizedMedia = media.map(m => {
      const nm = { ...m, type: 'video' };
      if (Array.isArray(nm.thumbnail))          { nm.thumbnails = nm.thumbnail; delete nm.thumbnail; }
      if (nm['finalLength-start'] !== undefined) { nm.finalLength_start = nm['finalLength-start']; }
      if (nm['finallength-end'] !== undefined)   { nm.finalLength_end   = nm['finallength-end']; }
      if (nm['thumbail-time'] !== undefined)     { nm.thumbnail_time    = nm['thumbail-time']; }
      if (nm.totalLenght !== undefined)          { nm.totalLength       = nm.totalLenght; }
      return nm;
    });

    const doc = await PromoteReel.create({
      user_id: req.userId,
      caption,
      location,
      media: normalizedMedia,
      tags,
      people_tags,
      hide_likes_count,
      turn_off_commenting,
      products: Array.isArray(products) ? products : []
    });

    const populated = await doc.populate(
      'user_id',
      'username full_name avatar_url followers_count following_count gender location'
    );

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(201).json(transformPromoteReel(populated, baseUrl, req.userId));
  } catch (error) {
    console.error('[PromoteReel] createPromoteReel error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── List promote reels ────────────────────────────────────────────────────
// GET /api/promote-reels?page=1&limit=20
exports.listPromoteReels = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const blockedPrivateUserIds = await getBlockedPrivateUserIds(req.userId);
    const query = { isDeleted: false };
    if (blockedPrivateUserIds.length > 0) {
      query.user_id = { $nin: blockedPrivateUserIds };
    }

    const docs = await PromoteReel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user_id', 'username full_name avatar_url followers_count following_count gender location isPrivate');

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const data    = docs.map(d => transformPromoteReel(d, baseUrl, req.userId));

    res.json({ page, limit, data });
  } catch (error) {
    console.error('[PromoteReel] listPromoteReels error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── Get promote reel by ID ────────────────────────────────────────────────
// GET /api/promote-reels/:id
exports.getPromoteReelById = async (req, res) => {
  try {
    const [doc, commentsRaw] = await Promise.all([
      PromoteReel.findOne({ _id: req.params.id, isDeleted: false })
        .populate('user_id', 'username full_name avatar_url followers_count following_count gender location isPrivate'),
      Comment.find({ post_id: req.params.id }).sort({ createdAt: -1 })
    ]);

    if (!doc) {
      return res.status(404).json({ message: 'Promote reel not found' });
    }

    const authorId = doc?.user_id?._id || doc?.user_id;
    const canView  = await canViewAuthorContent(req.userId, authorId);
    if (!canView) {
      return res.status(403).json({ message: 'This account is private. Follow to view content.' });
    }

    const baseUrl     = `${req.protocol}://${req.get('host')}`;
    const transformed = transformPromoteReel(doc, baseUrl, req.userId);
    transformed.comments = commentsRaw.map(c => {
      const obj = c.toObject ? c.toObject() : c;
      obj.comment_id = obj._id;
      return obj;
    });

    res.json(transformed);
  } catch (error) {
    console.error('[PromoteReel] getPromoteReelById error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Promote reel not found' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── Update promote reel metadata ─────────────────────────────────────────
// PATCH /api/promote-reels/:id
exports.updatePromoteReel = async (req, res) => {
  try {
    const doc = await PromoteReel.findOne({ _id: req.params.id, isDeleted: false });

    if (!doc) {
      return res.status(404).json({ message: 'Promote reel not found' });
    }
    if (doc.user_id.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this promote reel' });
    }

    const allowed = [
      'caption', 'location', 'tags', 'people_tags',
      'hide_likes_count', 'turn_off_commenting', 'products'
    ];
    allowed.forEach(field => {
      if (typeof req.body[field] !== 'undefined') {
        doc[field] = req.body[field];
      }
    });

    await doc.save();

    const populated = await PromoteReel.findById(doc._id)
      .populate('user_id', 'username full_name avatar_url followers_count following_count gender location');

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(transformPromoteReel(populated, baseUrl, req.userId));
  } catch (error) {
    console.error('[PromoteReel] updatePromoteReel error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Promote reel not found' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── Delete promote reel ───────────────────────────────────────────────────
// DELETE /api/promote-reels/:id
exports.deletePromoteReel = async (req, res) => {
  try {
    const doc = await PromoteReel.findOne({ _id: req.params.id, isDeleted: false });

    if (!doc) {
      return res.status(404).json({ message: 'Promote reel not found' });
    }
    if (doc.user_id.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this promote reel' });
    }

    doc.isDeleted = true;
    doc.deletedBy = req.userId;
    doc.deletedAt = new Date();
    await doc.save();

    res.json({ message: 'Promote reel deleted successfully' });
  } catch (error) {
    console.error('[PromoteReel] deletePromoteReel error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Promote reel not found' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// LIKE / UNLIKE
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/promote-reels/:id/like
exports.likePromoteReel = async (req, res) => {
  try {
    const doc = await PromoteReel.findOne({ _id: req.params.id, isDeleted: false });
    if (!doc) return res.status(404).json({ message: 'Promote reel not found' });

    if (doc.likes.includes(req.userId)) {
      return res.status(400).json({ message: 'Already liked' });
    }

    doc.likes.push(req.userId);
    doc.likes_count = doc.likes.length;
    await doc.save();

    // Notify owner
    try {
      if (doc.user_id.toString() !== req.userId.toString()) {
        const liker = await User.findById(req.userId).select('username').lean();
        if (liker) {
          await sendNotification(req.app, {
            recipient: doc.user_id,
            sender:    req.userId,
            type:      'like',
            message:   `${liker.username} liked your promote reel`,
            link:      `/promote-reels/${doc._id}`
          });
        }
      }
    } catch (notifErr) {
      console.error('[PromoteReel] like notification error:', notifErr.message);
    }

    res.json({ liked: true, likes_count: doc.likes_count });
  } catch (error) {
    console.error('[PromoteReel] likePromoteReel error:', error);
    if (error.kind === 'ObjectId') return res.status(404).json({ message: 'Promote reel not found' });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// POST /api/promote-reels/:id/unlike
exports.unlikePromoteReel = async (req, res) => {
  try {
    const doc = await PromoteReel.findOne({ _id: req.params.id, isDeleted: false });
    if (!doc) return res.status(404).json({ message: 'Promote reel not found' });

    if (!doc.likes.includes(req.userId)) {
      return res.status(400).json({ message: 'Not liked yet' });
    }

    doc.likes      = doc.likes.filter(id => id.toString() !== req.userId.toString());
    doc.likes_count = doc.likes.length;
    await doc.save();

    res.json({ liked: false, likes_count: doc.likes_count });
  } catch (error) {
    console.error('[PromoteReel] unlikePromoteReel error:', error);
    if (error.kind === 'ObjectId') return res.status(404).json({ message: 'Promote reel not found' });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /api/promote-reels/:id/likes
exports.getPromoteReelLikes = async (req, res) => {
  try {
    const doc = await PromoteReel.findOne({ _id: req.params.id, isDeleted: false })
      .populate('likes', 'username full_name avatar_url followers_count following_count');

    if (!doc) return res.status(404).json({ message: 'Promote reel not found' });

    res.json({ total: doc.likes_count, users: doc.likes });
  } catch (error) {
    console.error('[PromoteReel] getPromoteReelLikes error:', error);
    if (error.kind === 'ObjectId') return res.status(404).json({ message: 'Promote reel not found' });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// COMMENTS  (reuses the shared Comment model, same as posts/reels)
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/promote-reels/:promoteReelId/comments
exports.addComment = async (req, res) => {
  try {
    const { promoteReelId } = req.params;
    const { text, parent_id } = req.body;

    if (!text) return res.status(400).json({ message: 'Comment text is required' });

    const doc = await PromoteReel.findOne({ _id: promoteReelId, isDeleted: false });
    if (!doc) return res.status(404).json({ message: 'Promote reel not found' });

    let parentCommentId = null;

    if (parent_id) {
      const parentComment = await Comment.findById(parent_id);
      if (!parentComment) return res.status(404).json({ message: 'Parent comment not found' });
      if (parentComment.post_id.toString() !== promoteReelId) {
        return res.status(400).json({ message: 'Parent comment does not belong to this promote reel' });
      }
      if (parentComment.parent_id) {
        return res.status(400).json({ message: 'Nested replies are not allowed' });
      }
      parentCommentId = parent_id;
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const newComment = await Comment.create({
      post_id:   promoteReelId,  // re-uses post_id field
      parent_id: parentCommentId,
      user: {
        id:         user._id,
        username:   user.username,
        avatar_url: user.avatar_url
      },
      text
    });

    // Notify promote reel owner
    try {
      if (!parentCommentId && doc.user_id.toString() !== req.userId.toString()) {
        await sendNotification(req.app, {
          recipient: doc.user_id,
          sender:    req.userId,
          type:      'comment',
          message:   `${user.username} commented on your promote reel`,
          link:      `/promote-reels/${doc._id}`
        });
      }
    } catch (notifErr) {
      console.error('[PromoteReel] comment notification error:', notifErr.message);
    }

    // Update counts and latest_comments on the promote reel
    if (!parentCommentId) {
      await PromoteReel.findByIdAndUpdate(promoteReelId, {
        $inc: { comments_count: 1 },
        $push: {
          latest_comments: {
            $each: [{
              _id:       newComment._id,
              text:      newComment.text,
              user:      newComment.user,
              createdAt: newComment.createdAt,
              replies:   []
            }],
            $sort:  { createdAt: -1 },
            $slice: 2
          }
        }
      });
    } else {
      await PromoteReel.updateOne(
        { _id: promoteReelId, 'latest_comments._id': parentCommentId },
        {
          $push: {
            'latest_comments.$.replies': {
              _id:       newComment._id,
              text:      newComment.text,
              user:      newComment.user,
              createdAt: newComment.createdAt
            }
          }
        }
      );
      await PromoteReel.findByIdAndUpdate(promoteReelId, { $inc: { comments_count: 1 } });
    }

    res.status(201).json(newComment);
  } catch (error) {
    console.error('[PromoteReel] addComment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /api/promote-reels/:promoteReelId/comments
exports.getComments = async (req, res) => {
  try {
    const { promoteReelId } = req.params;

    const commentsRaw = await Comment.find({ post_id: promoteReelId, parent_id: null })
      .sort({ createdAt: -1 });

    const comments = commentsRaw.map(c => {
      const obj = c.toObject ? c.toObject() : c;
      obj.comment_id = obj._id;
      return obj;
    });

    res.json(comments);
  } catch (error) {
    console.error('[PromoteReel] getComments error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /api/promote-reels/comments/:commentId/replies
exports.getReplies = async (req, res) => {
  try {
    const { commentId } = req.params;

    const repliesRaw = await Comment.find({ parent_id: commentId }).sort({ createdAt: 1 });
    const replies = repliesRaw.map(r => {
      const obj = r.toObject ? r.toObject() : r;
      obj.comment_id = obj._id;
      return obj;
    });

    res.json(replies);
  } catch (error) {
    console.error('[PromoteReel] getReplies error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// DELETE /api/promote-reels/comments/:id
exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;

    const comment = await Comment.findById(id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const doc = await PromoteReel.findById(comment.post_id);

    const isCommentAuthor = comment.user.id.toString() === req.userId.toString();
    const isReelAuthor    = doc && doc.user_id.toString() === req.userId.toString();

    if (!isCommentAuthor && !isReelAuthor) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    await comment.deleteOne();

    if (doc) {
      await PromoteReel.findByIdAndUpdate(comment.post_id, { $inc: { comments_count: -1 } });
    }

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('[PromoteReel] deleteComment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// DELETE /api/promote-reels/comments/:commentId/replies/:replyId
exports.deleteReply = async (req, res) => {
  try {
    const { commentId, replyId } = req.params;

    // Verify the parent comment exists
    const parentComment = await Comment.findById(commentId);
    if (!parentComment) return res.status(404).json({ message: 'Parent comment not found' });

    // Find the reply (it is stored as a top-level Comment with parent_id = commentId)
    const reply = await Comment.findOne({ _id: replyId, parent_id: commentId });
    if (!reply) return res.status(404).json({ message: 'Reply not found' });

    const doc = await PromoteReel.findById(reply.post_id);

    const isReplyAuthor = reply.user.id.toString() === req.userId.toString();
    const isReelAuthor  = doc && doc.user_id.toString() === req.userId.toString();

    if (!isReplyAuthor && !isReelAuthor) {
      return res.status(403).json({ message: 'Not authorized to delete this reply' });
    }

    await reply.deleteOne();

    if (doc) {
      await PromoteReel.findByIdAndUpdate(reply.post_id, { $inc: { comments_count: -1 } });
    }

    res.json({ message: 'Reply deleted successfully' });
  } catch (error) {
    console.error('[PromoteReel] deleteReply error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── Comment like / unlike ─────────────────────────────────────────────────

// POST /api/promote-reels/comments/:commentId/like
exports.likeComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (comment.likes.includes(req.userId)) {
      return res.status(400).json({ message: 'Already liked' });
    }

    comment.likes.push(req.userId);
    comment.likes_count = comment.likes.length;
    await comment.save();

    try {
      if (comment.user.id.toString() !== req.userId.toString()) {
        const liker = await User.findById(req.userId).select('username').lean();
        if (liker) {
          await sendNotification(req.app, {
            recipient: comment.user.id,
            sender:    req.userId,
            type:      'comment_like',
            message:   `${liker.username} liked your comment`,
            link:      `/promote-reels/${comment.post_id}`
          });
        }
      }
    } catch (notifErr) {
      console.error('[PromoteReel] comment like notification error:', notifErr.message);
    }

    res.json({ liked: true, likes_count: comment.likes_count });
  } catch (error) {
    console.error('[PromoteReel] likeComment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// POST /api/promote-reels/comments/:commentId/unlike
exports.unlikeComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (!comment.likes.includes(req.userId)) {
      return res.status(400).json({ message: 'Not liked' });
    }

    comment.likes       = comment.likes.filter(id => id.toString() !== req.userId.toString());
    comment.likes_count = comment.likes.length;
    await comment.save();

    res.json({ liked: false, likes_count: comment.likes_count });
  } catch (error) {
    console.error('[PromoteReel] unlikeComment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
