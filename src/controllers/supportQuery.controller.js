const mongoose = require('mongoose');
const SupportQuery = require('../models/SupportQuery');
const { sendEmail, isEmailConfigured } = require('../services/email.service');
const {
  websiteInquiryAdminTemplate,
  websiteInquiryCustomerTemplate,
} = require('../templates/email.templates');

const SUPPORT_EMAIL = 'info@ruvees.in';

// ─── WEBSITE (public, no auth) ──────────────────────────────────────────────

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

    const query = await SupportQuery.create({
      name,
      email,
      phone: phone || '',
      subject,
      message,
      category,
      app_source,
    });

    if (isEmailConfigured()) {
      const emailData = { name, email, phone: phone || '-', subject, message, category, app_source, submitted_at: query.createdAt };

      sendEmail({
        to: SUPPORT_EMAIL,
        subject: `New Website Inquiry: ${subject}`,
        html: websiteInquiryAdminTemplate(emailData),
      }).catch((err) => console.error('[createWebsiteQuery] Admin email failed:', err.message));

      sendEmail({
        to: email,
        subject: 'We received your inquiry — BSmart Support',
        html: websiteInquiryCustomerTemplate(emailData),
      }).catch((err) => console.error('[createWebsiteQuery] Customer email failed:', err.message));
    }

    return res.status(201).json({
      success: true,
      message: 'Support query submitted successfully',
      query,
    });
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

    const query = await SupportQuery.create({
      user_id: req.userId,
      subject,
      message,
      category,
      app_source,
    });

    return res.status(201).json({
      success: true,
      message: 'Support query submitted successfully',
      query,
    });
  } catch (error) {
    console.error('[createQuery]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getMyQueries = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = { user_id: req.userId, deleted_by_user: false };
    if (req.query.status) filter.status = req.query.status;

    const total = await SupportQuery.countDocuments(filter);
    const queries = await SupportQuery.find(filter)
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
      queries,
    });
  } catch (error) {
    console.error('[getMyQueries]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getMyQueryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid query id' });
    }

    const query = await SupportQuery.findOne({ _id: id, user_id: req.userId, deleted_by_user: false })
      .populate('replies.sender_id', 'username full_name avatar_url role')
      .lean();

    if (!query) {
      return res.status(404).json({ message: 'Query not found' });
    }

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

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid query id' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'message is required' });
    }

    const query = await SupportQuery.findOne({ _id: id, user_id: req.userId, deleted_by_user: false });
    if (!query) {
      return res.status(404).json({ message: 'Query not found' });
    }
    if (query.status === 'closed') {
      return res.status(400).json({ message: 'Cannot reply to a closed query' });
    }

    query.replies.push({
      sender_type: 'user',
      sender_id: req.userId,
      message: message.trim(),
    });
    await query.save();

    return res.json({ success: true, message: 'Reply added', query });
  } catch (error) {
    console.error('[replyToMyQuery]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteMyQuery = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid query id' });
    }

    const query = await SupportQuery.findOne({ _id: id, user_id: req.userId, deleted_by_user: false });
    if (!query) {
      return res.status(404).json({ message: 'Query not found' });
    }

    query.deleted_by_user = true;
    await query.save();

    return res.json({ success: true, message: 'Query deleted successfully' });
  } catch (error) {
    console.error('[deleteMyQuery]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── ADMIN + SALES OFFICER ─────────────────────────────────────────────────

exports.listAllQueries = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = {};

    if (req.query.status) filter.status = req.query.status;
    if (req.query.app_source) filter.app_source = req.query.app_source;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.assigned_to) {
      filter.assigned_to = req.query.assigned_to === 'unassigned'
        ? null
        : req.query.assigned_to;
    }

    const total = await SupportQuery.countDocuments(filter);
    const queries = await SupportQuery.find(filter)
      .populate('user_id', 'username full_name avatar_url')
      .populate('assigned_to', 'username full_name avatar_url')
      .populate('assigned_by', 'username full_name')
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
      queries,
    });
  } catch (error) {
    console.error('[listAllQueries]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.listWebsiteQueries = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = { user_id: null };

    if (req.query.status) filter.status = req.query.status;
    if (req.query.app_source) filter.app_source = req.query.app_source;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.assigned_to) {
      filter.assigned_to = req.query.assigned_to === 'unassigned'
        ? null
        : req.query.assigned_to;
    }

    const total = await SupportQuery.countDocuments(filter);
    const queries = await SupportQuery.find(filter)
      .populate('assigned_to', 'username full_name avatar_url')
      .populate('assigned_by', 'username full_name')
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
      queries,
    });
  } catch (error) {
    console.error('[listWebsiteQueries]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getWebsiteQueryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid query id' });
    }

    const query = await SupportQuery.findOne({ _id: id, user_id: null })
      .populate('assigned_to', 'username full_name avatar_url')
      .populate('assigned_by', 'username full_name')
      .populate('replies.sender_id', 'username full_name avatar_url role')
      .lean();

    if (!query) {
      return res.status(404).json({ message: 'Website inquiry not found' });
    }

    return res.json({ success: true, query });
  } catch (error) {
    console.error('[getWebsiteQueryById]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getQueryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid query id' });
    }

    const query = await SupportQuery.findById(id)
      .populate('user_id', 'username full_name avatar_url')
      .populate('assigned_to', 'username full_name avatar_url')
      .populate('assigned_by', 'username full_name')
      .populate('replies.sender_id', 'username full_name avatar_url role')
      .lean();

    if (!query) {
      return res.status(404).json({ message: 'Query not found' });
    }

    return res.json({ success: true, query });
  } catch (error) {
    console.error('[getQueryById]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getQueriesByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = { user_id: userId };
    if (req.query.status) filter.status = req.query.status;

    const total = await SupportQuery.countDocuments(filter);
    const queries = await SupportQuery.find(filter)
      .populate('user_id', 'username full_name avatar_url')
      .populate('assigned_to', 'username full_name avatar_url')
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
      queries,
    });
  } catch (error) {
    console.error('[getQueriesByUser]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.adminReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid query id' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'message is required' });
    }

    const query = await SupportQuery.findById(id);
    if (!query) {
      return res.status(404).json({ message: 'Query not found' });
    }
    if (query.status === 'closed') {
      return res.status(400).json({ message: 'Cannot reply to a closed query' });
    }

    const senderType = req.user.role === 'admin' ? 'admin' : 'sales';
    query.replies.push({
      sender_type: senderType,
      sender_id: req.userId,
      message: message.trim(),
    });

    if (query.status === 'open') {
      query.status = 'in_progress';
    }

    await query.save();

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

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid query id' });
    }
    if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const query = await SupportQuery.findById(id);
    if (!query) {
      return res.status(404).json({ message: 'Query not found' });
    }

    query.status = status;
    await query.save();

    return res.json({ success: true, message: 'Status updated', query });
  } catch (error) {
    console.error('[updateQueryStatus]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteQuery = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid query id' });
    }

    const query = await SupportQuery.findByIdAndDelete(id);
    if (!query) {
      return res.status(404).json({ message: 'Query not found' });
    }

    return res.json({ success: true, message: 'Query deleted successfully' });
  } catch (error) {
    console.error('[deleteQuery]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── ADMIN ONLY ─────────────────────────────────────────────────────────────

exports.assignQuery = async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid query id' });
    }

    const query = await SupportQuery.findById(id);
    if (!query) {
      return res.status(404).json({ message: 'Query not found' });
    }

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

    const populated = await SupportQuery.findById(id)
      .populate('user_id', 'username full_name avatar_url')
      .populate('assigned_to', 'username full_name avatar_url')
      .populate('assigned_by', 'username full_name')
      .lean();

    return res.json({ success: true, message: 'Query assignment updated', query: populated });
  } catch (error) {
    console.error('[assignQuery]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
