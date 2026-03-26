const Highlight     = require('../models/Highlight');
const HighlightItem = require('../models/HighlightItem');
const StoryItem     = require('../models/StoryItem');

// POST /api/highlights
exports.createHighlight = async (req, res) => {
  try {
    const { title, cover_url } = req.body;
    if (!title) return res.status(400).json({ message: 'title required' });
    const count = await Highlight.countDocuments({ user_id: req.userId });
    const highlight = await Highlight.create({
      user_id: req.userId, title, cover_url: cover_url || '', order: count
    });
    res.status(201).json(highlight);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// GET /api/highlights/user/:userId
exports.getUserHighlights = async (req, res) => {
  try {
    const highlights = await Highlight.find({ user_id: req.params.userId })
      .sort({ order: 1 }).lean();
    res.json(highlights);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// POST /api/highlights/:id/items  — body: { story_item_ids: [...] }
exports.addItems = async (req, res) => {
  try {
    const highlight = await Highlight.findById(req.params.id);
    if (!highlight) return res.status(404).json({ message: 'Not found' });
    if (highlight.user_id.toString() !== req.userId)
      return res.status(403).json({ message: 'Forbidden' });

    const ids = Array.isArray(req.body.story_item_ids) ? req.body.story_item_ids : [];
    if (!ids.length) return res.status(400).json({ message: 'story_item_ids required' });

    const currentCount = highlight.items_count;
    const docs = ids.map((sid, i) => ({
      highlight_id: highlight._id, story_item_id: sid,
      user_id: req.userId, order: currentCount + i
    }));

    // insertMany with ordered:false skips duplicates silently
    const inserted = await HighlightItem.insertMany(docs, { ordered: false })
      .catch(err => err.insertedDocs || []);  // handle duplicate key errors gracefully

    highlight.items_count = await HighlightItem.countDocuments({ highlight_id: highlight._id });
    // auto-set cover_url to first item's thumbnail if not set
    if (!highlight.cover_url && inserted.length) {
      const firstItem = await StoryItem.findById(ids[0]).lean();
      if (firstItem) highlight.cover_url = firstItem.media?.thumbnail || firstItem.media?.url || '';
    }
    await highlight.save();
    res.json({ success: true, items_count: highlight.items_count });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// GET /api/highlights/:id/items
exports.getItems = async (req, res) => {
  try {
    const items = await HighlightItem.find({ highlight_id: req.params.id })
      .sort({ order: 1 })
      .populate('story_item_id')   // gets the full media, texts etc.
      .lean();
    res.json(items.map(i => ({ ...i.story_item_id, _itemId: i._id, order: i.order })));
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// PATCH /api/highlights/:id
exports.updateHighlight = async (req, res) => {
  try {
    const highlight = await Highlight.findById(req.params.id);
    if (!highlight) return res.status(404).json({ message: 'Not found' });
    if (highlight.user_id.toString() !== req.userId)
      return res.status(403).json({ message: 'Forbidden' });
    const { title, cover_url } = req.body;
    if (title)     highlight.title     = title;
    if (cover_url) highlight.cover_url = cover_url;
    await highlight.save();
    res.json(highlight);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// DELETE /api/highlights/:id/items/:itemId
exports.removeItem = async (req, res) => {
  try {
    const item = await HighlightItem.findById(req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Not found' });
    const highlight = await Highlight.findById(item.highlight_id);
    if (!highlight || highlight.user_id.toString() !== req.userId)
      return res.status(403).json({ message: 'Forbidden' });
    await item.deleteOne();
    highlight.items_count = Math.max(0, highlight.items_count - 1);
    await highlight.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// DELETE /api/highlights/:id  (entire highlight)
exports.deleteHighlight = async (req, res) => {
  try {
    const highlight = await Highlight.findById(req.params.id);
    if (!highlight) return res.status(404).json({ message: 'Not found' });
    if (highlight.user_id.toString() !== req.userId)
      return res.status(403).json({ message: 'Forbidden' });
    await HighlightItem.deleteMany({ highlight_id: highlight._id });
    await highlight.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};