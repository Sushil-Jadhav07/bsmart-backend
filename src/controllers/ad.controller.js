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

const REWARD_COINS = 10; // Coins given to user when they like/comment/reply/save an ad (deducted from ad creator)

/**
 * Create a new ad (Vendor only)
 * @route POST /api/ads
 * @access Private (Vendor)
 */
exports.createAd = async (req, res) => {
  try {
    const userId = req.userId;
    
    // Validate vendor status
    const vendor = await Vendor.findOne({ user_id: userId });
    if (!vendor) {
      return res.status(403).json({ message: 'Vendor profile not found' });
    }
    if (!vendor.validated) {
      return res.status(403).json({ message: 'Vendor account not validated' });
    }

    const {
      title, // Kept for backwards compatibility if needed, or map caption to it
      caption,
      location,
      media,
      hashtags,
      tagged_users,
      engagement_controls,
      content_type,
      // Legacy fields (map to new structure if possible, or keep optional)
      video_fileName,
      video_url,
      thumbnail_fileName,
      thumbnail_url,
      duration_seconds,
      // Common fields
      coins_reward,
      category,
      tags,
      target_language,
      target_location,
      target_preferences,
      total_budget_coins
    } = req.body;

    // Validation: Require media array OR legacy fields
    const hasNewMedia = media && Array.isArray(media) && media.length > 0;
    const hasLegacyMedia = video_fileName && video_url && duration_seconds;

    if ((!hasNewMedia && !hasLegacyMedia) || !category) {
      return res.status(400).json({ message: 'Missing required fields (media/video, category)' });
    }

    // Construct Ad Object
    const adData = {
      vendor_id: vendor._id,
      user_id: userId,
      // Map title to caption if caption missing, or vice versa
      caption: caption || title || '', 
      location: location || '',
      category,
      tags: tags || [],
      target_language: Array.isArray(target_language) ? target_language : (target_language ? [target_language] : []),
      target_location: Array.isArray(target_location) ? target_location : (target_location ? [target_location] : []),
      target_preferences: target_preferences || [],
      total_budget_coins: total_budget_coins || 0,
      status: 'pending',
      // New fields
      hashtags: hashtags || [],
      tagged_users: tagged_users || [],
      engagement_controls: engagement_controls || { hide_likes_count: false, disable_comments: false },
      content_type: content_type || 'reel'
    };

    const baseUrl = `${req.protocol}://${req.get('host')}/uploads/`;

    if (hasNewMedia) {
      // Process new media array
      adData.media = media.map(m => ({
        ...m,
        fileUrl: m.fileUrl && !m.fileUrl.startsWith('http') ? `${baseUrl}${m.fileUrl}` : m.fileUrl,
        thumbnails: m.thumbnails ? m.thumbnails.map(t => ({
          ...t,
          fileUrl: t.fileUrl && !t.fileUrl.startsWith('http') ? `${baseUrl}${t.fileUrl}` : t.fileUrl
        })) : []
      }));
    } else {
      // Backwards compatibility: Map legacy fields to media array
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

    // Check vendor wallet balance
    const vendorWallet = await Wallet.findOne({ user_id: vendor.user_id });
    if (!vendorWallet || vendorWallet.balance < total_budget_coins) {
      return res.status(400).json({ message: 'Insufficient wallet balance for total budget' });
    }

    // Deduct budget from vendor wallet
    await Wallet.findOneAndUpdate(
      { user_id: vendor.user_id },
      { $inc: { balance: -total_budget_coins } }
    );

    // Create transaction for budget deduction
    // Note: We don't have an ad_id yet, so we'll create the ad first then transaction?
    // Better to create ad first but not save? No, let's create transaction after ad save.
    // But if ad save fails, we need to rollback.
    // Simple approach: create ad first, then deduct.

    const newAd = new Ad(adData);
    await newAd.save();

   await WalletTransaction.create({
  user_id: vendor.user_id,
  ad_id: newAd._id,
  // Vendor spend when creating an ad
  type: 'AD_BUDGET_DEDUCTION',
  amount: -total_budget_coins,
  status: 'SUCCESS'
});
    res.status(201).json(newAd);
  } catch (error) {
    console.error('Create ad error:', error);
    // TODO: If wallet was deducted but ad creation failed (unlikely order above), refund.
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
    const userId = req.userId;
    const adId = req.params.id;

    const ad = await Ad.findById(adId);
    if (!ad || ad.status !== 'active' || ad.isDeleted) {
      return res.status(404).json({ message: 'Ad not available' });
    }

    const adView = await AdView.findOne({ ad_id: adId, user_id: userId });
    
    if (!adView) {
      return res.status(400).json({ message: 'View not recorded first' });
    }

    if (adView.rewarded) {
      return res.status(400).json({ message: 'Already rewarded for this ad' });
    }

    // Check budget
    if (ad.total_coins_spent + ad.coins_reward > ad.total_budget_coins) {
      return res.status(400).json({ message: 'Ad budget exhausted' });
    }

    // Update AdView
    adView.rewarded = true;
    adView.completed_at = new Date();
    await adView.save();

    // Update Ad stats
    await Ad.findByIdAndUpdate(adId, {
      $inc: { 
        completed_views_count: 1,
        total_coins_spent: ad.coins_reward 
      }
    });

    // Credit member and deduct ad owner
    if (ad.coins_reward > 0) {
      const rewardAmount = ad.coins_reward;

      // 1. Credit member wallet
      await Wallet.findOneAndUpdate(
        { user_id: userId },
        { $inc: { balance: rewardAmount } },
        { upsert: true }
      );

      // 2. Deduct from ad owner (budget was pre-funded at createAd via AD_BUDGET_DEDUCTION)
      await Wallet.findOneAndUpdate({ user_id: ad.user_id }, { $inc: { balance: -rewardAmount } });
      // 3. Record deduction transaction
      try {
        await WalletTransaction.create({ user_id: ad.user_id, ad_id: adId, type: 'AD_VIEW_DEDUCTION', amount: rewardAmount, status: 'SUCCESS' });
      } catch (txErr) {
        if (txErr.code !== 11000) console.error('Ad view deduction transaction error:', txErr);
      }

      // 3. Record reward transaction for member
      try {
        await WalletTransaction.create({
          user_id: userId,
          ad_id: adId,
          type: 'AD_VIEW_REWARD',
          amount: rewardAmount,
          status: 'SUCCESS'
        });
      } catch (txErr) {
        console.error('Ad view reward transaction error:', txErr);
      }

      return res.json({
        message: 'Ad completed and rewarded',
        reward: rewardAmount,
        member_balance_change: `+${rewardAmount}`,
        owner_balance_change: `-${rewardAmount}`
      });
    }

    res.json({ message: 'Ad completed (no reward configured)', reward: 0 });
  } catch (error) {
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
    const ad = await Ad.findById(req.params.id);
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    // Check if ad has already been liked
    if (ad.likes.filter(like => like.toString() === req.userId).length > 0) {
      // Unlike
      const index = ad.likes.map(like => like.toString()).indexOf(req.userId);
      ad.likes.splice(index, 1);
      ad.likes_count = Math.max(0, ad.likes_count - 1);
      await ad.save();
      return res.json({ likes_count: ad.likes_count, is_liked: false });
    }

    // Like
    ad.likes.unshift(req.userId);
    ad.likes_count += 1;
    await ad.save();

    try {
      if (ad.user_id.toString() !== req.userId.toString()) {
        const liker = await User.findById(req.userId).select('username').lean();
        if (liker) {
          await sendNotification(req.app, {
            recipient: ad.user_id,
            sender: req.userId,
            type: 'ad_like',
            message: `${liker.username} liked your ad`,
            link: `/ads/${ad._id}`
          });
        }
      }
    } catch (notifErr) {
      console.error('Ad like notification error:', notifErr);
    }

    let memberReward = 0;
    if (ad.user_id.toString() !== req.userId.toString()) {
      const rewardAmount = REWARD_COINS; // 10 coins for ad engagement
      const remaining = ad.total_budget_coins - ad.total_coins_spent;
      if (remaining >= rewardAmount) {
        const ownerWallet = await Wallet.findOne({ user_id: ad.user_id });
        if (ownerWallet && ownerWallet.balance >= rewardAmount) {
          try {
            await Wallet.findOneAndUpdate({ user_id: req.userId }, { $inc: { balance: rewardAmount } }, { upsert: true });
            await Wallet.findOneAndUpdate({ user_id: ad.user_id }, { $inc: { balance: -rewardAmount } });
            await Ad.findByIdAndUpdate(ad._id, { $inc: { total_coins_spent: rewardAmount } });
            await WalletTransaction.create({ user_id: req.userId, ad_id: ad._id, type: 'AD_LIKE_REWARD', amount: rewardAmount, status: 'SUCCESS' });
            await WalletTransaction.create({ user_id: ad.user_id, ad_id: ad._id, type: 'AD_LIKE_DEDUCTION', amount: rewardAmount, status: 'SUCCESS' });
            memberReward = rewardAmount;
          } catch (walletErr) {
            if (walletErr.code !== 11000) console.error('Ad like wallet credit error:', walletErr);
          }
        }
      }
    }

    res.json({ likes_count: ad.likes_count, is_liked: true, coins_earned: memberReward });
  } catch (error) {
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
    const ad = await Ad.findById(req.params.id);
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    // Check if ad has already been disliked
    if (ad.dislikes.filter(dislike => dislike.toString() === req.userId).length > 0) {
      // Undislike
      const index = ad.dislikes.map(dislike => dislike.toString()).indexOf(req.userId);
      ad.dislikes.splice(index, 1);
      ad.dislikes_count = Math.max(0, ad.dislikes_count - 1);
      await ad.save();
      return res.json({ dislikes_count: ad.dislikes_count, is_disliked: false });
    }

    // Dislike
    ad.dislikes.unshift(req.userId);
    ad.dislikes_count += 1;
    await ad.save();

    res.json({ dislikes_count: ad.dislikes_count, is_disliked: true });
  } catch (error) {
    console.error('Dislike ad error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const REWARD_COINS = 10;

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
      const remaining = ad.total_budget_coins - ad.total_coins_spent;
      if (remaining >= rewardAmount) {
        const ownerWallet = await Wallet.findOne({ user_id: ad.user_id });
        if (ownerWallet && ownerWallet.balance >= rewardAmount) {
          try {
            await Wallet.findOneAndUpdate({ user_id: userId }, { $inc: { balance: rewardAmount } }, { upsert: true });
            await Wallet.findOneAndUpdate({ user_id: ad.user_id }, { $inc: { balance: -rewardAmount } });
            await Ad.findByIdAndUpdate(adId, { $inc: { total_coins_spent: rewardAmount } });
            await WalletTransaction.create({ user_id: userId, ad_id: adId, type: 'AD_SAVE_REWARD', amount: rewardAmount, status: 'SUCCESS' });
            await WalletTransaction.create({ user_id: ad.user_id, ad_id: adId, type: 'AD_SAVE_DEDUCTION', amount: rewardAmount, status: 'SUCCESS' });
            coinsEarned = rewardAmount;
          } catch (walletErr) {
            if (walletErr.code !== 11000) console.error('Ad save wallet credit error:', walletErr);
          }
        }
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
