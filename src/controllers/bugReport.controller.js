'use strict';

const mongoose = require('mongoose');
const BugReport         = require('../models/BugReport');
const User               = require('../models/User');
const sendNotification    = require('../utils/sendNotification');

const VALID_CATEGORIES = [
  'app_crash', 'video_not_playing', 'login_issue', 'payment_issue',
  'rewards_issue', 'upload_issue', 'ui_problem', 'other',
];
const VALID_STATUSES  = ['new', 'in_progress', 'fixed', 'closed'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const VALID_OS_TYPES   = ['android', 'ios', 'windows', 'macos', 'linux', 'other'];
const VALID_NETWORK_TYPES = ['wifi', 'mobile_data', 'other'];

const fireAndForget = (label, promise) => {
  promise.catch((err) => console.error(`[BugReport] ${label} failed:`, err.message));
};

const notifyReporter = async (app, { recipient, sender = null, message }) => {
  try {
    await sendNotification(app, {
      recipient,
      sender,
      type: 'bug_report_status',
      message,
      link: '/bug-reports',
    });
  } catch (err) {
    console.error('[notifyReporter]', err.message);
  }
};

const notifyAdmins = async (app, { message, sender = null }) => {
  try {
    const admins = await User.find({ role: { $in: ['admin', 'sales'] } }).select('_id').lean();
    await Promise.allSettled(
      admins.map((a) =>
        sendNotification(app, {
          recipient: a._id,
          sender,
          type: 'bug_report_admin',
          message,
          link: '/admin/bug-reports',
        })
      )
    );
  } catch (err) {
    console.error('[notifyAdmins]', err.message);
  }
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

// ─── MEMBER / VENDOR ─────────────────────────────────────────────────────────

// POST /api/bug-reports — submit a bug report
exports.createBugReport = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      category, description, attachments,
      app_version, os_type, os_version, device_model, network_type,
    } = req.body;

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ success: false, message: 'description is required' });
    }

    // Normalize case — client platform APIs often report "iOS", "Android", "WiFi", etc.
    const normalizedOsType = typeof os_type === 'string' ? os_type.trim().toLowerCase() : '';
    const normalizedNetworkType = typeof network_type === 'string' ? network_type.trim().toLowerCase() : '';

    if (normalizedOsType && !VALID_OS_TYPES.includes(normalizedOsType)) {
      return res.status(400).json({ success: false, message: `os_type must be one of: ${VALID_OS_TYPES.join(', ')}` });
    }
    if (normalizedNetworkType && !VALID_NETWORK_TYPES.includes(normalizedNetworkType)) {
      return res.status(400).json({ success: false, message: `network_type must be one of: ${VALID_NETWORK_TYPES.join(', ')}` });
    }

    const doc = await BugReport.create({
      reporter_id:  userId,
      category,
      description:  description.trim(),
      attachments:  normalizeAttachments(attachments),
      app_version:  typeof app_version === 'string' ? app_version.trim() : '',
      os_type:      normalizedOsType,
      os_version:   typeof os_version === 'string' ? os_version.trim() : '',
      device_model: typeof device_model === 'string' ? device_model.trim() : '',
      network_type: normalizedNetworkType,
    });

    doc.ticket_id = `BUG-${doc._id.toString().slice(-8).toUpperCase()}`;
    await doc.save();

    fireAndForget('createBugReport admin notify', notifyAdmins(req.app, {
      message: `New bug report — ${category.replace(/_/g, ' ')} (${doc.ticket_id})`,
      sender:  userId,
    }));

    return res.status(201).json({
      success: true,
      message: 'Thank you. Your report has been submitted successfully.',
      data: doc,
    });
  } catch (err) {
    console.error('[createBugReport]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/bug-reports/my — reporter's own bug reports
exports.getMyBugReports = async (req, res) => {
  try {
    const userId = req.userId;
    const filter = { reporter_id: userId };
    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const reports = await BugReport.find(filter).sort({ createdAt: -1 });
    return res.json({ success: true, total: reports.length, data: reports });
  } catch (err) {
    console.error('[getMyBugReports]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/bug-reports/:id — get a single report (reporter, or admin/sales)
exports.getBugReportById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid bug report id' });
    }

    const report = await BugReport.findById(id)
      .populate('reporter_id', 'full_name username email')
      .populate('assigned_to', 'full_name email');

    if (!report) {
      return res.status(404).json({ success: false, message: 'Bug report not found' });
    }

    const ownerId = report.reporter_id?._id || report.reporter_id;
    const isOwner = String(ownerId) === String(req.userId);
    const isStaff = ['admin', 'sales'].includes(req.user?.role);
    if (!isOwner && !isStaff) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this report' });
    }

    return res.json({ success: true, data: report });
  } catch (err) {
    console.error('[getBugReportById]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── ADMIN / SALES ───────────────────────────────────────────────────────────

// GET /api/bug-reports/admin/all — list every bug report
exports.adminGetAllBugReports = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (req.query.category && VALID_CATEGORIES.includes(req.query.category)) {
      filter.category = req.query.category;
    }
    if (req.query.priority && VALID_PRIORITIES.includes(req.query.priority)) {
      filter.priority = req.query.priority;
    }
    if (req.query.assigned_to && mongoose.Types.ObjectId.isValid(req.query.assigned_to)) {
      filter.assigned_to = req.query.assigned_to;
    }

    const page  = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const skip  = (page - 1) * limit;

    const [total, reports] = await Promise.all([
      BugReport.countDocuments(filter),
      BugReport.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('reporter_id', 'full_name username email')
        .populate('assigned_to', 'full_name email'),
    ]);

    return res.json({
      success: true,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      data: reports,
    });
  } catch (err) {
    console.error('[adminGetAllBugReports]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/bug-reports/admin/:id — update status/priority/assignment (admin, sales)
exports.adminUpdateBugReport = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid bug report id' });
    }

    const { status, priority, assigned_to, admin_note } = req.body;
    const updates = {};

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      updates.status = status;
      updates.resolved_at = ['fixed', 'closed'].includes(status) ? new Date() : null;
    }
    if (priority !== undefined) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ success: false, message: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
      }
      updates.priority = priority;
    }
    if (assigned_to !== undefined) {
      if (assigned_to !== null && !mongoose.Types.ObjectId.isValid(assigned_to)) {
        return res.status(400).json({ success: false, message: 'assigned_to must be a valid user id or null' });
      }
      updates.assigned_to = assigned_to;
    }
    if (admin_note !== undefined) {
      updates.admin_note = typeof admin_note === 'string' ? admin_note.trim() : '';
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    const report = await BugReport.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true })
      .populate('reporter_id', 'full_name username email')
      .populate('assigned_to', 'full_name email');

    if (!report) {
      return res.status(404).json({ success: false, message: 'Bug report not found' });
    }

    if (status !== undefined) {
      const reporterId = report.reporter_id?._id || report.reporter_id;
      fireAndForget('adminUpdateBugReport reporter notify', notifyReporter(req.app, {
        recipient: reporterId,
        sender:    req.user._id,
        message:   `Your bug report ${report.ticket_id} status changed to "${status.replace(/_/g, ' ')}"`,
      }));
    }

    return res.json({ success: true, message: 'Bug report updated successfully', data: report });
  } catch (err) {
    console.error('[adminUpdateBugReport]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
