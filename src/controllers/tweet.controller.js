const mongoose = require('mongoose');
const Tweet = require('../models/tweet.model');
const TweetLike = require('../models/tweetLike.model');
const TweetRepost = require('../models/tweetRepost.model');
const TweetComment = require('../models/tweetComment.model');
const Follow = require('../models/Follow');
const User = require('../models/User');
const { getPublicBaseUrl } = require('../utils/publicUrl');

const TWEET_AUTHOR_SELECT = 'username full_name avatar_url';

const isValidObjectId = (value) => mongoose.isValidObjectId(value);

const normalizeAudience = (audience) => (
  audience === 'followers' ? 'followers' : 'everyone'
);

const sanitizeMedia = (media = []) => {
  if (!Array.isArray(media)) return [];

  return media
    .filter((item) => item && typeof item === 'object' && item.url && item.type)
    .map((item) => {
      const aspectRatio = Number(item.aspectRatio || item.originalAspect);
      const cropSettings = item.cropSettings && typeof item.cropSettings === 'object'
        ? {
            mode: item.cropSettings.mode || 'original',
            aspect_ratio: item.cropSettings.aspect_ratio || null,
            zoom: Number(item.cropSettings.zoom || 1),
            x: Number(item.cropSettings.x || 0),
            y: Number(item.cropSettings.y || 0),
          }
        : undefined;

      return {
        url: item.url,
        type: item.type,
        aspectRatio: Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : null,
        originalAspect: Number.isFinite(Number(item.originalAspect)) && Number(item.originalAspect) > 0
          ? Number(item.originalAspect)
          : null,
        ...(cropSettings ? { cropSettings } : {}),
      };
    })
    .filter((item) => item.type === 'image');
};

const validateTweetInput = ({ content, media, quoteContent }) => {
  const trimmedContent = typeof content === 'string' ? content.trim() : '';
  const trimmedQuoteContent = typeof quoteContent === 'string' ? quoteContent.trim() : '';

  if (typeof content !== 'undefined' && trimmedContent.length > 500) {
    return 'content cannot exceed 500 characters';
  }

  if (typeof quoteContent !== 'undefined' && trimmedQuoteContent.length > 500) {
    return 'quoteContent cannot exceed 500 characters';
  }

  if (Array.isArray(media) && media.length > 10) {
    return 'media array cannot contain more than 10 items';
  }

  if (!Array.isArray(media) && typeof media !== 'undefined') {
    return 'media must be an array';
  }

  if (Array.isArray(media) && media.some((item) => item && item.type !== 'image')) {
    return 'tweets only support image uploads for now';
  }

  if (!trimmedContent && !trimmedQuoteContent && (!Array.isArray(media) || media.length === 0)) {
    return 'content or image is required';
  }

  return null;
};

const buildTweetLink = (tweetId) => `/tweets/${tweetId}`;

const emitToUser = (req, userId, eventName, payload) => {
  const io = req.app.get('io');
  const onlineUsers = req.app.get('onlineUsers');

  if (!io || !onlineUsers || !userId) return;

  const socketId = onlineUsers.get(userId.toString());
  if (socketId) {
    io.to(socketId).emit(eventName, payload);
  }
};

const mapAuthor = (author) => {
  if (!author) return null;

  const authorObj = author.toObject ? author.toObject() : author;

  return {
    ...authorObj,
    name: authorObj.full_name || '',
    profilePicture: authorObj.avatar_url || '',
    isVerified: false,
  };
};

const mapRepostAuthor = (repostOf) => {
  if (!repostOf) return null;

  const repostObj = repostOf.toObject ? repostOf.toObject() : repostOf;
  return {
    ...repostObj,
    author: mapAuthor(repostObj.author),
  };
};

const mapTweetDoc = (tweet, options = {}) => {
  const tweetObj = tweet.toObject ? tweet.toObject() : { ...tweet };
  const resolvedCommentsCount = Number.isFinite(options.commentsCount)
    ? options.commentsCount
    : (tweetObj.commentsCount || 0);
  const resolvedCommentsTotal = Number.isFinite(options.commentsTotal)
    ? options.commentsTotal
    : resolvedCommentsCount;

  return {
    ...tweetObj,
    author: mapAuthor(tweetObj.author),
    repostOf: mapRepostAuthor(tweetObj.repostOf),
    commentsCount: resolvedCommentsCount,
    comments_count: resolvedCommentsCount,
    commentsTotal: resolvedCommentsTotal,
    isLiked: !!options.isLiked,
    isReposted: !!options.isReposted,
  };
};

const decorateTweets = async (tweets, userId) => {
  if (!tweets.length) return [];

  const tweetIds = tweets.map((tweet) => tweet._id);

  const [likes, reposts, commentStats] = await Promise.all([
    TweetLike.find({ user: userId, tweet: { $in: tweetIds } }).select('tweet').lean(),
    TweetRepost.find({ user: userId, tweet: { $in: tweetIds } }).select('tweet').lean(),
    TweetComment.aggregate([
      {
        $match: {
          tweet_id: { $in: tweetIds },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$tweet_id',
          total: { $sum: 1 },
          topLevel: {
            $sum: {
              $cond: [{ $eq: ['$parent_id', null] }, 1, 0],
            },
          },
        },
      },
    ]),
  ]);

  const likedSet = new Set(likes.map((item) => item.tweet.toString()));
  const repostSet = new Set(reposts.map((item) => item.tweet.toString()));
  const commentStatMap = new Map(
    commentStats.map((item) => [
      item._id.toString(),
      { total: item.total || 0, topLevel: item.topLevel || 0 },
    ])
  );

  return tweets.map((tweet) => mapTweetDoc(tweet, {
    isLiked: likedSet.has(tweet._id.toString()),
    isReposted: repostSet.has(tweet._id.toString()),
    commentsCount: commentStatMap.get(tweet._id.toString())?.topLevel ?? 0,
    commentsTotal: commentStatMap.get(tweet._id.toString())?.total ?? 0,
  }));
};

const populateTweetQuery = (query) => query
  .populate('author', TWEET_AUTHOR_SELECT)
  .populate({
    path: 'repostOf',
    populate: {
      path: 'author',
      select: TWEET_AUTHOR_SELECT,
    },
  });

const createTweetDocument = async (req, payload) => {
  const {
    content,
    media,
    parentTweetId,
    repostOfId,
    quoteContent,
    audience,
  } = payload;

  const trimmedContent = typeof content === 'string' ? content.trim() : '';
  const trimmedQuoteContent = typeof quoteContent === 'string' ? quoteContent.trim() : '';
  const normalizedMedia = sanitizeMedia(media);

  if (!trimmedContent && !trimmedQuoteContent && !normalizedMedia.length) {
    return { error: { status: 400, message: 'Tweet content or image is required' } };
  }

  let parentTweet = null;
  let rootTweet = null;
  let repostTarget = null;

  if (parentTweetId) {
    if (!isValidObjectId(parentTweetId)) {
      return { error: { status: 400, message: 'Invalid parentTweetId' } };
    }

    parentTweet = await Tweet.findOne({ _id: parentTweetId, isDeleted: false });
    if (!parentTweet) {
      return { error: { status: 404, message: 'Parent tweet not found' } };
    }

    rootTweet = parentTweet.rootTweet || parentTweet._id;
  }

  if (repostOfId) {
    if (!isValidObjectId(repostOfId)) {
      return { error: { status: 400, message: 'Invalid repostOfId' } };
    }

    repostTarget = await Tweet.findOne({ _id: repostOfId, isDeleted: false });
    if (!repostTarget) {
      return { error: { status: 404, message: 'Original tweet not found' } };
    }
  }

  const tweet = await Tweet.create({
    author: req.userId,
    content: trimmedContent || trimmedQuoteContent,
    media: normalizedMedia,
    parentTweet: parentTweet ? parentTweet._id : null,
    rootTweet,
    repostOf: repostTarget ? repostTarget._id : null,
    quoteContent: trimmedQuoteContent,
    audience: normalizeAudience(audience),
  });

  if (parentTweet) {
    await Tweet.findByIdAndUpdate(parentTweet._id, { $inc: { repliesCount: 1 } });
  }

  if (repostTarget) {
    if (trimmedQuoteContent) {
      await Tweet.findByIdAndUpdate(repostTarget._id, { $inc: { quotesCount: 1 } });
    } else {
      await Tweet.findByIdAndUpdate(repostTarget._id, { $inc: { repostsCount: 1 } });
    }
  }

  const populatedTweet = await populateTweetQuery(Tweet.findById(tweet._id)).exec();

  return {
    tweet: populatedTweet,
    parentTweet,
    repostTarget,
    isQuoteRepost: !!trimmedQuoteContent && !!repostTarget,
  };
};

const fanOutTweetCreated = async (req, tweet) => {
  try {
    const followers = await Follow.find({ followed_id: req.userId }).select('follower_id').lean();
    if (!followers.length) return;

    const payload = mapTweetDoc(tweet, { isLiked: false, isReposted: false });
    followers.forEach((follow) => {
      emitToUser(req, follow.follower_id, 'tweet:created', payload);
    });
  } catch (error) {
    console.error('[Tweet] fanOutTweetCreated error:', error.message);
  }
};

const sendTweetLikeEvent = async (req, tweet, userId) => {
  if (!tweet.author || tweet.author.toString() === userId.toString()) return;

  const liker = await User.findById(userId).select('username full_name avatar_url').lean();
  emitToUser(req, tweet.author, 'tweet:liked', {
    tweetId: tweet._id,
    likedBy: liker ? {
      ...liker,
      name: liker.full_name || '',
      profilePicture: liker.avatar_url || '',
      isVerified: false,
    } : { _id: userId },
  });
};

const sendTweetReplyEvent = async (req, parentTweet, tweet) => {
  if (!parentTweet || parentTweet.author.toString() === req.userId.toString()) return;

  emitToUser(req, parentTweet.author, 'tweet:replied', {
    tweetId: tweet._id,
    parentTweetId: parentTweet._id,
    rootTweetId: tweet.rootTweet || parentTweet._id,
    authorId: req.userId,
  });
};

const sendTweetRepostedEvent = (req, originalTweet, payload = {}) => {
  if (!originalTweet || originalTweet.author.toString() === req.userId.toString()) return;

  emitToUser(req, originalTweet.author, 'tweet:reposted', {
    tweetId: originalTweet._id,
    userId: req.userId,
    ...payload,
  });
};

const buildCursor = (tweet) => (tweet ? tweet.createdAt : null);

const getRequestPagination = (req, defaultLimit = 20, maxLimit = 50) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit, 10) || defaultLimit));
  return { page, limit };
};

const applyCursorOrOffset = (queryBuilder, req, page, limit) => {
  const cursor = req.query.cursor;

  if (cursor) {
    const cursorDate = new Date(cursor);
    if (Number.isNaN(cursorDate.getTime())) {
      return { error: { status: 400, message: 'Invalid cursor' } };
    }

    queryBuilder.where({ createdAt: { $lt: cursorDate } });
    return { cursor };
  }

  queryBuilder.skip((page - 1) * limit);
  return { cursor: null };
};

const createTweet = async (req, res) => {
  try {
    const { content, media, parentTweetId, repostOfId, quoteContent, audience } = req.body;
    const trimmedQuoteContent = typeof quoteContent === 'string' ? quoteContent.trim() : '';

    if (repostOfId && !trimmedQuoteContent) {
      if (!isValidObjectId(repostOfId)) {
        return res.status(400).json({ message: 'Invalid repostOfId' });
      }

      const originalTweet = await Tweet.findOne({ _id: repostOfId, isDeleted: false });
      if (!originalTweet) {
        return res.status(404).json({ message: 'Original tweet not found' });
      }

      const existingRepost = await TweetRepost.findOne({ user: req.userId, tweet: repostOfId });
      if (existingRepost) {
        return res.status(409).json({ message: 'Tweet already reposted' });
      }

      await TweetRepost.create({ user: req.userId, tweet: repostOfId });
      await Tweet.findByIdAndUpdate(repostOfId, { $inc: { repostsCount: 1 } });

      sendTweetRepostedEvent(req, originalTweet);

      const populatedOriginal = await populateTweetQuery(Tweet.findById(repostOfId)).exec();
      const [decoratedTweet] = await decorateTweets([populatedOriginal], req.userId);

      return res.status(201).json({
        reposted: true,
        tweet: decoratedTweet,
      });
    }

    const validationError = validateTweetInput({ content, media, quoteContent });

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const result = await createTweetDocument(req, {
      content,
      media,
      parentTweetId,
      repostOfId,
      quoteContent,
      audience,
    });

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const { tweet, parentTweet, repostTarget, isQuoteRepost } = result;
    const [decoratedTweet] = await decorateTweets([tweet], req.userId);

    if (parentTweet) {
      await sendTweetReplyEvent(req, parentTweet, tweet);
    }

    if (repostTarget && isQuoteRepost) {
      sendTweetRepostedEvent(req, repostTarget, { quoteTweetId: tweet._id, quoted: true });
    }

    await fanOutTweetCreated(req, tweet);

    return res.status(201).json(decoratedTweet);
  } catch (error) {
    console.error('[Tweet] createTweet error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getFeedTweets = async (req, res) => {
  try {
    const { page, limit } = getRequestPagination(req);

    const query = {
      audience: 'everyone',
      isDeleted: false,
      parentTweet: null,
    };

    const findQuery = Tweet.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const paginationMode = applyCursorOrOffset(findQuery, req, page, limit);
    if (paginationMode.error) {
      return res.status(paginationMode.error.status).json({ message: paginationMode.error.message });
    }

    const tweets = await populateTweetQuery(findQuery).exec();

    const hasMore = tweets.length > limit;
    const slicedTweets = hasMore ? tweets.slice(0, limit) : tweets;
    const decoratedTweets = await decorateTweets(slicedTweets, req.userId);

    return res.json({
      tweets: decoratedTweets,
      nextCursor: hasMore ? buildCursor(slicedTweets[slicedTweets.length - 1]) : null,
      hasMore,
    });
  } catch (error) {
    console.error('[Tweet] getFeedTweets error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getUserTweets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page, limit } = getRequestPagination(req);

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const rootTweetsQuery = Tweet.find({
      author: userId,
      parentTweet: null,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const repostsQuery = TweetRepost.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const rootTweetsMode = applyCursorOrOffset(rootTweetsQuery, req, page, limit);
    if (rootTweetsMode.error) {
      return res.status(rootTweetsMode.error.status).json({ message: rootTweetsMode.error.message });
    }

    const repostsMode = applyCursorOrOffset(repostsQuery, req, page, limit);
    if (repostsMode.error) {
      return res.status(repostsMode.error.status).json({ message: repostsMode.error.message });
    }

    const [rootTweets, repostRecords] = await Promise.all([
      populateTweetQuery(rootTweetsQuery).exec(),
      repostsQuery
        .populate({
          path: 'tweet',
          match: { isDeleted: false },
          populate: [
            { path: 'author', select: TWEET_AUTHOR_SELECT },
            {
              path: 'repostOf',
              populate: { path: 'author', select: TWEET_AUTHOR_SELECT },
            },
          ],
        })
        .lean(),
    ]);

    const slicedRootTweets = rootTweets.slice(0, limit);
    const slicedRepostRecords = repostRecords.slice(0, limit);

    const repostTweets = slicedRepostRecords
      .filter((item) => item.tweet)
      .map((item) => ({
        ...item.tweet,
        createdAt: item.createdAt,
        repostedAt: item.createdAt,
        isSimpleRepost: true,
        repostId: item._id,
        repostedBy: userId,
      }));

    const combined = [...slicedRootTweets, ...repostTweets]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const tweetDocs = combined.map((item) => (item.tweet ? item.tweet : item));
    const decoratedCombined = await decorateTweets(tweetDocs, req.userId);

    const merged = combined.map((item, index) => {
      const decorated = decoratedCombined[index];
      if (item.isSimpleRepost) {
        return {
          ...decorated,
          createdAt: item.createdAt,
          repostedAt: item.repostedAt,
          isSimpleRepost: true,
          repostId: item.repostId,
          repostedBy: item.repostedBy,
        };
      }
      return decorated;
    });

    return res.json({
      page,
      limit,
      tweets: merged,
      nextCursor: merged.length ? merged[merged.length - 1].createdAt : null,
      hasMore: rootTweets.length > limit || repostRecords.length > limit,
    });
  } catch (error) {
    console.error('[Tweet] getUserTweets error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getTweetReplies = async (req, res) => {
  try {
    const { tweetId } = req.params;

    if (!isValidObjectId(tweetId)) {
      return res.status(400).json({ message: 'Invalid tweetId' });
    }

    const replies = await Tweet.find({
      parentTweet: tweetId,
      isDeleted: false,
    })
      .sort({ createdAt: 1 })
      .populate('author', TWEET_AUTHOR_SELECT);

    const decoratedReplies = await decorateTweets(replies, req.userId);

    return res.json({
      replies: decoratedReplies.map((reply) => ({
        ...reply,
        repliesCount: reply.repliesCount || 0,
      })),
    });
  } catch (error) {
    console.error('[Tweet] getTweetReplies error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getTweetById = async (req, res) => {
  try {
    const { tweetId } = req.params;

    if (!isValidObjectId(tweetId)) {
      return res.status(400).json({ message: 'Invalid tweetId' });
    }

    const tweet = await populateTweetQuery(
      Tweet.findOneAndUpdate(
        { _id: tweetId, isDeleted: false },
        { $inc: { viewsCount: 1 } },
        { new: true }
      )
    ).exec();

    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }

    const [decoratedTweet] = await decorateTweets([tweet], req.userId);
    return res.json(decoratedTweet);
  } catch (error) {
    console.error('[Tweet] getTweetById error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const likeTweet = async (req, res) => {
  try {
    const { tweetId } = req.params;

    if (!isValidObjectId(tweetId)) {
      return res.status(400).json({ message: 'Invalid tweetId' });
    }

    const tweet = await Tweet.findOne({ _id: tweetId, isDeleted: false });
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }

    const existingLike = await TweetLike.findOne({ user: req.userId, tweet: tweetId });

    if (existingLike) {
      await TweetLike.deleteOne({ _id: existingLike._id });
      tweet.likes = tweet.likes.filter((id) => id.toString() !== req.userId.toString());
      tweet.likesCount = Math.max(0, (tweet.likesCount || 0) - 1);
      await tweet.save();

      return res.json({
        liked: false,
        likesCount: tweet.likesCount,
      });
    }

    await TweetLike.create({ user: req.userId, tweet: tweetId });

    if (!tweet.likes.some((id) => id.toString() === req.userId.toString())) {
      tweet.likes.push(req.userId);
    }
    tweet.likesCount = (tweet.likesCount || 0) + 1;
    await tweet.save();

    await sendTweetLikeEvent(req, tweet, req.userId);

    return res.json({
      liked: true,
      likesCount: tweet.likesCount,
    });
  } catch (error) {
    console.error('[Tweet] likeTweet error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const unlikeTweet = async (req, res) => {
  try {
    const { tweetId } = req.params;

    if (!isValidObjectId(tweetId)) {
      return res.status(400).json({ message: 'Invalid tweetId' });
    }

    const tweet = await Tweet.findOne({ _id: tweetId, isDeleted: false });
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }

    const existingLike = await TweetLike.findOne({ user: req.userId, tweet: tweetId });
    if (!existingLike) {
      return res.status(400).json({ message: 'Not liked yet' });
    }

    await TweetLike.deleteOne({ _id: existingLike._id });
    tweet.likes = tweet.likes.filter((id) => id.toString() !== req.userId.toString());
    tweet.likesCount = Math.max(0, (tweet.likesCount || 0) - 1);
    await tweet.save();

    return res.json({
      liked: false,
      likesCount: tweet.likesCount,
    });
  } catch (error) {
    console.error('[Tweet] unlikeTweet error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const repostTweet = async (req, res) => {
  try {
    const { tweetId, quoteContent, content, media, audience } = req.body;
    const trimmedQuoteContent = typeof quoteContent === 'string' ? quoteContent.trim() : '';
    const validationError = trimmedQuoteContent
      ? validateTweetInput({ content, media, quoteContent })
      : null;

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    if (!isValidObjectId(tweetId)) {
      return res.status(400).json({ message: 'Invalid tweetId' });
    }

    if (trimmedQuoteContent) {
      const result = await createTweetDocument(req, {
        content,
        media,
        repostOfId: tweetId,
        quoteContent: trimmedQuoteContent,
        audience,
      });

      if (result.error) {
        return res.status(result.error.status).json({ message: result.error.message });
      }

      const [decoratedTweet] = await decorateTweets([result.tweet], req.userId);
      sendTweetRepostedEvent(req, result.repostTarget, {
        quoteTweetId: result.tweet._id,
        quoted: true,
      });
      await fanOutTweetCreated(req, result.tweet);

      return res.status(201).json({
        reposted: true,
        tweet: decoratedTweet,
        repostsCount: result.repostTarget.repostsCount,
      });
    }

    const tweet = await Tweet.findOne({ _id: tweetId, isDeleted: false });
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }

    const existingRepost = await TweetRepost.findOne({ user: req.userId, tweet: tweetId });

    if (existingRepost) {
      await TweetRepost.deleteOne({ _id: existingRepost._id });
      tweet.repostsCount = Math.max(0, (tweet.repostsCount || 0) - 1);
      await tweet.save();

      return res.json({
        reposted: false,
        repostsCount: tweet.repostsCount,
      });
    }

    await TweetRepost.create({ user: req.userId, tweet: tweetId });
    tweet.repostsCount = (tweet.repostsCount || 0) + 1;
    await tweet.save();

    sendTweetRepostedEvent(req, tweet);

    return res.json({
      reposted: true,
      repostsCount: tweet.repostsCount,
    });
  } catch (error) {
    console.error('[Tweet] repostTweet error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const deleteTweet = async (req, res) => {
  try {
    const { tweetId } = req.params;

    if (!isValidObjectId(tweetId)) {
      return res.status(400).json({ message: 'Invalid tweetId' });
    }

    const tweet = await Tweet.findById(tweetId);
    if (!tweet || tweet.isDeleted) {
      return res.status(404).json({ message: 'Tweet not found' });
    }

    if (tweet.author.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this tweet' });
    }

    tweet.isDeleted = true;
    await tweet.save();

    if (tweet.parentTweet) {
      await Tweet.findByIdAndUpdate(tweet.parentTweet, { $inc: { repliesCount: -1 } });
    }

    if (tweet.repostOf) {
      if (tweet.quoteContent) {
        await Tweet.findByIdAndUpdate(tweet.repostOf, { $inc: { quotesCount: -1 } });
      } else {
        await Tweet.findByIdAndUpdate(tweet.repostOf, { $inc: { repostsCount: -1 } });
      }
    }

    await TweetLike.deleteMany({ tweet: tweetId });
    await TweetRepost.deleteMany({ tweet: tweetId });
    await TweetComment.deleteMany({ tweet_id: tweetId });

    return res.json({ message: 'Tweet deleted' });
  } catch (error) {
    console.error('[Tweet] deleteTweet error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const searchTweets = async (req, res) => {
  try {
    const { q } = req.query;
    const { page, limit } = getRequestPagination(req);

    if (!q || !q.trim()) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const regex = new RegExp(q.trim(), 'i');
    const searchQuery = Tweet.find({
      content: { $regex: regex },
      isDeleted: false,
      audience: 'everyone',
    })
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const paginationMode = applyCursorOrOffset(searchQuery, req, page, limit);
    if (paginationMode.error) {
      return res.status(paginationMode.error.status).json({ message: paginationMode.error.message });
    }

    const tweets = await populateTweetQuery(searchQuery).exec();
    const hasMore = tweets.length > limit;
    const slicedTweets = hasMore ? tweets.slice(0, limit) : tweets;

    const decoratedTweets = await decorateTweets(slicedTweets, req.userId);

    return res.json({
      page,
      limit,
      tweets: decoratedTweets,
      nextCursor: hasMore && slicedTweets.length ? slicedTweets[slicedTweets.length - 1].createdAt : null,
      hasMore,
    });
  } catch (error) {
    console.error('[Tweet] searchTweets error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getTrendingTweets = async (req, res) => {
  try {
    const since = new Date(Date.now() - (48 * 60 * 60 * 1000));

    const rankedIds = await Tweet.aggregate([
      {
        $match: {
          createdAt: { $gte: since },
          isDeleted: false,
          parentTweet: null,
          audience: 'everyone',
        },
      },
      {
        $addFields: {
          trendingScore: {
            $add: ['$likesCount', '$repliesCount', '$repostsCount'],
          },
        },
      },
      { $sort: { trendingScore: -1, createdAt: -1 } },
      { $limit: 20 },
      { $project: { _id: 1, trendingScore: 1 } },
    ]);

    const scoreMap = new Map(rankedIds.map((item) => [item._id.toString(), item.trendingScore]));
    const sortedIds = rankedIds.map((item) => item._id);

    const tweets = await populateTweetQuery(
      Tweet.find({ _id: { $in: sortedIds } })
    ).exec();

    const tweetMap = new Map(tweets.map((tweet) => [tweet._id.toString(), tweet]));
    const orderedTweets = sortedIds
      .map((id) => tweetMap.get(id.toString()))
      .filter(Boolean);

    const decoratedTweets = await decorateTweets(orderedTweets, req.userId);
    const rankedTweets = decoratedTweets.map((tweet) => ({
      ...tweet,
      trendingScore: scoreMap.get(tweet._id.toString()) || 0,
    }));

    return res.json({ tweets: rankedTweets });
  } catch (error) {
    console.error('[Tweet] getTrendingTweets error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const uploadTweetImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image file' });
    }

    if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ message: 'Only image uploads are supported for tweets' });
    }

    const baseUrl = getPublicBaseUrl(req);
    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

    return res.json({
      fileName: req.file.filename,
      fileUrl,
      media: {
        url: fileUrl,
        type: 'image',
      },
    });
  } catch (error) {
    console.error('[Tweet] uploadTweetImage error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createTweet,
  getFeedTweets,
  getUserTweets,
  getTweetReplies,
  getTweetById,
  likeTweet,
  unlikeTweet,
  repostTweet,
  deleteTweet,
  searchTweets,
  getTrendingTweets,
  uploadTweetImage,
};

