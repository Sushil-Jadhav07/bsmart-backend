'use strict';

const mongoose = require('mongoose');
const GiftCard = require('../models/GiftCard');

const VALID_STATUSES = ['active', 'inactive', 'draft'];

function validateDenominations(denominations) {
  if (!Array.isArray(denominations) || denominations.length === 0) {
    return 'denominations must be a non-empty array of { bcoins, amount }';
  }
  for (const d of denominations) {
    const bcoins = Number(d?.bcoins);
    const amount = Number(d?.amount);
    if (!Number.isFinite(bcoins) || bcoins <= 0 || !Number.isFinite(amount) || amount <= 0) {
      return 'each denomination requires a positive numeric bcoins and amount';
    }
  }
  return null;
}

function normalizeMedia(media) {
  if (!media || typeof media !== 'object' || Array.isArray(media)) return null;
  if (typeof media.url !== 'string' || !media.url.trim()) return null;
  return {
    url: media.url.trim(),
    type: ['image', 'video'].includes(media.type) ? media.type : 'image',
  };
}

function normalizeTerms(terms) {
  if (!Array.isArray(terms)) return [];
  return terms.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim());
}

// ─── ADMIN / SALES ───────────────────────────────────────────────────────────

// POST /api/gift-cards — create a gift card (admin, sales)
exports.createGiftCard = async (req, res) => {
  try {
    const {
      title, description, media, category, type,
      denominations, card_status, vendor, terms_and_conditions,
    } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: 'title is required' });
    }
    if (!vendor || typeof vendor !== 'string' || !vendor.trim()) {
      return res.status(400).json({ success: false, message: 'vendor is required' });
    }
    const denomError = validateDenominations(denominations);
    if (denomError) {
      return res.status(400).json({ success: false, message: denomError });
    }
    if (card_status && !VALID_STATUSES.includes(card_status)) {
      return res.status(400).json({ success: false, message: 'card_status must be active, inactive, or draft' });
    }

    const doc = await GiftCard.create({
      title: title.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      media: normalizeMedia(media),
      category: typeof category === 'string' ? category.trim() : '',
      type: typeof type === 'string' ? type.trim() : '',
      denominations: denominations.map((d) => ({ bcoins: Number(d.bcoins), amount: Number(d.amount) })),
      card_status: card_status || 'draft',
      vendor: vendor.trim(),
      terms_and_conditions: normalizeTerms(terms_and_conditions),
      created_by: req.user._id,
    });

    return res.status(201).json({ success: true, message: 'Gift card created successfully', data: doc });
  } catch (err) {
    console.error('[createGiftCard]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/gift-cards — list all gift cards, any status (admin, sales)
exports.getAllGiftCards = async (req, res) => {
  try {
    const filter = {};
    if (req.query.card_status && VALID_STATUSES.includes(req.query.card_status)) {
      filter.card_status = req.query.card_status;
    }
    if (req.query.category) filter.category = req.query.category;
    if (req.query.type) filter.type = req.query.type;

    const cards = await GiftCard.find(filter)
      .sort({ createdAt: -1 })
      .populate('created_by', 'full_name email')
      .populate('updated_by', 'full_name email');

    return res.json({ success: true, total: cards.length, data: cards });
  } catch (err) {
    console.error('[getAllGiftCards]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/gift-cards/:id — edit a gift card (admin, sales)
exports.updateGiftCard = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid gift card id' });
    }

    const {
      title, description, media, category, type,
      denominations, card_status, vendor, terms_and_conditions,
    } = req.body;

    const updates = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ success: false, message: 'title must be a non-empty string' });
      }
      updates.title = title.trim();
    }
    if (vendor !== undefined) {
      if (typeof vendor !== 'string' || !vendor.trim()) {
        return res.status(400).json({ success: false, message: 'vendor must be a non-empty string' });
      }
      updates.vendor = vendor.trim();
    }
    if (description !== undefined) {
      updates.description = typeof description === 'string' ? description.trim() : '';
    }
    if (category !== undefined) {
      updates.category = typeof category === 'string' ? category.trim() : '';
    }
    if (type !== undefined) {
      updates.type = typeof type === 'string' ? type.trim() : '';
    }
    if (media !== undefined) {
      updates.media = normalizeMedia(media);
    }
    if (terms_and_conditions !== undefined) {
      updates.terms_and_conditions = normalizeTerms(terms_and_conditions);
    }
    if (denominations !== undefined) {
      const denomError = validateDenominations(denominations);
      if (denomError) {
        return res.status(400).json({ success: false, message: denomError });
      }
      updates.denominations = denominations.map((d) => ({ bcoins: Number(d.bcoins), amount: Number(d.amount) }));
    }
    if (card_status !== undefined) {
      if (!VALID_STATUSES.includes(card_status)) {
        return res.status(400).json({ success: false, message: 'card_status must be active, inactive, or draft' });
      }
      updates.card_status = card_status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }
    updates.updated_by = req.user._id;

    const doc = await GiftCard.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true })
      .populate('created_by', 'full_name email')
      .populate('updated_by', 'full_name email');

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Gift card not found' });
    }

    return res.json({ success: true, message: 'Gift card updated successfully', data: doc });
  } catch (err) {
    console.error('[updateGiftCard]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUBLIC ──────────────────────────────────────────────────────────────────

// GET /api/gift-cards/active — active gift cards only (used by the frontend/app)
exports.getActiveGiftCards = async (req, res) => {
  try {
    const filter = { card_status: 'active' };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.type) filter.type = req.query.type;

    const cards = await GiftCard.find(filter)
      .select('-created_by -updated_by')
      .sort({ createdAt: -1 });

    return res.json({ success: true, total: cards.length, data: cards });
  } catch (err) {
    console.error('[getActiveGiftCards]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/gift-cards/:id — get a single gift card by id
exports.getGiftCardById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid gift card id' });
    }

    const doc = await GiftCard.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Gift card not found' });
    }

    return res.json({ success: true, data: doc });
  } catch (err) {
    console.error('[getGiftCardById]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
