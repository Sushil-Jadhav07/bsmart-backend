'use strict';

const mongoose = require('mongoose');
const SupportQuery    = require('../models/SupportQuery');
const User            = require('../models/User');
const sendNotification = require('../utils/sendNotification');
const { sendEmail, isEmailConfigured } = require('../services/email.service');
const {
  websiteInquiryAdminTemplate,
  websiteInquiryCustomerTemplate,
} = require('../templates/email.templates');

const SUPPORT_EMAIL = 'info@ruvees.in';

// ─── Socket helpers ──────────────────────────────────────────────────────────

const emitToQueryRoom = (app, queryId, event, data) => {
  const io = app.get('io');
  if (io) io.to(`support_query_${queryId}`).emit(event, data);
};

// Send FCM + socket notification to every admin and sales user
const notifyAdmins = async (app, { queryId, message, senderName = '' }) => {
  try {
    const admins = await User.find({ role: { $in: ['admin', 'sales'] } }).select('_id').lean();
    await Promise.allSettled(
      admins.map((a) =>
        sendNotification(app, {
          recipient:   a._id,
          sender:      null,
          type:        'support_query',
          message,
          link:        `/admin/support-queries/${queryId}`,
          senderName,
        })
      )
    );
  } catch (err) {
    console.error('[notifyAdmins]', err.message);
  }
};

// Send FCM + socket notification to the assigned officer (or all admins if not assigned)
const notifyStaff = async (app, query, message, type = 'support_reply') => {
  try {
    const recipients = query.assigned_to
      ? [{ _id: query.assigned_to }]
      : await User.find({ role: { $in: ['admin', 'sales'] } }).select('_id').lean();

    await Promise.allSettled(
      recipients.map((r) =>
        sendNotification(app, {
          recipient: r._id,
          sender:    query.user_id || null,
          type,
          message,
          link:      `/admin/support-queries/${query._id}`,
        })
      )
    );
  } catch (err) {
    console.error('[notifyStaff]', err.message);
  }
};

// ─── WEBSITE (public, no auth) ───────────────────────────────────────────────

exports.createWebsiteQuery = async (req, res) => {
  try {
    const { name, email, phone, subject, message, category, app_source } = req.body;

    if (!name || !email || !subject || !message || !category || !app_source) {
      return res.status(400).json({ message: 'name, email, subject, message, category and app_source are required' });
    }
    if (!['bsmart', 'ruvees'].includes(app_source)) {
      return res.status(400).json({ message: 'app_source must be bsmart or ruvees' });
    }
    if (!['account', 'payment', 'technical', 'general', 'other'].includes(category)) {
      return res.status(400).json({ message: 'Invalid category' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email address' });
    }

    const query = await SupportQuery.create({ name, email, phone: phone || '', subject, message, category, app_source });

    if (isEmailConfigured()) {
      const emailData = { name, email, phone: phone || '-', subject, message, category, app_source, submitted_at: query.createdAt };
      sendEmail({ to: SUPPORT_EMAIL, subject: `New Website Inquiry: ${subject}`, html: websiteInquiryAdminTemplate(emailData) })
        .catch((err) => console.error('[createWebsiteQuery] Admin email failed:', err.message));
      sendEmail({ to: email, subject: 'We received your inquiry — BSmart Support', html: websiteInquiryCustomerTemplate(emailData) })
        .catch((err) => console.error('[createWebsiteQuery] Customer email failed:', err.message));
    }

    // Notify all admins (FCM + socket)
    notifyAdmins(req.app, { queryId: query._id, message: `New website inquiry from ${name}: "${subject}"`, senderName: name });

    return res.status(201).json({ success: true, message: 'Support query submitted successfully', query });
  } catch (error) {
    console.error('[createWebsiteQuery]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── APP-SIDE (authenticated user) ──────────────────────────────────────────

exports.createQuery = async (req, res) => {
  try {
    const { subject, message, category, app_source } = req.body;

    if (!subject || !message || !category || !app_source) {
      return res.status(400).json({ message: 'subject, message, category and app_source are required' });
    }
    if (!['bsmart', 'ruvees'].includes(app_source)) {
      return res.status(400).json({ message: 'app_source must be bsmart or ruvees' });
    }
    if (!['account', 'payment', 'technical', 'general', 'other'].includes(category)) {
      return res.status(400).json({ message: 'Invalid category' });
    }

    const query = await SupportQuery.create({ user_id: req.userId, subject, message, category, app_source });

    // Notify all admins (FCM + socket)
    const user = await User.findById(req.userId).select('full_name username').lean();
    const senderName = user?.full_name || user?.username || 'A user';
    notifyAdmins(req.app, { queryId: query._id, message: `New support query from ${senderName}: "${subject}"`, senderName });

    return res.status(201).json({ success: true, message: 'Support query submitted successfully', query });
  } catch (error) {
    console.error('[createQuery]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getMyQueries = async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = { user_id: req.userId, deleted_by_user: false };
    if (req.query.status) filter.status = req.query.status;

    const total   = await SupportQuery.countDocuments(filter);
    const queries = await SupportQuery.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();

    return res.json({ success: true, total, page, limit, total_pages: Math.ceil(total / limit) || 1, queries });
  } catch (error) {
    console.error('[getMyQueries]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getMyQueryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid query id' });

    const query = await SupportQuery.findOne({ _id: id, user_id: req.userId, deleted_by_user: false })
      .populate('replies.sender_id', 'username full_name avatar_url role')
      .lean();

    if (!query) return res.status(404).json({ message: 'Query not found' });
    return res.json({ success: true, query });
  } catch (error) {
    console.error('[getMyQueryById]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.replyToMyQuery = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid query id' });
    if (!message?.trim()) return res.status(400).json({ message: 'message is required' });

    const query = await SupportQuery.findOne({ _id: id, user_id: req.userId, deleted_by_user: false });
    if (!query) return res.status(404).json({ message: 'Query not found' });
    if (query.status === 'closed') return res.status(400).json({ message: 'Cannot reply to a closed query' });

    const reply = { sender_type: 'user', sender_id: req.userId, message: message.trim(), createdAt: new Date() };
    query.replies.push(reply);
    await query.save();

    const newReply = query.replies[query.replies.length - 1];

    // Real-time: push reply to everyone viewing this query
    emitToQueryRoom(req.app, id, 'support_reply', {
      query_id:    id,
      reply: {
        _id:         newReply._id,
        sender_type: 'user',
        sender_id:   req.userId,
        message:     newReply.message,
        createdAt:   newReply.createdAt,
      },
    });

    // FCM + socket: notify assigned officer or all admins
    const user = await User.findById(req.userId).select('full_name username').lean();
    const senderName = user?.full_name || user?.username || 'User';
    notifyStaff(req.app, query, `${senderName} replied to query: "${query.subject}"`, 'support_reply');

    return res.json({ success: true, message: 'Reply added', query });
  } catch (error) {
    console.error('[replyToMyQuery]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteMyQuery = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid query id' });

    const query = await SupportQuery.findOne({ _id: id, user_id: req.userId, deleted_by_user: false });
    if (!query) return res.status(404).json({ message: 'Query not found' });

    query.deleted_by_user = true;
    await query.save();

    return res.json({ success: true, message: 'Query deleted successfully' });
  } catch (error) {
    console.error('[deleteMyQuery]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── ADMIN + SALES OFFICER ───────────────────────────────────────────────────

exports.listAllQueries = async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = {};

    if (req.query.status)      filter.status      = req.query.status;
    if (req.query.app_source)  filter.app_source  = req.query.app_source;
    if (req.query.category)    filter.category    = req.query.category;
    if (req.query.assigned_to) filter.assigned_to = req.query.assigned_to === 'unassigned' ? null : req.query.assigned_to;

    const total   = await SupportQuery.countDocuments(filter);
    const queries = await SupportQuery.find(filter)
      .populate('user_id',     'username full_name avatar_url')
      .populate('assigned_to', 'username full_name avatar_url')
      .populate('assigned_by', 'username full_name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({ success: true, total, page, limit, total_pages: Math.ceil(total / limit) || 1, queries });
  } catch (error) {
    console.error('[listAllQueries]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.listWebsiteQueries = async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = { user_id: null };

    if (req.query.status)      filter.status      = req.query.status;
    if (req.query.app_source)  filter.app_source  = req.query.app_source;
    if (req.query.category)    filter.category    = req.query.category;
    if (req.query.assigned_to) filter.assigned_to = req.query.assigned_to === 'unassigned' ? null : req.query.assigned_to;

    const total   = await SupportQuery.countDocuments(filter);
    const queries = await SupportQuery.find(filter)
      .populate('assigned_to', 'username full_name avatar_url')
      .populate('assigned_by', 'username full_name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({ success: true, total, page, limit, total_pages: Math.ceil(total / limit) || 1, queries });
  } catch (error) {
    console.error('[listWebsiteQueries]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getWebsiteQueryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid query id' });

    const query = await SupportQuery.findOne({ _id: id, user_id: null })
      .populate('assigned_to', 'username full_name avatar_url')
      .populate('assigned_by', 'username full_name')
      .populate('replies.sender_id', 'username full_name avatar_url role')
      .lean();

    if (!query) return res.status(404).json({ message: 'Website inquiry not found' });
    return res.json({ success: true, query });
  } catch (error) {
    console.error('[getWebsiteQueryById]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getQueryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid query id' });

    const query = await SupportQuery.findById(id)
      .populate('user_id',     'username full_name avatar_url')
      .populate('assigned_to', 'username full_name avatar_url')
      .populate('assigned_by', 'username full_name')
      .populate('replies.sender_id', 'username full_name avatar_url role')
      .lean();

    if (!query) return res.status(404).json({ message: 'Query not found' });
    return res.json({ success: true, query });
  } catch (error) {
    console.error('[getQueryById]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getQueriesByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Invalid user id' });

    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = { user_id: userId };
    if (req.query.status) filter.status = req.query.status;

    const total   = await SupportQuery.countDocuments(filter);
    const queries = await SupportQuery.find(filter)
      .populate('user_id',     'username full_name avatar_url')
      .populate('assigned_to', 'username full_name avatar_url')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({ success: true, total, page, limit, total_pages: Math.ceil(total / limit) || 1, queries });
  } catch (error) {
    console.error('[getQueriesByUser]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.adminReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid query id' });
    if (!message?.trim()) return res.status(400).json({ message: 'message is required' });

    const query = await SupportQuery.findById(id);
    if (!query) return res.status(404).json({ message: 'Query not found' });
    if (query.status === 'closed') return res.status(400).json({ message: 'Cannot reply to a closed query' });

    const senderType = req.user.role === 'admin' ? 'admin' : 'sales';
    const reply = { sender_type: senderType, sender_id: req.userId, message: message.trim(), createdAt: new Date() };
    query.replies.push(reply);
    if (query.status === 'open') query.status = 'in_progress';
    await query.save();

    const newReply = query.replies[query.replies.length - 1];

    // Real-time: push reply to everyone in the query room
    emitToQueryRoom(req.app, id, 'support_reply', {
      query_id: id,
      status:   query.status,
      reply: {
        _id:         newReply._id,
        sender_type: senderType,
        sender_id:   req.userId,
        message:     newReply.message,
        createdAt:   newReply.createdAt,
      },
    });

    // FCM + socket: notify the user who owns the query (app users only)
    if (query.user_id) {
      const staff = await User.findById(req.userId).select('full_name username').lean();
      const staffName = staff?.full_name || staff?.username || 'Support team';
      sendNotification(req.app, {
        recipient:  query.user_id,
        sender:     req.userId,
        type:       'support_reply',
        message:    `${staffName} replied to your query: "${query.subject}"`,
        link:       `/support/${id}`,
        senderName: staffName,
      }).catch(() => {});
    }

    return res.json({ success: true, message: 'Reply added', query });
  } catch (error) {
    console.error('[adminReply]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateQueryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid query id' });
    if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const query = await SupportQuery.findById(id);
    if (!query) return res.status(404).json({ message: 'Query not found' });

    query.status = status;
    await query.save();

    // Real-time: tell everyone in the room the status changed
    emitToQueryRoom(req.app, id, 'support_status_changed', { query_id: id, status });

    // FCM + socket: notify the user (app users only)
    if (query.user_id) {
      const labels = { open: 'reopened', in_progress: 'in progress', resolved: 'resolved', closed: 'closed' };
      sendNotification(req.app, {
        recipient: query.user_id,
        sender:    null,
        type:      'support_status',
        message:   `Your query "${query.subject}" has been marked as ${labels[status] || status}.`,
        link:      `/support/${id}`,
      }).catch(() => {});
    }

    return res.json({ success: true, message: 'Status updated', query });
  } catch (error) {
    console.error('[updateQueryStatus]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteQuery = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid query id' });

    const query = await SupportQuery.findByIdAndDelete(id);
    if (!query) return res.status(404).json({ message: 'Query not found' });

    return res.json({ success: true, message: 'Query deleted successfully' });
  } catch (error) {
    console.error('[deleteQuery]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── ADMIN ONLY ──────────────────────────────────────────────────────────────

exports.assignQuery = async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid query id' });

    const query = await SupportQuery.findById(id);
    if (!query) return res.status(404).json({ message: 'Query not found' });

    const prevAssignee = query.assigned_to ? String(query.assigned_to) : null;

    if (assigned_to === null || assigned_to === '') {
      query.assigned_to = null;
      query.assigned_by = null;
      query.assigned_at = null;
    } else {
      if (!mongoose.Types.ObjectId.isValid(assigned_to)) {
        return res.status(400).json({ message: 'Invalid assigned_to user id' });
      }
      query.assigned_to = assigned_to;
      query.assigned_by = req.userId;
      query.assigned_at = new Date();
    }

    await query.save();

    // FCM + socket: notify the newly assigned sales officer
    if (assigned_to && assigned_to !== prevAssignee) {
      sendNotification(req.app, {
        recipient: assigned_to,
        sender:    req.userId,
        type:      'support_assign',
        message:   `You have been assigned a support query: "${query.subject}"`,
        link:      `/admin/support-queries/${id}`,
      }).catch(() => {});
    }

    const populated = await SupportQuery.findById(id)
      .populate('user_id',     'username full_name avatar_url')
      .populate('assigned_to', 'username full_name avatar_url')
      .populate('assigned_by', 'username full_name')
      .lean();

    return res.json({ success: true, message: 'Query assignment updated', query: populated });
  } catch (error) {
    console.error('[assignQuery]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
