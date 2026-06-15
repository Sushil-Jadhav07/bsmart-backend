const mongoose = require('mongoose');
const User     = require('../models/User');
const Block    = require('../models/Block');
const Restrict = require('../models/Restrict');
const Mute     = require('../models/Mute');

const USER_FIELDS = '_id username full_name avatar_url';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const resolveTarget = async (targetId, res) => {
  if (!isValidId(targetId)) {
    res.status(400).json({ message: 'Invalid user id' });
    return null;
  }
  const target = await User.findById(targetId).lean();
  if (!target) {
    res.status(404).json({ message: 'User not found' });
    return null;
  }
  return target;
};

// ─── GET /users/blocked ───────────────────────────────────────────────────────
exports.getBlockedUsers = async (req, res) => {
  try {
    const docs = await Block.find({ blocker_id: req.userId })
      .populate('blocked_id', USER_FIELDS)
      .sort({ created_at: -1 })
      .lean();

    const users = docs
      .filter((d) => d.blocked_id)
      .map((d) => d.blocked_id);

    res.json({ users });
  } catch (err) {
    console.error('[Block] getBlockedUsers error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ─── GET /users/restricted ────────────────────────────────────────────────────
exports.getRestrictedUsers = async (req, res) => {
  try {
    const docs = await Restrict.find({ restrictor_id: req.userId })
      .populate('restricted_id', USER_FIELDS)
      .sort({ created_at: -1 })
      .lean();

    const users = docs
      .filter((d) => d.restricted_id)
      .map((d) => d.restricted_id);

    res.json({ users });
  } catch (err) {
    console.error('[Restrict] getRestrictedUsers error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ─── GET /users/muted ─────────────────────────────────────────────────────────
exports.getMutedUsers = async (req, res) => {
  try {
    const docs = await Mute.find({ muter_id: req.userId })
      .populate('muted_id', USER_FIELDS)
      .sort({ created_at: -1 })
      .lean();

    const users = docs
      .filter((d) => d.muted_id)
      .map((d) => d.muted_id);

    res.json({ users });
  } catch (err) {
    console.error('[Mute] getMutedUsers error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ─── POST /users/:targetId/block ──────────────────────────────────────────────
exports.blockUser = async (req, res) => {
  try {
    const { targetId } = req.params;
    if (String(req.userId) === targetId) {
      return res.status(400).json({ message: 'You cannot block yourself' });
    }
    if (!(await resolveTarget(targetId, res))) return;

    await Block.create({ blocker_id: req.userId, blocked_id: targetId });
    res.json({ message: 'User blocked' });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Already blocked' });
    console.error('[Block] blockUser error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ─── DELETE /users/:targetId/block ────────────────────────────────────────────
exports.unblockUser = async (req, res) => {
  try {
    const { targetId } = req.params;
    if (String(req.userId) === targetId) {
      return res.status(400).json({ message: 'You cannot unblock yourself' });
    }

    const result = await Block.deleteOne({ blocker_id: req.userId, blocked_id: targetId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Block record not found' });
    }
    res.json({ message: 'User unblocked' });
  } catch (err) {
    console.error('[Block] unblockUser error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ─── POST /users/:targetId/restrict ──────────────────────────────────────────
exports.restrictUser = async (req, res) => {
  try {
    const { targetId } = req.params;
    if (String(req.userId) === targetId) {
      return res.status(400).json({ message: 'You cannot restrict yourself' });
    }
    if (!(await resolveTarget(targetId, res))) return;

    await Restrict.create({ restrictor_id: req.userId, restricted_id: targetId });
    res.json({ message: 'User restricted' });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Already restricted' });
    console.error('[Restrict] restrictUser error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ─── DELETE /users/:targetId/restrict ────────────────────────────────────────
exports.unrestrictUser = async (req, res) => {
  try {
    const { targetId } = req.params;
    if (String(req.userId) === targetId) {
      return res.status(400).json({ message: 'You cannot unrestrict yourself' });
    }

    const result = await Restrict.deleteOne({ restrictor_id: req.userId, restricted_id: targetId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Restrict record not found' });
    }
    res.json({ message: 'User unrestricted' });
  } catch (err) {
    console.error('[Restrict] unrestrictUser error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ─── POST /users/:targetId/mute ───────────────────────────────────────────────
exports.muteUser = async (req, res) => {
  try {
    const { targetId } = req.params;
    if (String(req.userId) === targetId) {
      return res.status(400).json({ message: 'You cannot mute yourself' });
    }
    if (!(await resolveTarget(targetId, res))) return;

    await Mute.create({ muter_id: req.userId, muted_id: targetId });
    res.json({ message: 'User muted' });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Already muted' });
    console.error('[Mute] muteUser error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ─── DELETE /users/:targetId/mute ─────────────────────────────────────────────
exports.unmuteUser = async (req, res) => {
  try {
    const { targetId } = req.params;
    if (String(req.userId) === targetId) {
      return res.status(400).json({ message: 'You cannot unmute yourself' });
    }

    const result = await Mute.deleteOne({ muter_id: req.userId, muted_id: targetId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Mute record not found' });
    }
    res.json({ message: 'User unmuted' });
  } catch (err) {
    console.error('[Mute] unmuteUser error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
};
