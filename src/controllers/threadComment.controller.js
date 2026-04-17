const ThreadComment = require('../models/threadComment.model');
const Thread = require('../models/thread.model');
const User = require('../models/User');
const sendNotification = require('../utils/sendNotification');

exports.addThreadComment = async (req, res) => {
  try {
    const { threadId } = req.params;
    const { text, parent_id } = req.body;
    const userId = req.userId;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const thread = await Thread.findOne({ _id: threadId, isDeleted: false });
    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    let parentCommentId = null;
    let parentComment = null;

    if (parent_id) {
      parentComment = await ThreadComment.findById(parent_id);
      if (!parentComment || parentComment.isDeleted) {
        return res.status(404).json({ message: 'Parent comment not found' });
      }

      if (parentComment.thread_id.toString() !== threadId) {
        return res.status(400).json({ message: 'Parent comment does not belong to this thread' });
      }

      if (parentComment.parent_id) {
        return res.status(400).json({ message: 'Nested replies are not allowed' });
      }

      parentCommentId = parent_id;
    }

    const user = await User.findById(userId).select('username avatar_url').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newComment = await ThreadComment.create({
      thread_id: threadId,
      parent_id: parentCommentId,
      user: {
        id: userId,
        username: user.username,
        avatar_url: user.avatar_url || '',
      },
      text: text.trim(),
    });

    await Thread.findByIdAndUpdate(threadId, { $inc: { commentsCount: 1 } });

    try {
      if (parentComment && parentComment.user.id.toString() !== userId.toString()) {
        await sendNotification(req.app, {
          recipient: parentComment.user.id,
          sender: userId,
          type: 'comment_reply',
          message: `${user.username} replied to your comment`,
          link: `/threads/${threadId}`,
        });
      } else if (thread.author.toString() !== userId.toString()) {
        await sendNotification(req.app, {
          recipient: thread.author,
          sender: userId,
          type: 'comment',
          message: `${user.username} commented on your thread`,
          link: `/threads/${threadId}`,
        });
      }
    } catch (notifErr) {
      console.error('[ThreadComment] notification error:', notifErr.message);
    }

    return res.status(201).json(newComment);
  } catch (error) {
    console.error('[ThreadComment] addThreadComment error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getThreadComments = async (req, res) => {
  try {
    const { threadId } = req.params;
    const commentsRaw = await ThreadComment.find({
      thread_id: threadId,
      parent_id: null,
      isDeleted: false,
    }).sort({ createdAt: -1 });

    const comments = commentsRaw.map((comment) => {
      const obj = comment.toObject ? comment.toObject() : comment;
      obj.comment_id = obj._id;
      return obj;
    });

    return res.json(comments);
  } catch (error) {
    console.error('[ThreadComment] getThreadComments error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getThreadCommentReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const repliesRaw = await ThreadComment.find({
      parent_id: commentId,
      isDeleted: false,
    }).sort({ createdAt: 1 });

    const replies = repliesRaw.map((reply) => {
      const obj = reply.toObject ? reply.toObject() : reply;
      obj.comment_id = obj._id;
      return obj;
    });

    return res.json(replies);
  } catch (error) {
    console.error('[ThreadComment] getThreadCommentReplies error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.likeThreadComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.userId;

    const comment = await ThreadComment.findById(commentId);
    if (!comment || comment.isDeleted) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    if (comment.likes.some((id) => id.toString() === userId.toString())) {
      return res.status(400).json({ message: 'Already liked' });
    }

    comment.likes.push(userId);
    comment.likes_count = comment.likes.length;
    await comment.save();

    try {
      if (comment.user.id.toString() !== userId.toString()) {
        const liker = await User.findById(userId).select('username').lean();
        if (liker) {
          await sendNotification(req.app, {
            recipient: comment.user.id,
            sender: userId,
            type: 'comment_like',
            message: `${liker.username} liked your comment`,
            link: `/threads/${comment.thread_id}`,
          });
        }
      }
    } catch (notifErr) {
      console.error('[ThreadComment] like notification error:', notifErr.message);
    }

    return res.json({ liked: true, likes_count: comment.likes_count });
  } catch (error) {
    console.error('[ThreadComment] likeThreadComment error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.unlikeThreadComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.userId;

    const comment = await ThreadComment.findById(commentId);
    if (!comment || comment.isDeleted) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    if (!comment.likes.some((id) => id.toString() === userId.toString())) {
      return res.status(400).json({ message: 'Not liked' });
    }

    comment.likes = comment.likes.filter((id) => id.toString() !== userId.toString());
    comment.likes_count = comment.likes.length;
    await comment.save();

    return res.json({ liked: false, likes_count: comment.likes_count });
  } catch (error) {
    console.error('[ThreadComment] unlikeThreadComment error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteThreadComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.userId;

    const comment = await ThreadComment.findById(commentId);
    if (!comment || comment.isDeleted) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const thread = await Thread.findById(comment.thread_id);
    const isCommentAuthor = comment.user.id.toString() === userId.toString();
    const isThreadAuthor = thread && thread.author.toString() === userId.toString();

    if (!isCommentAuthor && !isThreadAuthor) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    comment.isDeleted = true;
    comment.deletedBy = userId;
    comment.deletedAt = new Date();
    await comment.save();

    await Thread.findByIdAndUpdate(comment.thread_id, {
      $inc: { commentsCount: -1 },
    });

    return res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('[ThreadComment] deleteThreadComment error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
