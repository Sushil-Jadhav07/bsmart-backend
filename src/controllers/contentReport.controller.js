const mongoose = require('mongoose');
const ContentReport = require('../models/ContentReport');
const Post = require('../models/Post');
const StoryItem = require('../models/StoryItem');
const Ad = require('../models/Ad');
const Comment = require('../models/Comment');

const REPORT_REASONS = [
  'I just don\'t like it',
  'Bullying or unwanted contact',
  'Suicide, self-injury or eating disorders',
  'Violence, hate or exploitation',
  'Selling or promoting restricted items',
  'Nudity or sexual activity',
  'Scam, fraud or spam',
  'False information',
];

const resolveContent = async (contentType, contentId) => {
  if (!mongoose.Types.ObjectId.isValid(contentId)) {
    return { error: { status: 400, message: 'Invalid content_id' } };
  }

  const objectId = new mongoose.Types.ObjectId(contentId);

  if (contentType === 'post' || contentType === 'reel') {
    const item = await Post.findOne({
      _id: objectId,
      isDeleted: false,
      type: contentType,
    }).select('_id user_id caption type').lean();
    if (!item) return { error: { status: 404, message: `${contentType} not found` } };
    return { ownerId: item.user_id, item };
  }

  if (contentType === 'story') {
    const item = await StoryItem.findOne({
      _id: objectId,
      isDeleted: false,
    }).select('_id user_id story_id media').lean();
    if (!item) return { error: { status: 404, message: 'story not found' } };
    return { ownerId: item.user_id, item };
  }

  if (contentType === 'ad') {
    const item = await Ad.findOne({
      _id: objectId,
      isDeleted: false,
    }).select('_id user_id vendor_id caption content_type').lean();
    if (!item) return { error: { status: 404, message: 'ad not found' } };
    return { ownerId: item.user_id, item };
  }

  if (contentType === 'comment') {
    const item = await Comment.findOne({
      _id: objectId,
      isDeleted: false,
    }).select('_id post_id user.id text').lean();
    if (!item) return { error: { status: 404, message: 'comment not found' } };
    return { ownerId: item.user.id, item };
  }

  return { error: { status: 400, message: 'Invalid content_type' } };
};

exports.getReportReasons = async (req, res) => {
  res.json({
    success: true,
    reasons: REPORT_REASONS,
  });
};

exports.createContentReport = async (req, res) => {
  try {
    const reporterId = req.userId;
    const { content_type, content_id, reason, details = '' } = req.body;

    if (!content_type || !content_id || !reason) {
      return res.status(400).json({ message: 'content_type, content_id and reason are required' });
    }
    if (!REPORT_REASONS.includes(reason)) {
      return res.status(400).json({ message: 'Invalid reason' });
    }

    const resolved = await resolveContent(content_type, content_id);
    if (resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message });
    }

    if (String(resolved.ownerId) === String(reporterId)) {
      return res.status(400).json({ message: 'You cannot report your own content' });
    }

    const existing = await ContentReport.findOne({
      reporter_id: reporterId,
      content_type,
      content_id,
    }).lean();

    if (existing) {
      return res.status(400).json({ message: 'You have already reported this content' });
    }

    const report = await ContentReport.create({
      reporter_id: reporterId,
      content_type,
      content_id,
      owner_id: resolved.ownerId,
      reason,
      details,
    });

    return res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      report: {
        _id: report._id,
        reporter_id: report.reporter_id,
        owner_id: report.owner_id,
        content_type: report.content_type,
        content_id: report.content_id,
        reason: report.reason,
        details: report.details,
        status: report.status,
        createdAt: report.createdAt,
      },
    });
  } catch (error) {
    console.error('[createContentReport]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getMyContentReports = async (req, res) => {
  try {
    const reports = await ContentReport.find({ reporter_id: req.userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      total: reports.length,
      reports,
    });
  } catch (error) {
    console.error('[getMyContentReports]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.listContentReports = async (req, res) => {
  try {
    const { content_type, status } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = {};
    if (content_type) filter.content_type = content_type;
    if (status) filter.status = status;

    const total = await ContentReport.countDocuments(filter);

    const reports = await ContentReport.find(filter)
      .populate('reporter_id', 'username full_name avatar_url')
      .populate('owner_id', 'username full_name avatar_url')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit) || 1,
      reports,
    });
  } catch (error) {
    console.error('[listContentReports]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateContentReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_note = '' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid report id' });
    }
    if (!['pending', 'reviewed', 'action_taken', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const report = await ContentReport.findById(id);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    report.status = status;
    report.admin_note = admin_note;
    report.reviewed_by = req.user._id;
    report.reviewed_at = new Date();
    await report.save();

    return res.json({
      success: true,
      message: 'Report updated successfully',
      report,
    });
  } catch (error) {
    console.error('[updateContentReportStatus]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
