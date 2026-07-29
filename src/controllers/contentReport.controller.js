const mongoose = require('mongoose');
const ContentReport = require('../models/ContentReport');
const Post = require('../models/Post');
const StoryItem = require('../models/StoryItem');
const Ad = require('../models/Ad');
const Comment = require('../models/Comment');
const Tweet = require('../models/tweet.model');
const PromoteReel = require('../models/PromoteReel');
const User = require('../models/User');
const sendNotification = require('../utils/sendNotification');

const REPORT_REASONS = [
  'Spam',
  'Fake Information',
  'Hate Speech',
  'Nudity',
  'Violence',
  'Copyright Violation',
  'Harassment',
  'Scam/Fraud',
  'Illegal Content',
  'Other',
];

const VALID_ACTIONS = ['none', 'content_removed', 'warning_issued', 'temporary_suspension', 'permanent_ban'];

const fireAndForget = (label, promise) => {
  promise.catch((err) => console.error(`[ContentReport] ${label} failed:`, err.message));
};

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((a) => a && typeof a.url === 'string' && a.url.trim())
    .map((a) => ({
      url: a.url.trim(),
      type: ['image', 'video'].includes(a.type) ? a.type : 'image',
    }));
}

// Soft-delete the underlying content — every content model already uses an
// isDeleted flag, so this is a generic dispatch by content_type.
const CONTENT_MODELS = {
  post: Post,
  reel: Post,
  story: StoryItem,
  ad: Ad,
  comment: Comment,
  tweet: Tweet,
  promote_reel: PromoteReel,
};

async function removeContent(contentType, contentId) {
  const Model = CONTENT_MODELS[contentType];
  if (!Model) return false;
  const result = await Model.updateOne({ _id: contentId }, { $set: { isDeleted: true } });
  return result.modifiedCount > 0;
}

// Suspend/ban the content owner — mirrors PATCH /api/users/:id/status exactly
async function applyUserPenalty(userId, actionTaken, adminId, adminNote) {
  const user = await User.findById(userId);
  if (!user) return;

  const banType = actionTaken === 'permanent_ban' ? 'permanent' : 'temporary';
  user.is_active = false;
  user.ban_type = banType;
  user.ban_until = banType === 'temporary'
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : null;
  user.ban_reason = adminNote || (banType === 'temporary'
    ? 'Banned for 30 days following a content report'
    : 'Permanently banned following a content report');
  user.banned_by = adminId;
  user.banned_at = new Date();
  await user.save();
}

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

  if (contentType === 'tweet') {
    const item = await Tweet.findOne({
      _id: objectId,
      isDeleted: false,
    }).select('_id author content media').lean();
    if (!item) return { error: { status: 404, message: 'tweet not found' } };
    return { ownerId: item.author, item };
  }

  if (contentType === 'promote_reel') {
    const item = await PromoteReel.findOne({
      _id: objectId,
      isDeleted: false,
    }).select('_id user_id caption').lean();
    if (!item) return { error: { status: 404, message: 'promote_reel not found' } };
    return { ownerId: item.user_id, item };
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
    const { content_type, content_id, reason, details = '', attachments } = req.body;

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
      attachments: normalizeAttachments(attachments),
    });

    fireAndForget('createContentReport admin notify', (async () => {
      const admins = await User.find({ role: { $in: ['admin', 'sales'] } }).select('_id').lean();
      await Promise.allSettled(
        admins.map((a) => sendNotification(req.app, {
          recipient: a._id,
          sender: reporterId,
          type: 'content_report_admin',
          message: `New ${content_type} report — ${reason}`,
          link: '/admin/content-reports',
        }))
      );
    })());

    return res.status(201).json({
      success: true,
      message: 'Thank you. Your report has been submitted successfully.',
      report: {
        _id: report._id,
        reporter_id: report.reporter_id,
        owner_id: report.owner_id,
        content_type: report.content_type,
        content_id: report.content_id,
        reason: report.reason,
        details: report.details,
        attachments: report.attachments,
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

// DELETE /api/content-reports/:id — reporter (own report), or admin/sales (any)
exports.deleteContentReport = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid report id' });
    }

    const report = await ContentReport.findById(id);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const isOwner = String(report.reporter_id) === String(req.userId);
    const isStaff = ['admin', 'sales'].includes(req.user?.role);
    if (!isOwner && !isStaff) {
      return res.status(403).json({ message: 'Not authorized to delete this report' });
    }

    await report.deleteOne();

    return res.json({ success: true, message: 'Report deleted successfully' });
  } catch (error) {
    console.error('[deleteContentReport]', error);
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
    const { status, admin_note = '', action_taken } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid report id' });
    }
    if (!['pending', 'reviewed', 'action_taken', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    if (action_taken !== undefined && !VALID_ACTIONS.includes(action_taken)) {
      return res.status(400).json({ message: `action_taken must be one of: ${VALID_ACTIONS.join(', ')}` });
    }

    const report = await ContentReport.findById(id);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    report.status = status;
    report.admin_note = admin_note;
    report.reviewed_by = req.user._id;
    report.reviewed_at = new Date();
    if (action_taken !== undefined) {
      report.action_taken = action_taken;
    }
    await report.save();

    // Apply the real effect of the chosen action
    if (action_taken === 'content_removed') {
      await removeContent(report.content_type, report.content_id);
    } else if (action_taken === 'temporary_suspension' || action_taken === 'permanent_ban') {
      await applyUserPenalty(report.owner_id, action_taken, req.user._id, admin_note);
    }

    fireAndForget('updateContentReportStatus reporter notify', sendNotification(req.app, {
      recipient: report.reporter_id,
      sender:    req.user._id,
      type:      'content_report_status',
      message:   `Your ${report.content_type} report has been ${status.replace(/_/g, ' ')}`,
      link:      '/content-reports',
    }));

    if (action_taken && action_taken !== 'none') {
      const ownerMessages = {
        content_removed:      'Content you posted was removed for violating our guidelines.',
        warning_issued:       'You received a warning regarding content you posted.',
        temporary_suspension: 'Your account has been temporarily suspended following a content report.',
        permanent_ban:        'Your account has been permanently banned following a content report.',
      };
      fireAndForget('updateContentReportStatus owner notify', sendNotification(req.app, {
        recipient: report.owner_id,
        sender:    req.user._id,
        type:      'content_moderation_action',
        message:   ownerMessages[action_taken],
        link:      '/notifications',
      }));
    }

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
