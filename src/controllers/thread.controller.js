const mongoose = require('mongoose');
const Thread = require('../models/thread.model');
const ThreadLike = require('../models/threadLike.model');
const ThreadRepost = require('../models/threadRepost.model');
const ThreadComment = require('../models/threadComment.model');
const Follow = require('../models/Follow');
const User = require('../models/User');
const { getPublicBaseUrl } = require('../utils/publicUrl');

const THREAD_AUTHOR_SELECT = 'username full_name avatar_url';

const isValidObjectId = (value) => mongoose.isValidObjectId(value);

const normalizeAudience = (audience) => (
  audience === 'followers' ? 'followers' : 'everyone'
);

const sanitizeMedia = (media = []) => {
  if (!Array.isArray(media)) return [];

  return media
    .filter((item) => item && typeof item === 'object' && item.url && item.type)
    .map((item) => ({
      url: item.url,
      type: item.type,
    }))
    .filter((item) => item.type === 'image');
};

const validateThreadInput = ({ content, media, quoteContent }) => {
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
    return 'threads only support image uploads for now';
  }

  if (!trimmedContent && !trimmedQuoteContent && (!Array.isArray(media) || media.length === 0)) {
    return 'content or image is required';
  }

  return null;
};

const buildThreadLink = (threadId) => `/threads/${threadId}`;

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

const mapThreadDoc = (thread, options = {}) => {
  const threadObj = thread.toObject ? thread.toObject() : { ...thread };

  return {
    ...threadObj,
    author: mapAuthor(threadObj.author),
    repostOf: mapRepostAuthor(threadObj.repostOf),
    isLiked: !!options.isLiked,
    isReposted: !!options.isReposted,
  };
};

const decorateThreads = async (threads, userId) => {
  if (!threads.length) return [];

  const threadIds = threads.map((thread) => thread._id);

  const [likes, reposts] = await Promise.all([
    ThreadLike.find({ user: userId, thread: { $in: threadIds } }).select('thread').lean(),
    ThreadRepost.find({ user: userId, thread: { $in: threadIds } }).select('thread').lean(),
  ]);

  const likedSet = new Set(likes.map((item) => item.thread.toString()));
  const repostSet = new Set(reposts.map((item) => item.thread.toString()));

  return threads.map((thread) => mapThreadDoc(thread, {
    isLiked: likedSet.has(thread._id.toString()),
    isReposted: repostSet.has(thread._id.toString()),
  }));
};

const populateThreadQuery = (query) => query
  .populate('author', THREAD_AUTHOR_SELECT)
  .populate({
    path: 'repostOf',
    populate: {
      path: 'author',
      select: THREAD_AUTHOR_SELECT,
    },
  });

const createThreadDocument = async (req, payload) => {
  const {
    content,
    media,
    parentThreadId,
    repostOfId,
    quoteContent,
    audience,
  } = payload;

  const trimmedContent = typeof content === 'string' ? content.trim() : '';
  const trimmedQuoteContent = typeof quoteContent === 'string' ? quoteContent.trim() : '';
  const normalizedMedia = sanitizeMedia(media);

  if (!trimmedContent && !trimmedQuoteContent && !normalizedMedia.length) {
    return { error: { status: 400, message: 'Thread content or image is required' } };
  }

  let parentThread = null;
  let rootThread = null;
  let repostTarget = null;

  if (parentThreadId) {
    if (!isValidObjectId(parentThreadId)) {
      return { error: { status: 400, message: 'Invalid parentThreadId' } };
    }

    parentThread = await Thread.findOne({ _id: parentThreadId, isDeleted: false });
    if (!parentThread) {
      return { error: { status: 404, message: 'Parent thread not found' } };
    }

    rootThread = parentThread.rootThread || parentThread._id;
  }

  if (repostOfId) {
    if (!isValidObjectId(repostOfId)) {
      return { error: { status: 400, message: 'Invalid repostOfId' } };
    }

    repostTarget = await Thread.findOne({ _id: repostOfId, isDeleted: false });
    if (!repostTarget) {
      return { error: { status: 404, message: 'Original thread not found' } };
    }
  }

  const thread = await Thread.create({
    author: req.userId,
    content: trimmedContent || trimmedQuoteContent,
    media: normalizedMedia,
    parentThread: parentThread ? parentThread._id : null,
    rootThread,
    repostOf: repostTarget ? repostTarget._id : null,
    quoteContent: trimmedQuoteContent,
    audience: normalizeAudience(audience),
  });

  if (parentThread) {
    await Thread.findByIdAndUpdate(parentThread._id, { $inc: { repliesCount: 1 } });
  }

  if (repostTarget) {
    if (trimmedQuoteContent) {
      await Thread.findByIdAndUpdate(repostTarget._id, { $inc: { quotesCount: 1 } });
    } else {
      await Thread.findByIdAndUpdate(repostTarget._id, { $inc: { repostsCount: 1 } });
    }
  }

  const populatedThread = await populateThreadQuery(Thread.findById(thread._id)).exec();

  return {
    thread: populatedThread,
    parentThread,
    repostTarget,
    isQuoteRepost: !!trimmedQuoteContent && !!repostTarget,
  };
};

const fanOutThreadCreated = async (req, thread) => {
  try {
    const followers = await Follow.find({ followed_id: req.userId }).select('follower_id').lean();
    if (!followers.length) return;

    const payload = mapThreadDoc(thread, { isLiked: false, isReposted: false });
    followers.forEach((follow) => {
      emitToUser(req, follow.follower_id, 'thread:created', payload);
    });
  } catch (error) {
    console.error('[Thread] fanOutThreadCreated error:', error.message);
  }
};

const sendThreadLikeEvent = async (req, thread, userId) => {
  if (!thread.author || thread.author.toString() === userId.toString()) return;

  const liker = await User.findById(userId).select('username full_name avatar_url').lean();
  emitToUser(req, thread.author, 'thread:liked', {
    threadId: thread._id,
    likedBy: liker ? {
      ...liker,
      name: liker.full_name || '',
      profilePicture: liker.avatar_url || '',
      isVerified: false,
    } : { _id: userId },
  });
};

const sendThreadReplyEvent = async (req, parentThread, thread) => {
  if (!parentThread || parentThread.author.toString() === req.userId.toString()) return;

  emitToUser(req, parentThread.author, 'thread:replied', {
    threadId: thread._id,
    parentThreadId: parentThread._id,
    rootThreadId: thread.rootThread || parentThread._id,
    authorId: req.userId,
  });
};

const sendThreadRepostedEvent = (req, originalThread, payload = {}) => {
  if (!originalThread || originalThread.author.toString() === req.userId.toString()) return;

  emitToUser(req, originalThread.author, 'thread:reposted', {
    threadId: originalThread._id,
    userId: req.userId,
    ...payload,
  });
};

const buildCursor = (thread) => (thread ? thread.createdAt : null);

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

const createThread = async (req, res) => {
  try {
    const { content, media, parentThreadId, repostOfId, quoteContent, audience } = req.body;
    const trimmedQuoteContent = typeof quoteContent === 'string' ? quoteContent.trim() : '';

    if (repostOfId && !trimmedQuoteContent) {
      if (!isValidObjectId(repostOfId)) {
        return res.status(400).json({ message: 'Invalid repostOfId' });
      }

      const originalThread = await Thread.findOne({ _id: repostOfId, isDeleted: false });
      if (!originalThread) {
        return res.status(404).json({ message: 'Original thread not found' });
      }

      const existingRepost = await ThreadRepost.findOne({ user: req.userId, thread: repostOfId });
      if (existingRepost) {
        return res.status(409).json({ message: 'Thread already reposted' });
      }

      await ThreadRepost.create({ user: req.userId, thread: repostOfId });
      await Thread.findByIdAndUpdate(repostOfId, { $inc: { repostsCount: 1 } });

      sendThreadRepostedEvent(req, originalThread);

      const populatedOriginal = await populateThreadQuery(Thread.findById(repostOfId)).exec();
      const [decoratedThread] = await decorateThreads([populatedOriginal], req.userId);

      return res.status(201).json({
        reposted: true,
        thread: decoratedThread,
      });
    }

    const validationError = validateThreadInput({ content, media, quoteContent });

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const result = await createThreadDocument(req, {
      content,
      media,
      parentThreadId,
      repostOfId,
      quoteContent,
      audience,
    });

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const { thread, parentThread, repostTarget, isQuoteRepost } = result;
    const [decoratedThread] = await decorateThreads([thread], req.userId);

    if (parentThread) {
      await sendThreadReplyEvent(req, parentThread, thread);
    }

    if (repostTarget && isQuoteRepost) {
      sendThreadRepostedEvent(req, repostTarget, { quoteThreadId: thread._id, quoted: true });
    }

    await fanOutThreadCreated(req, thread);

    return res.status(201).json(decoratedThread);
  } catch (error) {
    console.error('[Thread] createThread error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getFeedThreads = async (req, res) => {
  try {
    const { page, limit } = getRequestPagination(req);

    const query = {
      audience: 'everyone',
      isDeleted: false,
      parentThread: null,
    };

    const findQuery = Thread.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const paginationMode = applyCursorOrOffset(findQuery, req, page, limit);
    if (paginationMode.error) {
      return res.status(paginationMode.error.status).json({ message: paginationMode.error.message });
    }

    const threads = await populateThreadQuery(findQuery).exec();

    const hasMore = threads.length > limit;
    const slicedThreads = hasMore ? threads.slice(0, limit) : threads;
    const decoratedThreads = await decorateThreads(slicedThreads, req.userId);

    return res.json({
      threads: decoratedThreads,
      nextCursor: hasMore ? buildCursor(slicedThreads[slicedThreads.length - 1]) : null,
      hasMore,
    });
  } catch (error) {
    console.error('[Thread] getFeedThreads error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getUserThreads = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page, limit } = getRequestPagination(req);

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const rootThreadsQuery = Thread.find({
      author: userId,
      parentThread: null,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const repostsQuery = ThreadRepost.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const rootThreadsMode = applyCursorOrOffset(rootThreadsQuery, req, page, limit);
    if (rootThreadsMode.error) {
      return res.status(rootThreadsMode.error.status).json({ message: rootThreadsMode.error.message });
    }

    const repostsMode = applyCursorOrOffset(repostsQuery, req, page, limit);
    if (repostsMode.error) {
      return res.status(repostsMode.error.status).json({ message: repostsMode.error.message });
    }

    const [rootThreads, repostRecords] = await Promise.all([
      populateThreadQuery(rootThreadsQuery).exec(),
      repostsQuery
        .populate({
          path: 'thread',
          match: { isDeleted: false },
          populate: [
            { path: 'author', select: THREAD_AUTHOR_SELECT },
            {
              path: 'repostOf',
              populate: { path: 'author', select: THREAD_AUTHOR_SELECT },
            },
          ],
        })
        .lean(),
    ]);

    const slicedRootThreads = rootThreads.slice(0, limit);
    const slicedRepostRecords = repostRecords.slice(0, limit);

    const repostThreads = slicedRepostRecords
      .filter((item) => item.thread)
      .map((item) => ({
        ...item.thread,
        createdAt: item.createdAt,
        repostedAt: item.createdAt,
        isSimpleRepost: true,
        repostId: item._id,
        repostedBy: userId,
      }));

    const combined = [...slicedRootThreads, ...repostThreads]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const threadDocs = combined.map((item) => (item.thread ? item.thread : item));
    const decoratedCombined = await decorateThreads(threadDocs, req.userId);

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
      threads: merged,
      nextCursor: merged.length ? merged[merged.length - 1].createdAt : null,
      hasMore: rootThreads.length > limit || repostRecords.length > limit,
    });
  } catch (error) {
    console.error('[Thread] getUserThreads error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getThreadReplies = async (req, res) => {
  try {
    const { threadId } = req.params;

    if (!isValidObjectId(threadId)) {
      return res.status(400).json({ message: 'Invalid threadId' });
    }

    const replies = await Thread.find({
      parentThread: threadId,
      isDeleted: false,
    })
      .sort({ createdAt: 1 })
      .populate('author', THREAD_AUTHOR_SELECT);

    const decoratedReplies = await decorateThreads(replies, req.userId);

    return res.json({
      replies: decoratedReplies.map((reply) => ({
        ...reply,
        repliesCount: reply.repliesCount || 0,
      })),
    });
  } catch (error) {
    console.error('[Thread] getThreadReplies error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getThreadById = async (req, res) => {
  try {
    const { threadId } = req.params;

    if (!isValidObjectId(threadId)) {
      return res.status(400).json({ message: 'Invalid threadId' });
    }

    const thread = await populateThreadQuery(
      Thread.findOneAndUpdate(
        { _id: threadId, isDeleted: false },
        { $inc: { viewsCount: 1 } },
        { new: true }
      )
    ).exec();

    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    const [decoratedThread] = await decorateThreads([thread], req.userId);
    return res.json(decoratedThread);
  } catch (error) {
    console.error('[Thread] getThreadById error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const likeThread = async (req, res) => {
  try {
    const { threadId } = req.params;

    if (!isValidObjectId(threadId)) {
      return res.status(400).json({ message: 'Invalid threadId' });
    }

    const thread = await Thread.findOne({ _id: threadId, isDeleted: false });
    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    const existingLike = await ThreadLike.findOne({ user: req.userId, thread: threadId });

    if (existingLike) {
      await ThreadLike.deleteOne({ _id: existingLike._id });
      thread.likes = thread.likes.filter((id) => id.toString() !== req.userId.toString());
      thread.likesCount = Math.max(0, (thread.likesCount || 0) - 1);
      await thread.save();

      return res.json({
        liked: false,
        likesCount: thread.likesCount,
      });
    }

    await ThreadLike.create({ user: req.userId, thread: threadId });

    if (!thread.likes.some((id) => id.toString() === req.userId.toString())) {
      thread.likes.push(req.userId);
    }
    thread.likesCount = (thread.likesCount || 0) + 1;
    await thread.save();

    await sendThreadLikeEvent(req, thread, req.userId);

    return res.json({
      liked: true,
      likesCount: thread.likesCount,
    });
  } catch (error) {
    console.error('[Thread] likeThread error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const unlikeThread = async (req, res) => {
  try {
    const { threadId } = req.params;

    if (!isValidObjectId(threadId)) {
      return res.status(400).json({ message: 'Invalid threadId' });
    }

    const thread = await Thread.findOne({ _id: threadId, isDeleted: false });
    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    const existingLike = await ThreadLike.findOne({ user: req.userId, thread: threadId });
    if (!existingLike) {
      return res.status(400).json({ message: 'Not liked yet' });
    }

    await ThreadLike.deleteOne({ _id: existingLike._id });
    thread.likes = thread.likes.filter((id) => id.toString() !== req.userId.toString());
    thread.likesCount = Math.max(0, (thread.likesCount || 0) - 1);
    await thread.save();

    return res.json({
      liked: false,
      likesCount: thread.likesCount,
    });
  } catch (error) {
    console.error('[Thread] unlikeThread error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const repostThread = async (req, res) => {
  try {
    const { threadId, quoteContent, content, media, audience } = req.body;
    const trimmedQuoteContent = typeof quoteContent === 'string' ? quoteContent.trim() : '';
    const validationError = trimmedQuoteContent
      ? validateThreadInput({ content, media, quoteContent })
      : null;

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    if (!isValidObjectId(threadId)) {
      return res.status(400).json({ message: 'Invalid threadId' });
    }

    if (trimmedQuoteContent) {
      const result = await createThreadDocument(req, {
        content,
        media,
        repostOfId: threadId,
        quoteContent: trimmedQuoteContent,
        audience,
      });

      if (result.error) {
        return res.status(result.error.status).json({ message: result.error.message });
      }

      const [decoratedThread] = await decorateThreads([result.thread], req.userId);
      sendThreadRepostedEvent(req, result.repostTarget, {
        quoteThreadId: result.thread._id,
        quoted: true,
      });
      await fanOutThreadCreated(req, result.thread);

      return res.status(201).json({
        reposted: true,
        thread: decoratedThread,
        repostsCount: result.repostTarget.repostsCount,
      });
    }

    const thread = await Thread.findOne({ _id: threadId, isDeleted: false });
    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    const existingRepost = await ThreadRepost.findOne({ user: req.userId, thread: threadId });

    if (existingRepost) {
      await ThreadRepost.deleteOne({ _id: existingRepost._id });
      thread.repostsCount = Math.max(0, (thread.repostsCount || 0) - 1);
      await thread.save();

      return res.json({
        reposted: false,
        repostsCount: thread.repostsCount,
      });
    }

    await ThreadRepost.create({ user: req.userId, thread: threadId });
    thread.repostsCount = (thread.repostsCount || 0) + 1;
    await thread.save();

    sendThreadRepostedEvent(req, thread);

    return res.json({
      reposted: true,
      repostsCount: thread.repostsCount,
    });
  } catch (error) {
    console.error('[Thread] repostThread error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const deleteThread = async (req, res) => {
  try {
    const { threadId } = req.params;

    if (!isValidObjectId(threadId)) {
      return res.status(400).json({ message: 'Invalid threadId' });
    }

    const thread = await Thread.findById(threadId);
    if (!thread || thread.isDeleted) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    if (thread.author.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this thread' });
    }

    thread.isDeleted = true;
    await thread.save();

    if (thread.parentThread) {
      await Thread.findByIdAndUpdate(thread.parentThread, { $inc: { repliesCount: -1 } });
    }

    if (thread.repostOf) {
      if (thread.quoteContent) {
        await Thread.findByIdAndUpdate(thread.repostOf, { $inc: { quotesCount: -1 } });
      } else {
        await Thread.findByIdAndUpdate(thread.repostOf, { $inc: { repostsCount: -1 } });
      }
    }

    await ThreadLike.deleteMany({ thread: threadId });
    await ThreadRepost.deleteMany({ thread: threadId });
    await ThreadComment.deleteMany({ thread_id: threadId });

    return res.json({ message: 'Thread deleted' });
  } catch (error) {
    console.error('[Thread] deleteThread error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const searchThreads = async (req, res) => {
  try {
    const { q } = req.query;
    const { page, limit } = getRequestPagination(req);

    if (!q || !q.trim()) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const regex = new RegExp(q.trim(), 'i');
    const searchQuery = Thread.find({
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

    const threads = await populateThreadQuery(searchQuery).exec();
    const hasMore = threads.length > limit;
    const slicedThreads = hasMore ? threads.slice(0, limit) : threads;

    const decoratedThreads = await decorateThreads(slicedThreads, req.userId);

    return res.json({
      page,
      limit,
      threads: decoratedThreads,
      nextCursor: hasMore && slicedThreads.length ? slicedThreads[slicedThreads.length - 1].createdAt : null,
      hasMore,
    });
  } catch (error) {
    console.error('[Thread] searchThreads error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getTrendingThreads = async (req, res) => {
  try {
    const since = new Date(Date.now() - (48 * 60 * 60 * 1000));

    const rankedIds = await Thread.aggregate([
      {
        $match: {
          createdAt: { $gte: since },
          isDeleted: false,
          parentThread: null,
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

    const threads = await populateThreadQuery(
      Thread.find({ _id: { $in: sortedIds } })
    ).exec();

    const threadMap = new Map(threads.map((thread) => [thread._id.toString(), thread]));
    const orderedThreads = sortedIds
      .map((id) => threadMap.get(id.toString()))
      .filter(Boolean);

    const decoratedThreads = await decorateThreads(orderedThreads, req.userId);
    const rankedThreads = decoratedThreads.map((thread) => ({
      ...thread,
      trendingScore: scoreMap.get(thread._id.toString()) || 0,
    }));

    return res.json({ threads: rankedThreads });
  } catch (error) {
    console.error('[Thread] getTrendingThreads error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const uploadThreadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image file' });
    }

    if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ message: 'Only image uploads are supported for threads' });
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
    console.error('[Thread] uploadThreadImage error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createThread,
  getFeedThreads,
  getUserThreads,
  getThreadReplies,
  getThreadById,
  likeThread,
  unlikeThread,
  repostThread,
  deleteThread,
  searchThreads,
  getTrendingThreads,
  uploadThreadImage,
};
