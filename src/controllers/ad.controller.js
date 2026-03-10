const mongoose = require('mongoose');
const Ad = require('../models/Ad');
const AdView = require('../models/AdView');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const AdComment = require('../models/AdComment');
const SavedAd = require('../models/SavedAd');
const adCategories = require('../data/adCategories');
const AdCategory = require('../models/AdCategory');
const Notification = require('../models/notification.model');
const sendNotification = require('../utils/sendNotification');
const runMongoTransaction = require('../utils/runMongoTransaction');

const REWARD_COINS = 10; // Coins given to user when they like/comment/reply/save an ad (deducted from ad creator)

/**
 * Create a new ad (Vendor only)
 * @route POST /api/ads
 * @access Private (Vendor)
 */
exports.createAd = async (req, res) => {
  try {
    const userId = req.userId;

    const {
      title,
      caption,
      location,
      media,
      hashtags,
      tagged_users,
      engagement_controls,
      content_type,
      video_fileName,
      video_url,
      thumbnail_fileName,
      thumbnail_url,
      duration_seconds,
      category,
      tags,
      target_language,
      target_location,
      target_preferences,
      total_budget_coins
    } = req.body;

    const budget = Number(total_budget_coins || 0);
    if (!Number.isFinite(budget) || budget <= 0) {
      return res.status(400).json({ message: 'total_budget_coins must be a positive number' });
    }

    const hasNewMedia = media && Array.isArray(media) && media.length > 0;
    const hasLegacyMedia = video_fileName && video_url && duration_seconds;

    if ((!hasNewMedia && !hasLegacyMedia) || !category) {
      return res.status(400).json({ message: 'Missing required fields (media/video, category)' });
    }

    const adData = {
      vendor_id: null,
      user_id: userId,
      caption: caption || title || '',
      location: location || '',
      category,
      tags: tags || [],
      target_language: Array.isArray(target_language) ? target_language : (target_language ? [target_language] : []),
      target_location: Array.isArray(target_location) ? target_location : (target_location ? [target_location] : []),
      target_preferences: target_preferences || [],
      total_budget_coins: budget,
      total_coins_spent: 0,
      status: 'pending',
      hashtags: hashtags || [],
      tagged_users: tagged_users || [],
      engagement_controls: engagement_controls || { hide_likes_count: false, disable_comments: false },
      content_type: content_type || 'reel'
    };

    const baseUrl = `${req.protocol}://${req.get('host')}/uploads/`;

    if (hasNewMedia) {
      adData.media = media.map(m => ({
        ...m,
        fileUrl: m.fileUrl && !m.fileUrl.startsWith('http') ? `${baseUrl}${m.fileUrl}` : m.fileUrl,
        thumbnails: m.thumbnails ? m.thumbnails.map(t => ({
          ...t,
          fileUrl: t.fileUrl && !t.fileUrl.startsWith('http') ? `${baseUrl}${t.fileUrl}` : t.fileUrl
        })) : []
      }));
    } else {
      const fullVideoUrl = video_url.startsWith('http') ? video_url : `${baseUrl}${video_url}`;
      const fullThumbnailUrl = thumbnail_url && !thumbnail_url.startsWith('http')
        ? `${baseUrl}${thumbnail_url}`
        : thumbnail_url;

      adData.media = [{
        fileName: video_fileName,
        fileUrl: fullVideoUrl,
        media_type: 'video',
        video_meta: {
          final_duration: duration_seconds
        },
        thumbnails: fullThumbnailUrl ? [{
          fileName: thumbnail_fileName || 'thumbnail',
          media_type: 'image',
          fileUrl: fullThumbnailUrl
        }] : []
      }];
    }

    let createdAd;

    await runMongoTransaction({
      work: async (session) => {
        const vendor = await Vendor.findOne({ user_id: userId }).session(session);
        if (!vendor) {
          const err = new Error('Vendor profile not found');
          err.statusCode = 403;
          throw err;
        }
        if (!vendor.validated) {
          const err = new Error('Vendor account not validated');
          err.statusCode = 403;
          throw err;
        }

        adData.vendor_id = vendor._id;

        const wallet = await Wallet.findOneAndUpdate(
          { user_id: vendor.user_id, balance: { $gte: budget } },
          { $inc: { balance: -budget } },
          { new: true, session }
        );
        if (!wallet) {
          const err = new Error('Insufficient wallet balance for total budget');
          err.statusCode = 400;
          throw err;
        }

        const [adDoc] = await Ad.create([adData], { session });
        createdAd = adDoc;

        await WalletTransaction.create([{
          user_id: vendor.user_id,
          vendor_id: vendor._id,
          ad_id: adDoc._id,
          type: 'AD_BUDGET_DEDUCTION',
          amount: -budget,
          status: 'SUCCESS',
          description: 'ad_creation: reserved ad budget from vendor wallet'
        }], { session });
      },
      fallback: async () => {
        const vendor = await Vendor.findOne({ user_id: userId });
        if (!vendor) {
          const err = new Error('Vendor profile not found');
          err.statusCode = 403;
          throw err;
        }
        if (!vendor.validated) {
          const err = new Error('Vendor account not validated');
          err.statusCode = 403;
          throw err;
        }

        adData.vendor_id = vendor._id;

        const wallet = await Wallet.findOneAndUpdate(
          { user_id: vendor.user_id, balance: { $gte: budget } },
          { $inc: { balance: -budget } },
          { new: true }
        );
        if (!wallet) {
          const err = new Error('Insufficient wallet balance for total budget');
          err.statusCode = 400;
          throw err;
        }

        let adDoc;
        try {
          adDoc = await Ad.create(adData);
          createdAd = adDoc;
          await WalletTransaction.create({
            user_id: vendor.user_id,
            vendor_id: vendor._id,
            ad_id: adDoc._id,
            type: 'AD_BUDGET_DEDUCTION',
            amount: -budget,
            status: 'SUCCESS',
            description: 'ad_creation: reserved ad budget from vendor wallet'
          });
        } catch (e) {
          await Wallet.findOneAndUpdate({ user_id: vendor.user_id }, { $inc: { balance: budget } });
          await WalletTransaction.create({
            user_id: vendor.user_id,
            vendor_id: vendor._id,
            type: 'ADMIN_ADJUSTMENT',
            amount: budget,
            status: 'SUCCESS',
            description: 'refund: ad creation failed after budget deduction'
          });
          throw e;
        }
      }
    });

    if (createdAd) {
      res.status(201).json(createdAd);
    }
  } catch (error) {
    const status = error.statusCode || 500;
    if (status !== 500) {
      return res.status(status).json({ message: error.message });
    }
    console.error('Create ad error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Vendor delete ad (soft delete)
 * @route DELETE /api/ads/:id
 * @access Private (Vendor)
 */
exports.deleteAd = async (req, res) => {
  try {
    const userId = req.userId;
    const adId = req.params.id;

    const ad = await Ad.findById(adId);

    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    // Check ownership
    if (ad.user_id.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this ad' });
    }

    ad.isDeleted = true;
    ad.deletedBy = userId;
    ad.deletedAt = new Date();
    
    await ad.save();

    res.json({ message: 'Ad deleted successfully' });
  } catch (error) {
    console.error('Delete ad error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * List all ads (Admin only)
 * @route GET /api/ads/admin/all
 * @access Private (Admin)
 */
exports.listAds = async (req, res) => {
  try {
    const filter = { isDeleted: false };
    const ads = await Ad.find(filter)
      .populate('vendor_id', 'business_name logo_url validated')
      .populate('user_id', 'username full_name avatar_url gender location')
      .sort({ createdAt: -1 });

    const total = ads.length;

    res.json({
      total,
      page: 1,
      limit: total,
      totalPages: total ? 1 : 0,
      ads
    });
  } catch (error) {
    console.error('List ads error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get active ads feed (Authenticated users)
 * @route GET /api/ads/feed
 * @access Private
 */
exports.getAdsFeed = async (req, res) => {
  try {
    const userId = req.userId;
    const { category } = req.query;

    const filter = { status: 'active', isDeleted: false };
    if (category && category !== 'All') {
      filter.category = category;
    }

    const ads = await Ad.find(filter)
      .populate('vendor_id', 'business_name logo_url validated')
      .populate('user_id', 'username full_name avatar_url gender location')
      .sort({ createdAt: -1 })
      .lean();

    // Check rewards status for each ad
    const adsWithStatus = await Promise.all(ads.map(async (ad) => {
      const adView = await AdView.findOne({
        ad_id: ad._id,
        user_id: userId,
        rewarded: true
      });
      return {
        ...ad,
        is_rewarded_by_me: !!adView,
        is_liked_by_me: ad.likes && ad.likes.some(id => id.toString() === userId.toString())
      };
    }));

    res.json(adsWithStatus);
  } catch (error) {
    console.error('Get ads feed error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get all ads for a specific user (Vendor only) with comments
 * @route GET /api/ads/user/:userId
 * @access Public (or Private)
 */
exports.getUserAdsWithComments = async (req, res) => {
  try {
    const { userId } = req.params;
    const { category } = req.query;

    // check if user exists and is a vendor
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role !== 'vendor') {
      return res.status(403).json({ message: 'User is not a vendor' });
    }

    const filter = { user_id: userId, isDeleted: false };
    
    // Add category filter if provided and not empty
    if (category && category.trim() !== '' && category !== 'All') {
      filter.category = category;
    }

    // Fetch ads regardless of status (active, pending, rejected)
    // Only exclude deleted ads
    const ads = await Ad.find(filter)
      .populate('vendor_id', 'business_name logo_url validated')
      .populate('user_id', 'username full_name avatar_url gender location')
      .sort({ createdAt: -1 })
      .lean();

    // Fetch comments for each ad
    const adsWithComments = await Promise.all(ads.map(async (ad) => {
      const comments = await AdComment.find({ ad_id: ad._id, isDeleted: false })
        .populate('user_id', 'username full_name avatar_url gender location')
        .sort({ createdAt: -1 })
        .lean();
      
      return {
        ...ad,
        comments
      };
    }));

    res.json(adsWithComments);
  } catch (error) {
    console.error('Get user ads error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get single ad by ID
 * @route GET /api/ads/:id
 * @access Private
 */
exports.getAdById = async (req, res) => {
  try {
    const userId = req.userId;
    const ad = await Ad.findOne({ _id: req.params.id, isDeleted: false })
      .populate('vendor_id', 'business_name logo_url validated description website')
      .populate('user_id', 'username full_name avatar_url gender location')
      .lean();

    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    const adView = await AdView.findOne({
      ad_id: ad._id,
      user_id: userId,
      rewarded: true
    });

    ad.is_rewarded_by_me = !!adView;
    ad.is_liked_by_me = ad.likes && ad.likes.some(id => id.toString() === userId.toString());

    res.json(ad);
  } catch (error) {
    console.error('Get ad error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get ad categories
 * @route GET /api/ads/categories
 * @access Public
 */
exports.getAdCategories = async (req, res) => {
  try {
    let categories = await AdCategory.find({ isEnabled: true }).sort({ name: 1 });
    
    // Seed if empty
    if (categories.length === 0) {
      const seedData = adCategories.map(name => ({ name }));
      try {
        await AdCategory.insertMany(seedData);
        categories = await AdCategory.find({ isEnabled: true }).sort({ name: 1 });
      } catch (e) {
        console.error('Failed to seed categories:', e);
        // Fallback to static list if DB fails
        return res.json({ categories: adCategories });
      }
    }

    res.json({ categories: categories.map(c => c.name) });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Add a new ad category
 * @route POST /api/ads/categories
 * @access Private
 */
exports.addAdCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const existing = await AdCategory.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ message: 'Category already exists' });
    }

    const category = new AdCategory({ name: name.trim() });
    await category.save();

    res.status(201).json({ message: 'Category added', category: category.name });
  } catch (error) {
    console.error('Add category error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Record an ad view
 * @route POST /api/ads/:id/view
 * @access Private
 */
exports.recordAdView = async (req, res) => {
  try {
    const userId = req.userId;
    const adId = req.params.id;

    const ad = await Ad.findById(adId);
    if (!ad || ad.status !== 'active' || ad.isDeleted) {
      return res.status(404).json({ message: 'Ad not available' });
    }

    let adView = await AdView.findOne({ ad_id: adId, user_id: userId });
    let isUnique = false;

    if (!adView) {
      adView = new AdView({
        ad_id: adId,
        user_id: userId,
        view_count: 1
      });
      isUnique = true;
    } else {
      adView.view_count += 1;
    }

    await adView.save();

    // Update ad statistics
    const update = { $inc: { views_count: 1 } };
    if (isUnique) {
      update.$inc.unique_views_count = 1;
    }
    await Ad.findByIdAndUpdate(adId, update);

    res.json({ message: 'View recorded', view_count: adView.view_count });
  } catch (error) {
    console.error('Record ad view error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Complete an ad view (reward)
 * @route POST /api/ads/:id/complete
 * @access Private
 */
exports.completeAdView = async (req, res) => {
  try {
    const userId = String(req.userId);
    const adId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    let rewardPaid = 0;

    await runMongoTransaction({
      work: async (session) => {
        const ad = await Ad.findById(adId).session(session);
        if (!ad || ad.status !== 'active' || ad.isDeleted) {
          const err = new Error('Ad not available');
          err.statusCode = 404;
          throw err;
        }

        const adView = await AdView.findOne({ ad_id: adId, user_id: userId }).session(session);
        if (!adView) {
          const err = new Error('View not recorded first');
          err.statusCode = 400;
          throw err;
        }

        if (adView.rewarded) {
          const err = new Error('Already rewarded for this ad');
          err.statusCode = 400;
          throw err;
        }

        const rewardAmount = Number(ad.coins_reward || 0);
        const remaining = Number(ad.total_budget_coins || 0) - Number(ad.total_coins_spent || 0);
        if (rewardAmount > 0 && ad.user_id.toString() !== userId && remaining < rewardAmount) {
          const err = new Error('Ad budget exhausted');
          err.statusCode = 400;
          throw err;
        }

        adView.rewarded = true;
        adView.completed_at = new Date();
        await adView.save({ session });

        ad.completed_views_count = Number(ad.completed_views_count || 0) + 1;

        if (rewardAmount > 0 && ad.user_id.toString() !== userId) {
          ad.total_coins_spent = Number(ad.total_coins_spent || 0) + rewardAmount;

          await Wallet.findOneAndUpdate(
            { user_id: userId },
            { $inc: { balance: rewardAmount } },
            { upsert: true, session }
          );

          await WalletTransaction.create([
            {
              user_id: userId,
              vendor_id: ad.vendor_id,
              ad_id: ad._id,
              type: 'AD_VIEW_REWARD',
              amount: rewardAmount,
              status: 'SUCCESS',
              description: 'Reward for completing ad view'
            },
            {
              user_id: ad.user_id,
              vendor_id: ad.vendor_id,
              ad_id: ad._id,
              type: 'AD_VIEW_DEDUCTION',
              amount: -rewardAmount,
              status: 'SUCCESS',
              description: 'Ad budget spent (view)'
            }
          ], { session });

          rewardPaid = rewardAmount;
        }

        await ad.save({ session });
      },
      fallback: async () => {
        const ad = await Ad.findById(adId);
        if (!ad || ad.status !== 'active' || ad.isDeleted) {
          const err = new Error('Ad not available');
          err.statusCode = 404;
          throw err;
        }

        const adView = await AdView.findOne({ ad_id: adId, user_id: userId });
        if (!adView) {
          const err = new Error('View not recorded first');
          err.statusCode = 400;
          throw err;
        }

        if (adView.rewarded) {
          const err = new Error('Already rewarded for this ad');
          err.statusCode = 400;
          throw err;
        }

        const rewardAmount = Number(ad.coins_reward || 0);
        const remaining = Number(ad.total_budget_coins || 0) - Number(ad.total_coins_spent || 0);
        if (rewardAmount > 0 && ad.user_id.toString() !== userId && remaining < rewardAmount) {
          const err = new Error('Ad budget exhausted');
          err.statusCode = 400;
          throw err;
        }

        adView.rewarded = true;
        adView.completed_at = new Date();
        await adView.save();

        ad.completed_views_count = Number(ad.completed_views_count || 0) + 1;

        if (rewardAmount > 0 && ad.user_id.toString() !== userId) {
          ad.total_coins_spent = Number(ad.total_coins_spent || 0) + rewardAmount;
          await Wallet.findOneAndUpdate(
            { user_id: userId },
            { $inc: { balance: rewardAmount } },
            { upsert: true }
          );

          await WalletTransaction.create([
            {
              user_id: userId,
              vendor_id: ad.vendor_id,
              ad_id: ad._id,
              type: 'AD_VIEW_REWARD',
              amount: rewardAmount,
              status: 'SUCCESS',
              description: 'Reward for completing ad view'
            },
            {
              user_id: ad.user_id,
              vendor_id: ad.vendor_id,
              ad_id: ad._id,
              type: 'AD_VIEW_DEDUCTION',
              amount: -rewardAmount,
              status: 'SUCCESS',
              description: 'Ad budget spent (view)'
            }
          ]);

          rewardPaid = rewardAmount;
        }

        await ad.save();
      }
    });

    res.json({
      message: rewardPaid > 0 ? 'Ad completed and rewarded' : 'Ad completed (no reward configured)',
      reward: rewardPaid
    });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status !== 500) {
      return res.status(status).json({ message: error.message });
    }
    console.error('Complete ad view error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Like/Unlike an ad
 * @route POST /api/ads/:id/like
 * @access Private
 */
exports.likeAd = async (req, res) => {
  try {
    const adId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    const bodyUserId = req.body?.user?.id || req.body?.user_id || req.body?.userId;
    const actingUserId = String(bodyUserId || req.userId);
    if (bodyUserId && String(bodyUserId) !== String(req.userId) && req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const rewardAmount = REWARD_COINS;
    let coinsEarned = 0;
    let finalLikesCount = 0;

    await runMongoTransaction({
      work: async (session) => {
        const ad = await Ad.findById(adId).session(session);
        if (!ad || ad.isDeleted) {
          const err = new Error('Ad not found');
          err.statusCode = 404;
          throw err;
        }

        const alreadyLiked = ad.likes && ad.likes.some(like => like.toString() === actingUserId);
        if (alreadyLiked) {
          const err = new Error('Already liked');
          err.statusCode = 409;
          throw err;
        }

        const remaining = Number(ad.total_budget_coins || 0) - Number(ad.total_coins_spent || 0);
        if (ad.user_id.toString() !== actingUserId && remaining < rewardAmount) {
          const err = new Error('Ad budget exhausted');
          err.statusCode = 400;
          throw err;
        }

        ad.likes.unshift(actingUserId);
        ad.likes_count = Number(ad.likes_count || 0) + 1;

        if (ad.user_id.toString() !== actingUserId) {
          ad.total_coins_spent = Number(ad.total_coins_spent || 0) + rewardAmount;
          coinsEarned = rewardAmount;

          await Wallet.findOneAndUpdate(
            { user_id: actingUserId },
            { $inc: { balance: rewardAmount } },
            { upsert: true, new: true, session }
          );

          await WalletTransaction.create([
            {
              user_id: actingUserId,
              vendor_id: ad.vendor_id,
              ad_id: ad._id,
              type: 'AD_LIKE_REWARD',
              amount: rewardAmount,
              status: 'SUCCESS',
              description: 'Reward for liking ad'
            },
            {
              user_id: ad.user_id,
              vendor_id: ad.vendor_id,
              ad_id: ad._id,
              type: 'AD_LIKE_DEDUCTION',
              amount: -rewardAmount,
              status: 'SUCCESS',
              description: 'Ad budget spent (like)'
            }
          ], { session });
        }

        await ad.save({ session });
        finalLikesCount = ad.likes_count;
      },
      fallback: async () => {
        const ad = await Ad.findById(adId);
        if (!ad || ad.isDeleted) {
          const err = new Error('Ad not found');
          err.statusCode = 404;
          throw err;
        }

        const alreadyLiked = ad.likes && ad.likes.some(like => like.toString() === actingUserId);
        if (alreadyLiked) {
          const err = new Error('Already liked');
          err.statusCode = 409;
          throw err;
        }

        const remaining = Number(ad.total_budget_coins || 0) - Number(ad.total_coins_spent || 0);
        if (ad.user_id.toString() !== actingUserId && remaining < rewardAmount) {
          const err = new Error('Ad budget exhausted');
          err.statusCode = 400;
          throw err;
        }

        ad.likes.unshift(actingUserId);
        ad.likes_count = Number(ad.likes_count || 0) + 1;

        if (ad.user_id.toString() !== actingUserId) {
          ad.total_coins_spent = Number(ad.total_coins_spent || 0) + rewardAmount;
          coinsEarned = rewardAmount;

          await Wallet.findOneAndUpdate(
            { user_id: actingUserId },
            { $inc: { balance: rewardAmount } },
            { upsert: true, new: true }
          );

          await WalletTransaction.create([
            {
              user_id: actingUserId,
              vendor_id: ad.vendor_id,
              ad_id: ad._id,
              type: 'AD_LIKE_REWARD',
              amount: rewardAmount,
              status: 'SUCCESS',
              description: 'Reward for liking ad'
            },
            {
              user_id: ad.user_id,
              vendor_id: ad.vendor_id,
              ad_id: ad._id,
              type: 'AD_LIKE_DEDUCTION',
              amount: -rewardAmount,
              status: 'SUCCESS',
              description: 'Ad budget spent (like)'
            }
          ]);
        }

        await ad.save();
        finalLikesCount = ad.likes_count;
      }
    });

    try {
      const ad = await Ad.findById(adId).select('user_id').lean();
      if (ad && ad.user_id.toString() !== actingUserId) {
        const liker = await User.findById(actingUserId).select('username').lean();
        if (liker) {
          await sendNotification(req.app, {
            recipient: ad.user_id,
            sender: actingUserId,
            type: 'ad_like',
            message: `${liker.username} liked your ad`,
            link: `/ads/${ad._id}`
          });
        }
      }
    } catch (notifErr) {
      console.error('Ad like notification error:', notifErr);
    }

    res.json({ likes_count: finalLikesCount, is_liked: true, coins_earned: coinsEarned });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status !== 500) {
      return res.status(status).json({ message: error.message });
    }
    console.error('Like ad error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Dislike/Undislike an ad
 * @route POST /api/ads/:id/dislike
 * @access Private
 */
exports.dislikeAd = async (req, res) => {
  try {
    const adId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    const bodyUserId = req.body?.user?.id || req.body?.user_id || req.body?.userId;
    const actingUserId = String(bodyUserId || req.userId);
    if (bodyUserId && String(bodyUserId) !== String(req.userId) && req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const rewardAmount = REWARD_COINS;
    let finalLikesCount = 0;

    await runMongoTransaction({
      work: async (session) => {
        const ad = await Ad.findById(adId).session(session);
        if (!ad || ad.isDeleted) {
          const err = new Error('Ad not found');
          err.statusCode = 404;
          throw err;
        }

        const alreadyLiked = ad.likes && ad.likes.some(like => like.toString() === actingUserId);
        if (!alreadyLiked) {
          const err = new Error('You can only dislike ads you previously liked');
          err.statusCode = 400;
          throw err;
        }

        const wallet = await Wallet.findOneAndUpdate(
          { user_id: actingUserId, balance: { $gte: rewardAmount } },
          { $inc: { balance: -rewardAmount } },
          { new: true, session }
        );
        if (!wallet) {
          const err = new Error('Insufficient wallet balance to reverse like');
          err.statusCode = 400;
          throw err;
        }

        ad.likes = ad.likes.filter(like => like.toString() !== actingUserId);
        ad.likes_count = Math.max(0, Number(ad.likes_count || 0) - 1);
        ad.total_coins_spent = Math.max(0, Number(ad.total_coins_spent || 0) - rewardAmount);

        await WalletTransaction.create([
          {
            user_id: actingUserId,
            vendor_id: ad.vendor_id,
            ad_id: ad._id,
            type: 'AD_LIKE_REWARD_REVERSAL',
            amount: -rewardAmount,
            status: 'SUCCESS',
            description: 'Reversal of like reward'
          },
          {
            user_id: ad.user_id,
            vendor_id: ad.vendor_id,
            ad_id: ad._id,
            type: 'AD_LIKE_BUDGET_REFUND',
            amount: rewardAmount,
            status: 'SUCCESS',
            description: 'Refund to ad budget (like reversal)'
          }
        ], { session });

        await ad.save({ session });
        finalLikesCount = ad.likes_count;
      },
      fallback: async () => {
        const ad = await Ad.findById(adId);
        if (!ad || ad.isDeleted) {
          const err = new Error('Ad not found');
          err.statusCode = 404;
          throw err;
        }

        const alreadyLiked = ad.likes && ad.likes.some(like => like.toString() === actingUserId);
        if (!alreadyLiked) {
          const err = new Error('You can only dislike ads you previously liked');
          err.statusCode = 400;
          throw err;
        }

        const wallet = await Wallet.findOneAndUpdate(
          { user_id: actingUserId, balance: { $gte: rewardAmount } },
          { $inc: { balance: -rewardAmount } },
          { new: true }
        );
        if (!wallet) {
          const err = new Error('Insufficient wallet balance to reverse like');
          err.statusCode = 400;
          throw err;
        }

        try {
          ad.likes = ad.likes.filter(like => like.toString() !== actingUserId);
          ad.likes_count = Math.max(0, Number(ad.likes_count || 0) - 1);
          ad.total_coins_spent = Math.max(0, Number(ad.total_coins_spent || 0) - rewardAmount);

          await WalletTransaction.create([
            {
              user_id: actingUserId,
              vendor_id: ad.vendor_id,
              ad_id: ad._id,
              type: 'AD_LIKE_REWARD_REVERSAL',
              amount: -rewardAmount,
              status: 'SUCCESS',
              description: 'Reversal of like reward'
            },
            {
              user_id: ad.user_id,
              vendor_id: ad.vendor_id,
              ad_id: ad._id,
              type: 'AD_LIKE_BUDGET_REFUND',
              amount: rewardAmount,
              status: 'SUCCESS',
              description: 'Refund to ad budget (like reversal)'
            }
          ]);

          await ad.save();
          finalLikesCount = ad.likes_count;
        } catch (e) {
          await Wallet.findOneAndUpdate({ user_id: actingUserId }, { $inc: { balance: rewardAmount } });
          throw e;
        }
      }
    });

    res.json({ likes_count: finalLikesCount, is_disliked: true, coins_deducted: rewardAmount });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status !== 500) {
      return res.status(status).json({ message: error.message });
    }
    console.error('Dislike ad error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


/**
 * Save an ad
 * @route POST /api/ads/:id/save
 * @access Private
 */
exports.saveAd = async (req, res) => {
  try {
    const userId = req.userId;
    const adId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    const ad = await Ad.findById(adId);
    if (!ad || ad.isDeleted) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    let created = false;
    try {
      await SavedAd.create({ user_id: userId, ad_id: adId });
      created = true;
    } catch (e) {
      if (e.code === 11000) {
        return res.status(409).json({ message: 'Already saved' });
      }
      throw e;
    }

    let coinsEarned = 0;
    if (created && ad.user_id.toString() !== userId.toString()) {
      const rewardAmount = REWARD_COINS;
      const remaining = Number(ad.total_budget_coins || 0) - Number(ad.total_coins_spent || 0);
      if (remaining >= rewardAmount) {
        await runMongoTransaction({
          work: async (session) => {
            const adDoc = await Ad.findById(adId).session(session);
            if (!adDoc || adDoc.isDeleted) {
              const err = new Error('Ad not found');
              err.statusCode = 404;
              throw err;
            }
            const remainingNow = Number(adDoc.total_budget_coins || 0) - Number(adDoc.total_coins_spent || 0);
            if (remainingNow < rewardAmount) {
              return;
            }

            await Wallet.findOneAndUpdate(
              { user_id: userId },
              { $inc: { balance: rewardAmount } },
              { upsert: true, session }
            );

            adDoc.total_coins_spent = Number(adDoc.total_coins_spent || 0) + rewardAmount;
            await adDoc.save({ session });

            await WalletTransaction.create([
              {
                user_id: userId,
                vendor_id: adDoc.vendor_id,
                ad_id: adDoc._id,
                type: 'AD_SAVE_REWARD',
                amount: rewardAmount,
                status: 'SUCCESS',
                description: 'Reward for saving ad'
              },
              {
                user_id: adDoc.user_id,
                vendor_id: adDoc.vendor_id,
                ad_id: adDoc._id,
                type: 'AD_SAVE_DEDUCTION',
                amount: -rewardAmount,
                status: 'SUCCESS',
                description: 'Ad budget spent (save)'
              }
            ], { session });

            coinsEarned = rewardAmount;
          },
          fallback: async () => {
            const adDoc = await Ad.findById(adId);
            if (!adDoc || adDoc.isDeleted) {
              const err = new Error('Ad not found');
              err.statusCode = 404;
              throw err;
            }
            const remainingNow = Number(adDoc.total_budget_coins || 0) - Number(adDoc.total_coins_spent || 0);
            if (remainingNow < rewardAmount) {
              return;
            }

            await Wallet.findOneAndUpdate(
              { user_id: userId },
              { $inc: { balance: rewardAmount } },
              { upsert: true }
            );

            adDoc.total_coins_spent = Number(adDoc.total_coins_spent || 0) + rewardAmount;
            await adDoc.save();

            await WalletTransaction.create([
              {
                user_id: userId,
                vendor_id: adDoc.vendor_id,
                ad_id: adDoc._id,
                type: 'AD_SAVE_REWARD',
                amount: rewardAmount,
                status: 'SUCCESS',
                description: 'Reward for saving ad'
              },
              {
                user_id: adDoc.user_id,
                vendor_id: adDoc.vendor_id,
                ad_id: adDoc._id,
                type: 'AD_SAVE_DEDUCTION',
                amount: -rewardAmount,
                status: 'SUCCESS',
                description: 'Ad budget spent (save)'
              }
            ]);

            coinsEarned = rewardAmount;
          }
        });
      }

      try {
        const saver = await User.findById(userId).select('username').lean();
        if (saver) {
          await sendNotification(req.app, {
            recipient: ad.user_id,
            sender: userId,
            type: 'ad_save',
            message: `${saver.username} saved your ad`,
            link: `/ads/${ad._id}`
          });
        }
      } catch (notifErr) {
        console.error('Ad save notification error:', notifErr);
      }
    }

    const saved_count = await SavedAd.countDocuments({ ad_id: adId });
    res.json({ success: true, message: 'Ad saved', saved: true, saved_count, coins_earned: coinsEarned });
  } catch (error) {
    console.error('Save ad error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Unsave an ad
 * @route POST /api/ads/:id/unsave
 * @access Private
 */
exports.unsaveAd = async (req, res) => {
  try {
    const userId = req.userId;
    const adId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    const ad = await Ad.findById(adId);
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    const rel = await SavedAd.findOne({ user_id: userId, ad_id: adId });
    if (!rel) {
      return res.status(400).json({ message: 'Not saved yet' });
    }

    await SavedAd.deleteOne({ _id: rel._id });
    const saved_count = await SavedAd.countDocuments({ ad_id: adId });
    res.json({ success: true, message: 'Ad unsaved', saved: false, saved_count });
  } catch (error) {
    console.error('Unsave ad error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Admin update ad status
 * @route PATCH /api/admin/ads/:id
 * @access Private (Admin)
 */
exports.adminUpdateAdStatus = async (req, res) => {
  try {
    const { status, rejection_reason } = req.body;
    const ad = await Ad.findById(req.params.id);

    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    if (status) ad.status = status;
    if (rejection_reason !== undefined) ad.rejection_reason = rejection_reason;

    await ad.save();

    if (status === 'approved') {
      await sendNotification(req.app, {
        recipient: ad.user_id,
        sender: null,
        type: 'ad_approved',
        message: 'Your ad has been approved and is now live!',
        link: `/ads/${ad._id}`
      });
    }

    if (status === 'rejected') {
      try {
        await sendNotification(req.app, {
          recipient: ad.user_id,
          sender: null,
          type: 'ad_rejected',
          message: 'Your ad has been rejected. Please review and resubmit.',
          link: `/ads/${ad._id}`
        });
      } catch (notifErr) {
        console.error('Ad rejected notification error:', notifErr);
      }
    }

    res.json(ad);
  } catch (error) {
    console.error('Admin update ad status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Admin delete ad (soft delete)
 * @route DELETE /api/admin/ads/:id
 * @access Private (Admin)
 */
exports.adminDeleteAd = async (req, res) => {
  try {
    const ad = await Ad.findById(req.params.id);

    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    ad.isDeleted = true;
    ad.deletedBy = req.userId;
    ad.deletedAt = new Date();
    
    // Also set status to rejected or paused? Or just leave it?
    // Usually soft delete implies it's gone from feed.
    // Our feed query checks isDeleted: false, so this is enough.

    await ad.save();
    res.json({ message: 'Ad deleted successfully' });
  } catch (error) {
    console.error('Admin delete ad error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Unified ads search (Instagram Explore style)
 * @route GET /api/ads/search
 * @access Private
 */
exports.searchAds = async (req, res) => {
  try {
    const {
      q,
      category,
      sort = 'latest',
      status,
      content_type,
      page = 1,
      limit = 20
    } = req.query;

    const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const andFilters = [{ isDeleted: false }];
    const currentUserId = req.userId ? req.userId.toString() : null;

    const isAdmin = req.user && req.user.role === 'admin';
    if (!isAdmin) {
      andFilters.push({ status: 'active' });
    } else if (status) {
      const validStatuses = ['pending', 'active', 'paused', 'rejected'];
      if (validStatuses.includes(status)) {
        andFilters.push({ status });
      }
    }

    // Optional category chip filter from UI (exact, case-insensitive)
    if (category && category.trim()) {
      const safeCategory = escapeRegex(category.trim());
      andFilters.push({ category: { $regex: new RegExp(`^${safeCategory}$`, 'i') } });
    }

    if (content_type && ['post', 'reel'].includes(content_type)) {
      andFilters.push({ content_type });
    }

    // Unified intent detection from q
    if (q && q.trim()) {
      const query = q.trim();

      // #hashtag intent
      if (query.startsWith('#')) {
        const hashtagTerm = query.slice(1).trim();
        if (hashtagTerm) {
          const hashtagRegex = new RegExp(escapeRegex(hashtagTerm), 'i');
          andFilters.push({ hashtags: { $elemMatch: { $regex: hashtagRegex } } });
        }
      // @username intent
      } else if (query.startsWith('@')) {
        const usernameTerm = query.slice(1).trim();
        if (usernameTerm) {
          const usernameRegex = new RegExp(escapeRegex(usernameTerm), 'i');
          const matchedUsers = await User.find({ username: { $regex: usernameRegex } })
            .select('_id')
            .lean();
          const matchedUserIds = matchedUsers.map((u) => u._id);
          if (matchedUserIds.length === 0) {
            return res.json({ total: 0, page: 1, limit: Math.min(50, Math.max(1, parseInt(limit, 10) || 20)), totalPages: 0, ads: [] });
          }
          andFilters.push({ user_id: { $in: matchedUserIds } });
        }
      } else {
        const safeQuery = escapeRegex(query);

        // Exact category intent if q matches an AdCategory name
        const exactCategory = await AdCategory.findOne({
          name: { $regex: new RegExp(`^${safeQuery}$`, 'i') }
        })
          .select('name')
          .lean();

        if (exactCategory) {
          andFilters.push({ category: { $regex: new RegExp(`^${escapeRegex(exactCategory.name)}$`, 'i') } });
        } else {
          // Generic keyword intent + users with matching usernames
          const keywordRegex = new RegExp(safeQuery, 'i');
          const matchedUsers = await User.find({ username: { $regex: keywordRegex } })
            .select('_id')
            .lean();
          const matchedUserIds = matchedUsers.map((u) => u._id);

          const orFilters = [
            { caption: keywordRegex },
            { location: keywordRegex },
            { hashtags: keywordRegex },
            { tags: keywordRegex }
          ];

          if (matchedUserIds.length > 0) {
            orFilters.push({ user_id: { $in: matchedUserIds } });
          }

          andFilters.push({ $or: orFilters });
        }
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;
    const filter = andFilters.length === 1 ? andFilters[0] : { $and: andFilters };

    let sortQuery = { createdAt: -1 };
    if (sort === 'popular') {
      sortQuery = { views_count: -1, likes_count: -1, createdAt: -1 };
    } else if (sort === 'top') {
      sortQuery = { likes_count: -1, completed_views_count: -1, views_count: -1, createdAt: -1 };
    }

    const [ads, total] = await Promise.all([
      Ad.find(filter)
        .populate('vendor_id', 'business_name logo_url validated')
        .populate('user_id', 'username full_name avatar_url gender location')
        .sort(sortQuery)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Ad.countDocuments(filter)
    ]);

    const adsWithInteractionFlags = ads.map((ad) => ({
      ...ad,
      is_liked_by_me: !!(currentUserId && ad.likes && ad.likes.some((id) => id.toString() === currentUserId)),
      is_disliked_by_me: !!(currentUserId && ad.dislikes && ad.dislikes.some((id) => id.toString() === currentUserId))
    }));

    res.json({
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      ads: adsWithInteractionFlags
    });
  } catch (error) {
    console.error('Search ads error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
