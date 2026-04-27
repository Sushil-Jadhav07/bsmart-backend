const Ad = require('../models/Ad');
const User = require('../models/User');
const AdView = require('../models/AdView');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const mongoose = require('mongoose');
const runMongoTransaction = require('../utils/runMongoTransaction');
const sendNotification = require('../utils/sendNotification');
const { getBlockedPrivateUserIds, canViewAuthorContent, getFollowedUserIds } = require('../utils/privacyVisibility');

const DEFAULT_AD_CATEGORIES = [
  'Accessories',
  'Electronics',
  'Fashion',
  'Food',
  'Travel',
];

const DEFAULT_AD_LIKE_REWARD = 10;

const hasUserInList = (list, userId) =>
  Array.isArray(list) && list.some((id) => String(id) === String(userId));

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
      const isLikedByMe = hasUserInList(ad?.likes, req.userId);
      return {
        ...ad,
        likes_count: Number(ad?.likes_count || (Array.isArray(ad?.likes) ? ad.likes.length : 0)),
        is_liked_by_me: isLikedByMe,
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

    res.json({
      ...ad,
      likes_count: Number(ad?.likes_count || (Array.isArray(ad?.likes) ? ad.likes.length : 0)),
      is_liked_by_me: hasUserInList(ad?.likes, req.userId),
    });
  } catch (error) {
    console.error('[Ad] getAdById error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const createWalletTransaction = async (payload, session) => {
  try {
    if (session) {
      await WalletTransaction.create([payload], { session });
      return;
    }
    await WalletTransaction.create(payload);
  } catch (error) {
    // Some deployments still have stricter unique indexes on (user_id, ad_id, type).
    // In that case we keep the write idempotent by aggregating into the existing row.
    if (error?.code === 11000 && payload?.user_id && payload?.ad_id && payload?.type) {
      const match = {
        user_id: payload.user_id,
        ad_id: payload.ad_id,
        type: payload.type,
      };
      const update = {
        $set: {
          status: payload.status || 'SUCCESS',
          description: payload.description || '',
          ...(payload.vendor_id ? { vendor_id: payload.vendor_id } : {}),
          transactionDate: new Date(),
        },
        $inc: {
          amount: Number(payload.amount || 0),
        },
      };
      await WalletTransaction.updateOne(
        match,
        update,
        { upsert: true, ...(session ? { session } : {}) }
      );
      return;
    }
    throw error;
  }
};

const likeAdInternal = async ({ adId, userId, session }) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const ad = await Ad.findById(adId).session(session || null);
  if (!ad || ad.isDeleted) {
    const err = new Error('Ad not found');
    err.statusCode = 404;
    throw err;
  }
  if (ad.status !== 'active') {
    const err = new Error('Ad is not active');
    err.statusCode = 400;
    throw err;
  }
  if (hasUserInList(ad.likes, userId)) {
    const err = new Error('Already liked');
    err.statusCode = 409;
    throw err;
  }

  const isOwnAd = String(ad.user_id) === String(userId);
  const reward = isOwnAd ? 0 : Math.max(0, Number(ad.coins_reward || DEFAULT_AD_LIKE_REWARD));
  let memberWalletBalance = null;

  if (reward > 0) {
    const vendorWallet = await Wallet.findOneAndUpdate(
      { user_id: ad.user_id, balance: { $gte: reward } },
      { $inc: { balance: -reward } },
      { new: true, session: session || undefined }
    );
    if (!vendorWallet) {
      const err = new Error('Ad budget exhausted');
      err.statusCode = 400;
      throw err;
    }

    const memberWallet = await Wallet.findOneAndUpdate(
      { user_id: userObjectId },
      { $inc: { balance: reward }, $setOnInsert: { currency: 'Coins' } },
      { new: true, upsert: true, session: session || undefined }
    );
    memberWalletBalance = Number(memberWallet?.balance || 0);

    await createWalletTransaction({
      user_id: ad.user_id,
      vendor_id: ad.vendor_id,
      ad_id: ad._id,
      type: 'AD_LIKE_DEDUCTION',
      amount: reward,
      status: 'SUCCESS',
      description: `Deducted ${reward} coins from ad budget for like reward`,
    }, session);

    await createWalletTransaction({
      user_id: userObjectId,
      vendor_id: ad.vendor_id,
      ad_id: ad._id,
      type: 'AD_LIKE_REWARD',
      amount: reward,
      status: 'SUCCESS',
      description: `Earned ${reward} coins for liking ad`,
    }, session);
  }

  if (hasUserInList(ad.dislikes, userId)) {
    ad.dislikes = ad.dislikes.filter((id) => String(id) !== String(userId));
    ad.dislikes_count = ad.dislikes.length;
  }

  ad.likes.push(userObjectId);
  ad.likes_count = ad.likes.length;
  await ad.save({ session: session || undefined });

  return {
    ad,
    reward,
    memberWalletBalance,
    isOwnAd,
  };
};

const dislikeAdInternal = async ({ adId, userId, session }) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const ad = await Ad.findById(adId).session(session || null);
  if (!ad || ad.isDeleted) {
    const err = new Error('Ad not found');
    err.statusCode = 404;
    throw err;
  }
  if (!hasUserInList(ad.likes, userId)) {
    const err = new Error('Not previously liked');
    err.statusCode = 400;
    throw err;
  }

  const isOwnAd = String(ad.user_id) === String(userId);
  const reversalAmount = isOwnAd ? 0 : Math.max(0, Number(ad.coins_reward || DEFAULT_AD_LIKE_REWARD));
  let memberWalletBalance = null;

  if (reversalAmount > 0) {
    const memberWallet = await Wallet.findOneAndUpdate(
      { user_id: userObjectId, balance: { $gte: reversalAmount } },
      { $inc: { balance: -reversalAmount } },
      { new: true, session: session || undefined }
    );
    if (!memberWallet) {
      const err = new Error('Insufficient wallet balance to reverse like');
      err.statusCode = 400;
      throw err;
    }
    memberWalletBalance = Number(memberWallet?.balance || 0);

    await Wallet.findOneAndUpdate(
      { user_id: ad.user_id },
      { $inc: { balance: reversalAmount }, $setOnInsert: { currency: 'Coins' } },
      { new: true, upsert: true, session: session || undefined }
    );

    await createWalletTransaction({
      user_id: userObjectId,
      vendor_id: ad.vendor_id,
      ad_id: ad._id,
      type: 'AD_LIKE_REWARD_REVERSAL',
      amount: reversalAmount,
      status: 'SUCCESS',
      description: `Deducted ${reversalAmount} coins for ad like reversal`,
    }, session);

    await createWalletTransaction({
      user_id: ad.user_id,
      vendor_id: ad.vendor_id,
      ad_id: ad._id,
      type: 'AD_LIKE_BUDGET_REFUND',
      amount: reversalAmount,
      status: 'SUCCESS',
      description: `Refunded ${reversalAmount} coins back to ad budget from like reversal`,
    }, session);
  }

  ad.likes = ad.likes.filter((id) => String(id) !== String(userId));
  ad.likes_count = ad.likes.length;

  if (!hasUserInList(ad.dislikes, userId)) {
    ad.dislikes.push(userObjectId);
  }
  ad.dislikes_count = ad.dislikes.length;

  await ad.save({ session: session || undefined });

  return {
    ad,
    reversalAmount,
    memberWalletBalance,
  };
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
exports.likeAd = async (req, res) => {
  try {
    const { id: adId } = req.params;
    const userId = String(req.userId || '');
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ message: 'Invalid user token' });
    }

    let result;
    await runMongoTransaction({
      work: async (session) => {
        result = await likeAdInternal({ adId, userId, session });
      },
      fallback: async () => {
        result = await likeAdInternal({ adId, userId });
      },
    });

    const adOwnerId = String(result.ad?.user_id || '');
    if (adOwnerId && adOwnerId !== userId) {
      sendNotification(req.app, {
        recipient: adOwnerId,
        sender: userId,
        type: 'ad_like',
        message: `${req.user?.username || 'Someone'} liked your ad`,
        link: `/ads/${adId}/details`,
      }).catch(() => {});
    }

    return res.json({
      likes_count: result.ad.likes_count,
      is_liked: true,
      coins_earned: result.reward,
      wallet: {
        balance: result.memberWalletBalance,
        currency: 'Coins',
      },
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    if (status !== 500) {
      return res.status(status).json({ message: error.message });
    }
    console.error('[Ad] likeAd error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.dislikeAd = async (req, res) => {
  try {
    const { id: adId } = req.params;
    const userId = String(req.userId || '');
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ message: 'Invalid user token' });
    }

    let result;
    await runMongoTransaction({
      work: async (session) => {
        result = await dislikeAdInternal({ adId, userId, session });
      },
      fallback: async () => {
        result = await dislikeAdInternal({ adId, userId });
      },
    });

    return res.json({
      likes_count: result.ad.likes_count,
      is_disliked: true,
      coins_deducted: result.reversalAmount,
      wallet: {
        balance: result.memberWalletBalance,
        currency: 'Coins',
      },
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    if (status !== 500) {
      return res.status(status).json({ message: error.message });
    }
    console.error('[Ad] dislikeAd error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
exports.saveAd = async (req, res) => { res.status(501).json({ message: 'Not implemented' }); };
exports.unsaveAd = async (req, res) => { res.status(501).json({ message: 'Not implemented' }); };
exports.deleteAd = async (req, res) => { res.status(501).json({ message: 'Not implemented' }); };
exports.updateAdMetadata = async (req, res) => { res.status(501).json({ message: 'Not implemented' }); };
