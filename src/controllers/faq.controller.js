'use strict';

const mongoose = require('mongoose');
const Faq = require('../models/Faq');

// ─── PUBLIC ──────────────────────────────────────────────────────────────────

// GET /api/faq?app_source=bsmart&category=payment
exports.listFaqs = async (req, res) => {
  try {
    const filter = { is_active: true };
    if (req.query.app_source && ['member', 'vendor'].includes(req.query.app_source)) {
      filter.app_source = { $in: [req.query.app_source, 'both'] };
    }
    if (req.query.category) filter.category = req.query.category;

    const faqs = await Faq.find(filter)
      .sort({ order: 1, createdAt: 1 })
      .select('-__v')
      .lean();

    return res.json({ success: true, total: faqs.length, data: faqs });
  } catch (err) {
    console.error('[listFaqs]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/faq/:id
exports.getFaq = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid FAQ id' });
    }

    const faq = await Faq.findOne({ _id: id, is_active: true }).select('-__v').lean();
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });

    return res.json({ success: true, data: faq });
  } catch (err) {
    console.error('[getFaq]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── ADMIN ───────────────────────────────────────────────────────────────────

// GET /api/faq/admin?app_source=bsmart&category=payment&is_active=true
exports.adminListFaqs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.app_source) filter.app_source = req.query.app_source;
    if (req.query.category)   filter.category   = req.query.category;
    if (req.query.is_active !== undefined) {
      filter.is_active = req.query.is_active === 'true';
    }

    const faqs = await Faq.find(filter).sort({ order: 1, createdAt: 1 }).select('-__v').lean();

    return res.json({ success: true, total: faqs.length, data: faqs });
  } catch (err) {
    console.error('[adminListFaqs]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/faq/admin
exports.createFaq = async (req, res) => {
  try {
    const { question, answer, category, app_source, order, is_active } = req.body;

    if (!question?.trim() || !answer?.trim()) {
      return res.status(400).json({ success: false, message: 'question and answer are required' });
    }

    const faq = await Faq.create({
      question: question.trim(),
      answer:   answer.trim(),
      category:   category   ?? 'general',
      app_source: app_source ?? 'both',
      order:      order      ?? 0,
      is_active:  is_active  ?? true,
    });

    return res.status(201).json({ success: true, message: 'FAQ created', data: faq });
  } catch (err) {
    console.error('[createFaq]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PUT /api/faq/admin/:id
exports.updateFaq = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid FAQ id' });
    }

    const allowed = ['question', 'answer', 'category', 'app_source', 'order', 'is_active'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = typeof req.body[key] === 'string' ? req.body[key].trim() : req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    const faq = await Faq.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true }).select('-__v');
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });

    return res.json({ success: true, message: 'FAQ updated', data: faq });
  } catch (err) {
    console.error('[updateFaq]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PATCH /api/faq/admin/:id/toggle
exports.toggleFaq = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid FAQ id' });
    }

    const faq = await Faq.findById(id);
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });

    faq.is_active = !faq.is_active;
    await faq.save();

    return res.json({
      success: true,
      message: `FAQ ${faq.is_active ? 'activated' : 'deactivated'}`,
      data: { _id: faq._id, is_active: faq.is_active },
    });
  } catch (err) {
    console.error('[toggleFaq]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PATCH /api/faq/admin/reorder
// Body: { faqs: [{ id: "...", order: 1 }, { id: "...", order: 2 }] }
exports.reorderFaqs = async (req, res) => {
  try {
    const { faqs } = req.body;
    if (!Array.isArray(faqs) || faqs.length === 0) {
      return res.status(400).json({ success: false, message: 'faqs array is required' });
    }

    await Promise.all(
      faqs.map(({ id, order }) => {
        if (!mongoose.Types.ObjectId.isValid(id)) return Promise.resolve();
        return Faq.findByIdAndUpdate(id, { $set: { order: Number(order) || 0 } });
      })
    );

    return res.json({ success: true, message: 'FAQs reordered' });
  } catch (err) {
    console.error('[reorderFaqs]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// DELETE /api/faq/admin/:id
exports.deleteFaq = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid FAQ id' });
    }

    const faq = await Faq.findByIdAndDelete(id);
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });

    return res.json({ success: true, message: 'FAQ deleted' });
  } catch (err) {
    console.error('[deleteFaq]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
