const Story = require('../models/Story');
const StoryItem = require('../models/StoryItem');
const StoryView = require('../models/StoryView');
const User = require('../models/User');

const nowUtc = () => new Date();
const addHours = (date, h) => new Date(date.getTime() + h * 60 * 60 * 1000);

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
      if (!media.url || !media.type || !['image','reel'].includes(media.type)) {
        return res.status(400).json({ message: 'invalid media' });
      }
      const durationSec = media.durationSec ?? (media.type === 'image' ? 15 : undefined);
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
          height: media.height
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
      .populate('user_id', 'username avatar_url followers_count following_count');

    const results = [];
    for (const s of stories) {
      const preview = await StoryItem.findOne({ story_id: s._id, isDeleted: false }).sort({ order: 1 });
      const itemIds = await StoryItem.find({ story_id: s._id, isDeleted: false }).select('_id').lean();
      const ids = itemIds.map(i => i._id);
      const viewedCount = await StoryView.countDocuments({ story_item_id: { $in: ids }, viewer_id: userId });
      const seen = ids.length > 0 && viewedCount === ids.length;
      const previewObj = preview ? (preview.toObject ? preview.toObject() : preview) : null;
      if (previewObj && previewObj.media) {
        previewObj.media = [previewObj.media];
      }
      results.push({
        _id: s._id,
        user: s.user_id,
        items_count: s.items_count,
        views_count: s.views_count || 0,
        preview_item: previewObj,
        seen
      });
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
    const itemsResponse = items.map(it => {
      const obj = it.toObject ? it.toObject() : it;
      obj.media = obj.media ? [obj.media] : [];
      return obj;
    });
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
    await story.deleteOne();
    res.json({ message: 'Story deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
