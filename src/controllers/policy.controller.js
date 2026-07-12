'use strict';

const Policy = require('../models/Policy');

const TYPE_PATTERN = /^[a-z0-9_-]+$/;
const VALID_STATUSES = ['draft', 'published'];
const VALID_APP_SOURCES = ['member', 'vendor', 'both'];

// ─── ADMIN ───────────────────────────────────────────────────────────────────

// GET /api/policies/types — lightweight list for admin dropdowns/menus
exports.listPolicyTypes = async (req, res) => {
  try {
    const types = await Policy.find({})
      .select('type title status app_source version updatedAt')
      .sort({ type: 1 })
      .lean();

    return res.json({ success: true, data: types });
  } catch (err) {
    console.error('[listPolicyTypes]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/policies — full documents for every policy, keyed by type
exports.getAllPolicies = async (req, res) => {
  try {
    const docs = await Policy.find({})
      .select('-history')
      .populate('updated_by', 'full_name email');

    const data = {};
    docs.forEach((doc) => { data[doc.type] = doc; });

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[getAllPolicies]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/policies — create a new policy type (e.g. "cookies", "shipping")
exports.createPolicy = async (req, res) => {
  try {
    const { type, title, content, status, app_source } = req.body;

    if (!type || typeof type !== 'string' || !TYPE_PATTERN.test(type.trim().toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'type is required and may only contain lowercase letters, numbers, hyphens and underscores',
      });
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: 'title is required' });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be draft or published' });
    }
    if (app_source && !VALID_APP_SOURCES.includes(app_source)) {
      return res.status(400).json({ success: false, message: 'app_source must be member, vendor, or both' });
    }

    const normalizedType = type.trim().toLowerCase();
    const existing = await Policy.findOne({ type: normalizedType });
    if (existing) {
      return res.status(409).json({ success: false, message: `Policy type "${normalizedType}" already exists` });
    }

    const doc = await Policy.create({
      type: normalizedType,
      title: title.trim(),
      content: typeof content === 'string' ? content.trim() : '',
      status: status ?? 'draft',
      app_source: app_source ?? 'both',
      updated_by: req.user._id,
    });

    return res.status(201).json({ success: true, message: 'Policy created successfully', data: doc });
  } catch (err) {
    console.error('[createPolicy]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/policies/:type/meta — edit type metadata (title, app_source) only.
// Does not touch content, version, history, or status.
exports.updatePolicyMeta = async (req, res) => {
  try {
    const { type } = req.params;
    const { title, app_source } = req.body;

    const updates = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ success: false, message: 'title must be a non-empty string' });
      }
      updates.title = title.trim();
    }
    if (app_source !== undefined) {
      if (!VALID_APP_SOURCES.includes(app_source)) {
        return res.status(400).json({ success: false, message: 'app_source must be member, vendor, or both' });
      }
      updates.app_source = app_source;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'Provide title and/or app_source to update' });
    }
    updates.updated_by = req.user._id;

    const doc = await Policy.findOneAndUpdate(
      { type: type.toLowerCase() },
      { $set: updates },
      { new: true, runValidators: true }
    )
      .select('-history')
      .populate('updated_by', 'full_name email');

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    return res.json({ success: true, message: 'Policy updated successfully', data: doc });
  } catch (err) {
    console.error('[updatePolicyMeta]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/policies/:type — permanently deletes the policy, including its content and history
exports.deletePolicy = async (req, res) => {
  try {
    const { type } = req.params;

    const doc = await Policy.findOneAndDelete({ type: type.toLowerCase() });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    return res.json({ success: true, message: 'Policy deleted successfully' });
  } catch (err) {
    console.error('[deletePolicy]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/policies/:type — save content only (status is changed via PATCH /:type/status)
exports.updatePolicy = async (req, res) => {
  try {
    const { type } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ success: false, message: 'content is required' });
    }

    const doc = await Policy.findOne({ type: type.toLowerCase() });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    // Archive current version to history (skip on first save — empty seed
    // content would fail the history.content `required` validator)
    if (doc.content) {
      doc.history.push({
        content:  doc.content,
        status:   doc.status,
        version:  doc.version,
        saved_by: req.user._id,
        saved_at: new Date(),
      });

      // Keep only last 20 history entries
      if (doc.history.length > 20) {
        doc.history = doc.history.slice(-20);
      }
    }

    doc.content    = content.trim();
    doc.version    = doc.version + 1;
    doc.updated_by = req.user._id;

    await doc.save();

    const result = await Policy.findById(doc._id)
      .select('-history')
      .populate('updated_by', 'full_name email');

    return res.json({ success: true, message: 'Policy saved successfully', data: result });
  } catch (err) {
    console.error('[updatePolicy]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/policies/:type/status — toggle published/draft only, no history entry
exports.updatePolicyStatus = async (req, res) => {
  try {
    const { type } = req.params;
    const { status } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be draft or published' });
    }

    const doc = await Policy.findOneAndUpdate(
      { type: type.toLowerCase() },
      { status, updated_by: req.user._id },
      { new: true, select: 'type status updatedAt' }
    );

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    return res.json({ success: true, message: `Status updated to ${status}`, data: doc });
  } catch (err) {
    console.error('[updatePolicyStatus]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/policies/:type/history — last 20 saved versions, newest first
exports.getPolicyHistory = async (req, res) => {
  try {
    const { type } = req.params;
    const doc = await Policy.findOne({ type: type.toLowerCase() })
      .select('history')
      .populate('history.saved_by', 'full_name');

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    const history = [...doc.history]
      .reverse()
      .map((h) => ({
        _id:      h._id,
        version:  h.version,
        status:   h.status,
        saved_by: h.saved_by,
        saved_at: h.saved_at,
      }));

    return res.json({ success: true, data: history });
  } catch (err) {
    console.error('[getPolicyHistory]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUBLIC ──────────────────────────────────────────────────────────────────

// GET /api/policies/:type — used by the mobile app to display a policy page
exports.getPolicyByType = async (req, res) => {
  try {
    const { type } = req.params;

    const doc = await Policy.findOne({ type: type.toLowerCase() })
      .select('-history')
      .populate('updated_by', 'full_name');

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    return res.json({ success: true, data: doc });
  } catch (err) {
    console.error('[getPolicyByType]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/policies/app/member and /api/policies/app/vendor — published
// policies for that app (plus any marked "both"). Used by the mobile apps.
// Optional ?type= narrows it down to a single policy within that app.
exports.getPoliciesByApp = async (req, res) => {
  try {
    const { appSource } = req.params;
    const { type } = req.query;

    if (!['member', 'vendor'].includes(appSource)) {
      return res.status(400).json({ success: false, message: 'appSource must be member or vendor' });
    }

    const filter = {
      app_source: { $in: [appSource, 'both'] },
      status: 'published',
    };
    if (type) {
      filter.type = type.toLowerCase();
    }

    const docs = await Policy.find(filter)
      .select('-history')
      .sort({ type: 1 });

    if (type && docs.length === 0) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    return res.json({ success: true, total: docs.length, data: docs });
  } catch (err) {
    console.error('[getPoliciesByApp]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
