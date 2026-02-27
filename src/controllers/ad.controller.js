const Ad = require('../models/Ad');
const AdView = require('../models/AdView');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const Vendor = require('../models/Vendor');
const adCategories = require('../data/adCategories');

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
      total_budget_coins,
      product
    } = req.body;

    // Validation: Require media array OR legacy fields
    const hasNewMedia = media && Array.isArray(media) && media.length > 0;
    const hasLegacyMedia = video_fileName && video_url && duration_seconds;

    if ((!hasNewMedia && !hasLegacyMedia) || !coins_reward || !category) {
      return res.status(400).json({ message: 'Missing required fields (media/video, coins_reward, category)' });
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
      target_language: target_language || 'en',
      target_location: target_location || '',
      target_preferences: target_preferences || [],
      total_budget_coins: total_budget_coins || 0,
      status: 'pending',
      // New fields
      hashtags: hashtags || [],
      tagged_users: tagged_users || [],
      engagement_controls: engagement_controls || { hide_likes_count: false, disable_comments: false },
      content_type: content_type || 'reel',
      product: product || {}
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
      type: 'AD_REWARD', // Or a new type 'AD_BUDGET_DEDUCTION'? Using AD_REWARD for now as expense
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
 * List all ads (Admin only)
 * @route GET /api/ads/admin/all
 * @access Private (Admin)
 */
exports.listAds = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, category } = req.query;
    const skip = (page - 1) * limit;

    const filter = { isDeleted: false };
    if (status) filter.status = status;
    if (category && category !== 'All') filter.category = category;

    const total = await Ad.countDocuments(filter);
    const ads = await Ad.find(filter)
      .populate('vendor_id', 'business_name logo_url validated')
      .populate('user_id', 'username full_name avatar_url')
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    res.json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
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
      .populate('user_id', 'username full_name avatar_url')
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
 * Get single ad by ID
 * @route GET /api/ads/:id
 * @access Private
 */
exports.getAdById = async (req, res) => {
  try {
    const userId = req.userId;
    const ad = await Ad.findOne({ _id: req.params.id, isDeleted: false })
      .populate('vendor_id', 'business_name logo_url validated description website')
      .populate('user_id', 'username full_name avatar_url')
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
exports.getAdCategories = (req, res) => {
  res.json({ categories: adCategories });
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

    // Update Ad stats
    const update = { $inc: { views_count: 1 } };
    if (isUnique) {
      update.$inc.unique_views_count = 1;
    }
    
    const updatedAd = await Ad.findByIdAndUpdate(adId, update, { new: true });

    res.json({
      success: true,
      views_count: updatedAd.views_count,
      unique_views_count: updatedAd.unique_views_count
    });
  } catch (error) {
    console.error('Record view error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Complete ad view and claim reward
 * @route POST /api/ads/:id/complete
 * @access Private
 */
exports.completeAdView = async (req, res) => {
  try {
    const userId = req.userId;
    const adId = req.params.id;
    const { watchTimeMs } = req.body;

    const ad = await Ad.findById(adId);
    if (!ad || ad.status !== 'active' || ad.isDeleted) {
      return res.status(404).json({ message: 'Ad not available' });
    }

    let adView = await AdView.findOne({ ad_id: adId, user_id: userId });
    
    if (!adView) {
      // Should normally exist from recordAdView, but create if missing
      adView = new AdView({
        ad_id: adId,
        user_id: userId
      });
    }

    // Check if already rewarded
    if (adView.rewarded) {
      const wallet = await Wallet.findOne({ user_id: userId });
      return res.json({
        success: true,
        completed: true,
        rewarded: false,
        already_rewarded: true,
        walletBalance: wallet ? wallet.balance : 0
      });
    }

    // Check budget availability
    if (ad.total_coins_spent + ad.coins_reward > ad.total_budget_coins) {
      return res.status(400).json({ message: 'Ad budget exhausted' });
    }

    // Check fraud flag
    if (adView.fraud_flagged) {
      return res.json({
        success: true,
        completed: true,
        rewarded: false,
        fraud_flagged: true
      });
    }

    // Update completion status
    adView.completed = true;
    adView.completed_at = new Date();
    if (watchTimeMs) adView.watch_time_ms = watchTimeMs;

    // Process Reward
    const rewardAmount = ad.coins_reward;
    
    // 1. Credit User Wallet (coins come from the pre-deducted budget pool)
    const wallet = await Wallet.findOneAndUpdate(
      { user_id: userId },
      { $inc: { balance: rewardAmount } },
      { new: true, upsert: true }
    );

    // 2. Create Transaction for User
    await WalletTransaction.create({
      user_id: userId,
      ad_id: ad._id,
      type: 'AD_REWARD',
      amount: rewardAmount,
      status: 'SUCCESS'
    });

    // 3. Update AdView
    adView.rewarded = true;
    adView.rewarded_at = new Date();
    adView.coins_rewarded = rewardAmount;
    await adView.save();

    // 4. Update Ad stats
    await Ad.findByIdAndUpdate(adId, {
      $inc: { 
        completed_views_count: 1,
        total_coins_spent: rewardAmount
      }
    });

    res.json({
      success: true,
      completed: true,
      rewarded: true,
      coins_earned: rewardAmount,
      walletBalance: wallet.balance
    });

  } catch (error) {
    console.error('Complete ad error:', error);
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
    if (!ad || ad.isDeleted) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    const userId = req.userId;
    const isLiked = ad.likes.includes(userId);

    if (isLiked) {
      ad.likes.pull(userId);
      ad.likes_count = Math.max(0, ad.likes_count - 1);
    } else {
      ad.likes.push(userId);
      ad.likes_count += 1;
    }

    await ad.save();

    res.json({
      liked: !isLiked,
      likes_count: ad.likes_count
    });
  } catch (error) {
    console.error('Like ad error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Admin: Update Ad Status
 * @route PATCH /api/admin/ads/:id
 * @access Private (Admin)
 */
exports.adminUpdateAdStatus = async (req, res) => {
  try {
    const { status, rejection_reason } = req.body;
    
    if (!['active', 'paused', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const updateData = { status };
    if (status === 'rejected' && rejection_reason) {
      updateData.rejection_reason = rejection_reason;
    }

    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    res.json(ad);
  } catch (error) {
    console.error('Admin update status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Admin: Delete Ad (Soft delete)
 * @route DELETE /api/admin/ads/:id
 * @access Private (Admin)
 */
exports.adminDeleteAd = async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      {
        isDeleted: true,
        deletedBy: req.userId,
        deletedAt: new Date()
      },
      { new: true }
    );

    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    res.json({ message: 'Ad deleted successfully' });
  } catch (error) {
    console.error('Admin delete ad error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
