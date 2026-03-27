const Story = require('../models/Story');
const StoryItem = require('../models/StoryItem');
const StoryView = require('../models/StoryView');
const StoryLike = require('../models/StoryLike');
const User = require('../models/User');
const sendNotification = require('../utils/sendNotification');
const mongoose = require('mongoose');

const nowUtc = () => new Date();
const addHours = (date, h) => new Date(date.getTime() + h * 60 * 60 * 1000);

const normalizeStoryItemMedia = (item, extra = {}) => {
  if (!item) return null;
  const obj = item.toObject ? item.toObject() : item;
  obj.media = obj.media ? [obj.media] : [];
  return { ...obj, ...extra };
};

const buildStoryFeedItem = async (story, viewerId) => {
  const preview = await StoryItem.findOne({ story_id: story._id, isDeleted: false }).sort({ order: 1 });
  const itemIds = await StoryItem.find({ story_id: story._id, isDeleted: false }).select('_id').lean();
  const ids = itemIds.map((item) => item._id);
  const viewedCount = viewerId
    ? await StoryView.countDocuments({ story_item_id: { $in: ids }, viewer_id: viewerId })
    : 0;
  const seen = viewerId ? ids.length > 0 && viewedCount === ids.length : false;

  return {
    _id: story._id,
    user: story.user_id,
    items_count: story.items_count,
    views_count: story.views_count || 0,
    preview_item: normalizeStoryItemMedia(preview),
    seen
  };
};

exports.createStory = async (req, res) => {
  try {
    const userId = req.userId;
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ message: 'items required' });

    const now = nowUtc();
    let story = await Story.findOne({ user_id: userId, isArchived: false, expiresAt: { $gt: now } });
    if (!story) {
      story = await Story.create({
        user_id: userId,
        items_count: 0,
        views_count: 0,
        expiresAt: addHours(now, 24),
        isArchived: false
      });
    }

    const currentCount = story.items_count || 0;
    const expiresAt = story.expiresAt;

    const docs = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const mediaArr = Array.isArray(it.media) ? it.media : (it.media ? [it.media] : []);
      if (!mediaArr.length) {
        return res.status(400).json({ message: 'media array with at least one item is required' });
      }
      const media = mediaArr[0] || {};
      if (!media.url || !media.type || !['image', 'video', 'reel'].includes(media.type)) {
        return res.status(400).json({ message: 'invalid media — type must be image, video, or reel' });
      }
      // Default duration: 15s for images, 30s for video/reel (actual value sent by client overrides)
      const durationSec = media.durationSec ?? (media.type === 'image' ? 15 : 30);
      const doc = {
        story_id: story._id,
        user_id: userId,
        order: currentCount + i,
        media: {
          url: media.url,
          type: media.type,
          thumbnail: media.thumbnail,
          durationSec,
          width: media.width,
          height: media.height,
          hls: media.hls === true || (media.url && media.url.endsWith('.m3u8'))
        },
        transform: {
          x: it.transform?.x ?? 0.5,
          y: it.transform?.y ?? 0.5,
          scale: it.transform?.scale ?? 1,
          rotation: it.transform?.rotation ?? 0,
          boxWidth: it.transform?.boxWidth,
          boxHeight: it.transform?.boxHeight
        },
        filter: {
          name: it.filter?.name ?? 'none',
          intensity: it.filter?.intensity
        },
        texts: Array.isArray(it.texts) ? it.texts : [],
        mentions: Array.isArray(it.mentions) ? it.mentions.map(m => ({
          user_id: m.user_id,
          username: m.username,
          x: m.x,
          y: m.y
        })) : [],
        expiresAt,
        isDeleted: false
      };
      docs.push(doc);
    }

    const createdItems = await StoryItem.insertMany(docs);
    story.items_count = currentCount + createdItems.length;
    await story.save();

    // Wrap media object into array for response compatibility
    const itemsResponse = createdItems.map(it => {
      const obj = it.toObject ? it.toObject() : it;
      obj.media = obj.media ? [obj.media] : [];
      return obj;
    });
    res.json({ success: true, story, items: itemsResponse });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getStoriesFeed = async (req, res) => {
  try {
    const userId = req.userId;
    const now = nowUtc();
    const stories = await Story.find({ expiresAt: { $gt: now }, isArchived: false, items_count: { $gt: 0 } })
      .sort({ createdAt: -1 })
      .populate('user_id', 'username avatar_url followers_count following_count gender location');

    const results = [];
    for (const s of stories) {
      results.push(await buildStoryFeedItem(s, userId));
    }

    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getStoriesByUserId = async (req, res) => {
  try {
    const viewerId = req.userId;
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const user = await User.findById(userId).select('username avatar_url followers_count following_count gender location').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const now = nowUtc();
    const stories = await Story.find({
      user_id: userId,
      expiresAt: { $gt: now },
      isArchived: false,
      items_count: { $gt: 0 }
    })
      .sort({ createdAt: -1 })
      .populate('user_id', 'username avatar_url followers_count following_count gender location');

    const results = [];
    for (const story of stories) {
      results.push(await buildStoryFeedItem(story, viewerId));
    }

    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getStoryItems = async (req, res) => {
  try {
    const { storyId } = req.params;
    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    const now = nowUtc();
    if (story.expiresAt <= now && !story.isArchived) {
      story.isArchived = true;
      story.archivedAt = now;
      await story.save();
    }
    const items = await StoryItem.find({ story_id: storyId, isDeleted: false }).sort({ order: 1 });
    const itemIds = items.map((item) => item._id);
    const likedIds = req.userId
      ? await StoryLike.distinct('story_item_id', { story_item_id: { $in: itemIds }, user_id: req.userId })
      : [];
    const likedSet = new Set(likedIds.map((id) => String(id)));
    const itemsResponse = items.map((item) => normalizeStoryItemMedia(item, { is_liked: likedSet.has(String(item._id)) }));
    res.json(itemsResponse);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.viewStoryItem = async (req, res) => {
  try {
    const userId = req.userId;
    const { itemId } = req.params;
    const item = await StoryItem.findById(itemId);
    if (!item) return res.status(404).json({ message: 'Story item not found' });
    const story = await Story.findById(item.story_id);
    if (!story) return res.status(404).json({ message: 'Story not found' });

    const existing = await StoryView.findOne({ story_item_id: itemId, viewer_id: userId });
    if (!existing) {
      await StoryView.create({
        story_id: story._id,
        story_item_id: itemId,
        owner_id: story.user_id,
        viewer_id: userId,
        viewedAt: nowUtc()
      });
      await Story.findByIdAndUpdate(story._id, { $inc: { views_count: 1 } });

      try {
        const storyDoc = await Story.findById(story._id).select('user_id').lean();
        if (storyDoc && storyDoc.user_id.toString() !== userId.toString()) {
          const viewer = await User.findById(userId).select('username').lean();
          if (viewer) {
            await sendNotification(req.app, {
              recipient: storyDoc.user_id,
              sender: userId,
              type: 'story_view',
              message: `${viewer.username} viewed your story`,
              link: `/stories/${story._id}`
            });
          }
        }
      } catch (notifErr) {
        console.error('Story view notification error:', notifErr);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getStoryViews = async (req, res) => {
  try {
    const userId = req.userId;
    const { storyId } = req.params;
    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    if (story.user_id.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const views = await StoryView.find({ story_id: storyId })
      .sort({ viewedAt: -1 })
      .populate('viewer_id', 'username avatar_url followers_count following_count');
    const unique = {};
    const result = [];
    for (const v of views) {
      const vid = v.viewer_id?._id?.toString() || (v.viewer_id?.toString());
      if (!unique[vid]) {
        unique[vid] = true;
        result.push({ viewer: v.viewer_id, viewedAt: v.viewedAt });
      }
    }
    const total_views = views.length;
    const unique_viewers = Object.keys(unique).length;
    res.json({ viewers: result, total_views, unique_viewers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getStoriesArchive = async (req, res) => {
  try {
    const userId = req.userId;
    const now = nowUtc();
    const toArchive = await Story.find({ user_id: userId, expiresAt: { $lte: now }, isArchived: false });
    for (const s of toArchive) {
      s.isArchived = true;
      s.archivedAt = now;
      await s.save();
    }
    const stories = await Story.find({
      user_id: userId,
      $or: [{ isArchived: true }, { expiresAt: { $lte: now } }]
    }).sort({ createdAt: -1 });
    res.json({ stories });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteStory = async (req, res) => {
  try {
    const userId = req.userId;
    const { storyId } = req.params;
    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    if (story.user_id.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    await StoryItem.deleteMany({ story_id: storyId });
    await StoryView.deleteMany({ story_id: storyId });
    await StoryLike.deleteMany({ story_id: storyId });
    await story.deleteOne();
    res.json({ message: 'Story deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteStoryItem = async (req, res) => {
  try {
    const userId = req.userId;
    const { itemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ message: 'Invalid itemId' });
    }

    const item = await StoryItem.findById(itemId);
    if (!item) return res.status(404).json({ message: 'Story item not found' });

    const story = await Story.findById(item.story_id);
    if (!story) return res.status(404).json({ message: 'Story not found' });

    if (story.user_id.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await StoryView.deleteMany({ story_item_id: item._id });
    await StoryLike.deleteMany({ story_item_id: item._id });
    await item.deleteOne();

    const remainingItems = await StoryItem.countDocuments({ story_id: story._id, isDeleted: false });

    if (remainingItems <= 0) {
      await StoryView.deleteMany({ story_id: story._id });
      await story.deleteOne();
      return res.json({
        success: true,
        message: 'Story item deleted successfully',
        story_deleted: true,
        items_count: 0,
      });
    }

    story.items_count = remainingItems;
    await story.save();

    res.json({
      success: true,
      message: 'Story item deleted successfully',
      story_deleted: false,
      items_count: remainingItems,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.toggleStoryItemLike = async (req, res) => {
  try {
    const userId = req.userId;
    const { itemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ message: 'Invalid itemId' });
    }

    const item = await StoryItem.findById(itemId);
    if (!item || item.isDeleted) {
      return res.status(404).json({ message: 'Story item not found' });
    }

    const story = await Story.findById(item.story_id);
    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    if (String(story.user_id) === String(userId)) {
      return res.status(400).json({ message: 'You cannot like your own story' });
    }

    const existing = await StoryLike.findOne({ story_item_id: item._id, user_id: userId });
    let liked = false;

    if (existing) {
      await existing.deleteOne();
      item.likes_count = Math.max(0, Number(item.likes_count || 0) - 1);
      await item.save();
    } else {
      await StoryLike.create({
        story_id: story._id,
        story_item_id: item._id,
        owner_id: story.user_id,
        user_id: userId,
        likedAt: nowUtc(),
      });
      item.likes_count = Number(item.likes_count || 0) + 1;
      await item.save();
      liked = true;

      try {
        const viewer = await User.findById(userId).select('username').lean();
        if (viewer) {
          await sendNotification(req.app, {
            recipient: story.user_id,
            sender: userId,
            type: 'story_like',
            message: `${viewer.username} liked your story`,
            link: `/stories/${story._id}`,
          });
        }
      } catch (notifErr) {
        console.error('Story like notification error:', notifErr);
      }
    }

    res.json({
      success: true,
      liked,
      likes_count: item.likes_count,
      story_item_id: item._id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
