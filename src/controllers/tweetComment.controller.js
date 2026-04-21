const TweetComment = require('../models/tweetComment.model');
const Tweet = require('../models/tweet.model');
const User = require('../models/User');
const sendNotification = require('../utils/sendNotification');

const toCommentResponse = (commentDoc, currentUserId, replyCount = 0) => {
  const comment = commentDoc.toObject ? commentDoc.toObject() : commentDoc;
  const likes = Array.isArray(comment.likes) ? comment.likes : [];
  const normalizedUserId = currentUserId ? currentUserId.toString() : null;
  const isLikedByMe = normalizedUserId
    ? likes.some((id) => id && id.toString() === normalizedUserId)
    : false;
  const normalizedLikesCount = Number.isInteger(comment.likes_count)
    ? comment.likes_count
    : likes.length;

  return {
    ...comment,
    comment_id: comment._id,
    likes_count: normalizedLikesCount,
    is_liked_by_me: isLikedByMe,
    reply_count: replyCount,
    replies_count: replyCount,
  };
};

exports.addTweetComment = async (req, res) => {
  try {
    const { tweetId } = req.params;
    const { text, parent_id } = req.body;
    const userId = req.userId;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const tweet = await Tweet.findOne({ _id: tweetId, isDeleted: false });
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }

    let parentCommentId = null;
    let parentComment = null;

    if (parent_id) {
      parentComment = await TweetComment.findById(parent_id);
      if (!parentComment || parentComment.isDeleted) {
        return res.status(404).json({ message: 'Parent comment not found' });
      }

      if (parentComment.tweet_id.toString() !== tweetId) {
        return res.status(400).json({ message: 'Parent comment does not belong to this tweet' });
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

    const newComment = await TweetComment.create({
      tweet_id: tweetId,
      parent_id: parentCommentId,
      user: {
        id: userId,
        username: user.username,
        avatar_url: user.avatar_url || '',
      },
      text: text.trim(),
    });

    await Tweet.findByIdAndUpdate(tweetId, { $inc: { commentsCount: 1 } });

    try {
      if (parentComment && parentComment.user.id.toString() !== userId.toString()) {
        await sendNotification(req.app, {
          recipient: parentComment.user.id,
          sender: userId,
          type: 'comment_reply',
          message: `${user.username} replied to your comment`,
          link: `/tweets/${tweetId}`,
        });
      } else if (tweet.author.toString() !== userId.toString()) {
        await sendNotification(req.app, {
          recipient: tweet.author,
          sender: userId,
          type: 'comment',
          message: `${user.username} commented on your tweet`,
          link: `/tweets/${tweetId}`,
        });
      }
    } catch (notifErr) {
      console.error('[TweetComment] notification error:', notifErr.message);
    }

    return res.status(201).json(newComment);
  } catch (error) {
    console.error('[TweetComment] addTweetComment error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getTweetComments = async (req, res) => {
  try {
    const { tweetId } = req.params;
    const commentsRaw = await TweetComment.find({
      tweet_id: tweetId,
      parent_id: null,
      isDeleted: false,
    }).sort({ createdAt: -1 });

    if (!commentsRaw.length) {
      return res.json([]);
    }

    const commentIds = commentsRaw.map((comment) => comment._id);
    const replyCountsRaw = await TweetComment.aggregate([
      {
        $match: {
          parent_id: { $in: commentIds },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$parent_id',
          count: { $sum: 1 },
        },
      },
    ]);

    const replyCountMap = new Map(
      replyCountsRaw.map((item) => [item._id.toString(), item.count])
    );

    const comments = commentsRaw.map((comment) => {
      const count = replyCountMap.get(comment._id.toString()) || 0;
      return toCommentResponse(comment, req.userId, count);
    });

    return res.json(comments);
  } catch (error) {
    console.error('[TweetComment] getTweetComments error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getTweetCommentReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const repliesRaw = await TweetComment.find({
      parent_id: commentId,
      isDeleted: false,
    }).sort({ createdAt: 1 });

    const replies = repliesRaw.map((reply) => toCommentResponse(reply, req.userId, 0));

    return res.json(replies);
  } catch (error) {
    console.error('[TweetComment] getTweetCommentReplies error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.likeTweetComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.userId;

    const comment = await TweetComment.findById(commentId);
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
            link: `/tweets/${comment.tweet_id}`,
          });
        }
      }
    } catch (notifErr) {
      console.error('[TweetComment] like notification error:', notifErr.message);
    }

    return res.json({ liked: true, likes_count: comment.likes_count });
  } catch (error) {
    console.error('[TweetComment] likeTweetComment error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.unlikeTweetComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.userId;

    const comment = await TweetComment.findById(commentId);
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
    console.error('[TweetComment] unlikeTweetComment error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteTweetComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.userId;

    const comment = await TweetComment.findById(commentId);
    if (!comment || comment.isDeleted) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const tweet = await Tweet.findById(comment.tweet_id);
    const isCommentAuthor = comment.user.id.toString() === userId.toString();
    const isTweetAuthor = tweet && tweet.author.toString() === userId.toString();

    if (!isCommentAuthor && !isTweetAuthor) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    comment.isDeleted = true;
    comment.deletedBy = userId;
    comment.deletedAt = new Date();
    await comment.save();

    await Tweet.findByIdAndUpdate(comment.tweet_id, {
      $inc: { commentsCount: -1 },
    });

    return res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('[TweetComment] deleteTweetComment error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

