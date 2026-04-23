const Ad = require('../models/Ad');
const User = require('../models/User');
const AdView = require('../models/AdView');
const mongoose = require('mongoose');
const { getBlockedPrivateUserIds, canViewAuthorContent, getFollowedUserIds } = require('../utils/privacyVisibility');

const DEFAULT_AD_CATEGORIES = [
  'Accessories',
  'Electronics',
  'Fashion',
  'Food',
  'Travel',
];

// ─── Admin Ad Management ────────────────────────────────────────────────────

/**
 * Admin updates an ad's status (active, paused, rejected, etc.)
 * PATCH /api/admin/ads/:id
 */
exports.adminUpdateAdStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    if (status) {
      ad.status = status;
      if (status === 'rejected') {
        ad.rejection_reason = rejection_reason || 'No reason provided';
        ad.compliance.approval_status = 'rejected';
      } else if (status === 'active') {
        ad.compliance.approval_status = 'approved';
        ad.rejection_reason = '';
      }
    }

    await ad.save();
    res.json({ message: `Ad status updated to ${ad.status}`, ad });
  } catch (error) {
    console.error('[Admin] adminUpdateAdStatus error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Admin deletes an ad (soft delete)
 * DELETE /api/admin/ads/:id
 */
exports.adminDeleteAd = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    ad.isDeleted = true;
    ad.deletedBy = req.userId;
    ad.deletedAt = new Date();
    await ad.save();

    res.json({ message: 'Ad deleted successfully by admin' });
  } catch (error) {
    console.error('[Admin] adminDeleteAd error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── Ad Management (Placeholders for now) ───────────────────────────────────

exports.getAdsFeed = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const blockedPrivateUserIds = await getBlockedPrivateUserIds(req.userId);
    const followedIds = await getFollowedUserIds(req.userId);
    const followedSet = new Set(followedIds.map((id) => String(id)));
    const viewerId = String(req.userId);
    const adQuery = { status: 'active', isDeleted: false };
    if (blockedPrivateUserIds.length > 0) {
      adQuery.user_id = { $nin: blockedPrivateUserIds };
    }

    const ads = await Ad.find(adQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('vendor_id', 'business_name logo_url validated')
      .populate('user_id', 'username full_name avatar_url gender location isPrivate')
      .lean();

    const data = ads.map((ad) => {
      const authorId = String(ad?.user_id?._id || ad?.user_id?.id || '');
      const isAuthorFollowed = authorId ? followedSet.has(authorId) : false;
      return {
        ...ad,
        is_author_followed_by_me: isAuthorFollowed,
        can_view_by_me: !ad?.user_id?.isPrivate || authorId === viewerId || isAuthorFollowed,
      };
    });

    res.json({ page, limit, data });
  } catch (error) {
    console.error('[Ad] getAdsFeed error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getAdById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    const ad = await Ad.findById(id)
      .populate('vendor_id', 'business_name logo_url validated')
      .populate('user_id', 'username full_name avatar_url gender location isPrivate')
      .lean();

    if (!ad || ad.isDeleted) {
      return res.status(404).json({ message: 'Ad not found' });
    }
    const authorId = ad?.user_id?._id || ad?.user_id;
    const canView = await canViewAuthorContent(req.userId, authorId);
    if (!canView) {
      return res.status(403).json({ message: 'This account is private. Follow to view ads.' });
    }

    res.json(ad);
  } catch (error) {
    console.error('[Ad] getAdById error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.recordAdView = async (req, res) => {
  try {
    const { id } = req.params;
    const ad = await Ad.findByIdAndUpdate(id, { $inc: { views_count: 1 } }, { new: true });
    if (!ad) return res.status(404).json({ message: 'Ad not found' });
    res.json({ message: 'View recorded', views_count: ad.views_count });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.recordClick = async (req, res) => {
  try {
    const { id } = req.params;
    const ad = await Ad.findByIdAndUpdate(id, { $inc: { clicks_count: 1 } }, { new: true });
    if (!ad) return res.status(404).json({ message: 'Ad not found' });
    res.json({ message: 'Click recorded', clicks_count: ad.clicks_count });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.listAds = async (req, res) => {
  try {
    const ads = await Ad.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .populate('vendor_id', 'business_name logo_url validated')
      .populate('user_id', 'username full_name avatar_url gender location')
      .lean();
    res.json(ads);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.searchAds = async (req, res) => {
  try {
    const { q } = req.query;
    const filter = { isDeleted: false, status: 'active' };
    if (q) {
      filter.$text = { $search: q };
    }
    const ads = await Ad.find(filter)
      .sort({ createdAt: -1 })
      .populate('vendor_id', 'business_name logo_url validated')
      .populate('user_id', 'username full_name avatar_url gender location')
      .lean();
    res.json(ads);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.createAd = async (req, res) => { res.status(501).json({ message: 'Not implemented' }); };
exports.getUserAdsWithComments = async (req, res) => { res.status(501).json({ message: 'Not implemented' }); };
exports.getAdCategories = async (req, res) => {
  try {
    const fromDb = await Ad.distinct('category', { isDeleted: false });
    const normalizedFromDb = fromDb
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const categories = Array.from(new Set([...DEFAULT_AD_CATEGORIES, ...normalizedFromDb])).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
    return res.json({ categories });
  } catch (error) {
    console.error('[Ad] getAdCategories error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
exports.addAdCategory = async (req, res) => { res.status(501).json({ message: 'Not implemented' }); };
exports.likeAd = async (req, res) => { res.status(501).json({ message: 'Not implemented' }); };
exports.dislikeAd = async (req, res) => { res.status(501).json({ message: 'Not implemented' }); };
exports.saveAd = async (req, res) => { res.status(501).json({ message: 'Not implemented' }); };
exports.unsaveAd = async (req, res) => { res.status(501).json({ message: 'Not implemented' }); };
exports.deleteAd = async (req, res) => { res.status(501).json({ message: 'Not implemented' }); };
exports.updateAdMetadata = async (req, res) => { res.status(501).json({ message: 'Not implemented' }); };
