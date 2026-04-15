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
const MemberAdAction = require('../models/MemberAdAction');
const recordAdClick = require('../utils/recordAdClick');
const recordAdEngagement = require('../utils/recordAdEngagement');
const { absolutizeUploadUrl } = require('../utils/publicUrl');
const {
  sendAdApprovedEmail,
  sendAdRejectedEmail,
  sendCoinsLowEmail,
  sendNewAdPendingAlert,
} = require('./email.controller');

const REWARD_COINS = 10; // Coins given to user when they like/comment/reply/save an ad (deducted from ad creator)
const LOW_COIN_THRESHOLD = 500;

const fireAndForget = (label, promise) => {
  promise.catch((err) => console.error(`[Email] ${label} failed:`, err.message));
};

const normalizeGalleryItem = (item, req) => ({
  ...item,
  link: absolutizeUploadUrl(item?.link || item?.url || item?.fileUrl || item?.fileName || item?.filename || item?.filname, req),
});

const normalizeAdAssets = (ad, req) => {
  if (!ad) return ad;

  return {
    ...ad,
    media: Array.isArray(ad.media)
      ? ad.media.map((mediaItem) => ({
          ...mediaItem,
          fileUrl: absolutizeUploadUrl(mediaItem?.fileUrl || mediaItem?.fileName, req),
          thumbnail_url: absolutizeUploadUrl(mediaItem?.thumbnail_url, req),
          thumbnails: Array.isArray(mediaItem?.thumbnails)
            ? mediaItem.thumbnails.map((thumb) => ({
                ...thumb,
                fileUrl: absolutizeUploadUrl(thumb?.fileUrl || thumb?.fileName, req),
              }))
            : [],
        }))
      : [],
    gallery: Array.isArray(ad.gallery) ? ad.gallery.map((item) => normalizeGalleryItem(item, req)) : ad.gallery,
    detail: Array.isArray(ad.detail) ? ad.detail.map((item) => normalizeGalleryItem(item, req)) : ad.detail,
  };
};

const normalizeAdStatus = (value) => String(value || '').trim().toLowerCase();
const VENDOR_MUTABLE_STATUSES = new Set(['draft', 'pending', 'active', 'paused', 'rejected']);

const canVendorTransitionAdStatus = (currentStatus, nextStatus) => {
  const current = normalizeAdStatus(currentStatus);
  const next = normalizeAdStatus(nextStatus);

  if (!VENDOR_MUTABLE_STATUSES.has(next)) return false;
  if (!current || current === next) return true;

  if (current === 'draft' && next === 'pending') return true;
  if (current === 'active' && next === 'paused') return true;
  if (current === 'paused' && next === 'active') return true;

  return false;
};

// ── Helper: build the "new fields" block from req.body ──────────────────────────
const buildNewFieldsFromBody = (req) => {
  const body = req.body;
  const {
    // Core
    ad_title,
    ad_description,
    ad_type,

    // CTA
    cta,

    // Budget extended
    budget,

    // Targeting (new structured object)
    targeting,

    // Categorization
    sub_category,
    keywords,

    // Engagement new controls
    // (merged below with existing engagement_controls)

    // Tracking
    tracking,

    // Compliance
    compliance,

    // Smart
    ab_testing,
    scheduling,
    gallery,
  } = body;

  const fields = {};

  // Try parsing JSON if they are strings (common in multipart/form-data)
  let parsedGallery = gallery;
  if (typeof gallery === 'string') {
    try {
      parsedGallery = JSON.parse(gallery);
    } catch (e) {
      console.warn('[AdController] Failed to parse gallery JSON:', e.message);
    }
  }

  if (Array.isArray(parsedGallery)) {
    fields.gallery = parsedGallery.map(item => ({
      link: item.link || '',
      filename: item.filename || item.filname || '',
      filname: item.filname || item.filename || ''
    }));
  }

  if (typeof ad_title !== 'undefined') fields.ad_title = ad_title || '';
  if (typeof ad_description !== 'undefined') fields.ad_description = ad_description || '';
  if (typeof ad_type !== 'undefined') {
    const validTypes = ['promote', 'general'];
    if (validTypes.includes(ad_type)) fields.ad_type = ad_type;
  }

  // CTA — dynamic enum-based system
  let parsedCta = cta;
  if (typeof cta === 'string') {
    try {
      parsedCta = JSON.parse(cta);
    } catch (e) {}
  }
  if (parsedCta && typeof parsedCta === 'object') {
    fields.cta = {
      type: parsedCta.type || 'view_site',
      url: parsedCta.url || '',
      deep_link: parsedCta.deep_link || '',
      phone_number: parsedCta.phone_number || '',
      email: parsedCta.email || '',
      whatsapp_number: parsedCta.whatsapp_number || ''
    };
  }

  // Budget extended object
  let parsedBudget = budget;
  if (typeof budget === 'string') {
    try {
      parsedBudget = JSON.parse(budget);
    } catch (e) {}
  }
  if (parsedBudget && typeof parsedBudget === 'object') {
    fields.budget = {};
    if (typeof parsedBudget.daily_budget_coins !== 'undefined') {
      const daily = Number(parsedBudget.daily_budget_coins);
      if (Number.isFinite(daily) && daily >= 0) fields.budget.daily_budget_coins = daily;
    }
    if (parsedBudget.start_date) fields.budget.start_date = new Date(parsedBudget.start_date);
    if (parsedBudget.end_date) fields.budget.end_date = new Date(parsedBudget.end_date);
    if (typeof parsedBudget.auto_stop_on_budget_exhausted !== 'undefined') {
      fields.budget.auto_stop_on_budget_exhausted = !!parsedBudget.auto_stop_on_budget_exhausted;
    }
  }

  // Structured targeting object
  let parsedTargeting = targeting;
  if (typeof targeting === 'string') {
    try {
      parsedTargeting = JSON.parse(targeting);
    } catch (e) {}
  }
  if (parsedTargeting && typeof parsedTargeting === 'object') {
    fields.targeting = {};
    if (Array.isArray(parsedTargeting.countries)) fields.targeting.countries = parsedTargeting.countries;
    if (Array.isArray(parsedTargeting.states)) fields.targeting.states = parsedTargeting.states;
    if (Array.isArray(parsedTargeting.cities)) fields.targeting.cities = parsedTargeting.cities;
    if (typeof parsedTargeting.age_min !== 'undefined') fields.targeting.age_min = Number(parsedTargeting.age_min) || 13;
    if (typeof parsedTargeting.age_max !== 'undefined') fields.targeting.age_max = Number(parsedTargeting.age_max) || 65;
    if (['all', 'male', 'female', 'other'].includes(parsedTargeting.gender)) {
      fields.targeting.gender = parsedTargeting.gender;
    }
    if (Array.isArray(parsedTargeting.interests)) fields.targeting.interests = parsedTargeting.interests;
    if (Array.isArray(parsedTargeting.device_types)) fields.targeting.device_types = parsedTargeting.device_types;
  }

  if (typeof sub_category !== 'undefined') fields.sub_category = sub_category || '';
  if (Array.isArray(keywords)) fields.keywords = keywords;

  // Tracking / UTM
  let parsedTracking = tracking;
  if (typeof tracking === 'string') {
    try {
      parsedTracking = JSON.parse(tracking);
    } catch (e) {}
  }
  if (parsedTracking && typeof parsedTracking === 'object') {
    fields.tracking = {
      utm_source: parsedTracking.utm_source || '',
      utm_medium: parsedTracking.utm_medium || '',
      utm_campaign: parsedTracking.utm_campaign || '',
      utm_term: parsedTracking.utm_term || '',
      utm_content: parsedTracking.utm_content || '',
      conversion_pixel_id: parsedTracking.conversion_pixel_id || ''
    };
  }

  // Compliance
  let parsedCompliance = compliance;
  if (typeof compliance === 'string') {
    try {
      parsedCompliance = JSON.parse(compliance);
    } catch (e) {}
  }
  if (parsedCompliance && typeof parsedCompliance === 'object') {
    fields.compliance = {};
    if (typeof parsedCompliance.policy_agreed !== 'undefined') {
      fields.compliance.policy_agreed = !!parsedCompliance.policy_agreed;
    }
    // approval_status is set automatically by admin — only allow if explicitly provided
    if (['pending', 'approved', 'rejected'].includes(parsedCompliance.approval_status)) {
      fields.compliance.approval_status = parsedCompliance.approval_status;
    }
  }

  // A/B Testing
  let parsedAbTesting = ab_testing;
  if (typeof ab_testing === 'string') {
    try {
      parsedAbTesting = JSON.parse(ab_testing);
    } catch (e) {}
  }
  if (parsedAbTesting && typeof parsedAbTesting === 'object') {
    fields.ab_testing = {
      enabled: !!parsedAbTesting.enabled,
      variants: Array.isArray(parsedAbTesting.variants) ? parsedAbTesting.variants : []
    };
  }

  // Scheduling
  let parsedScheduling = scheduling;
  if (typeof scheduling === 'string') {
    try {
      parsedScheduling = JSON.parse(scheduling);
    } catch (e) {}
  }
  if (parsedScheduling && typeof parsedScheduling === 'object') {
    fields.scheduling = {
      delivery_time_slots: Array.isArray(parsedScheduling.delivery_time_slots)
        ? parsedScheduling.delivery_time_slots
        : []
    };
  }

  // Handle Gallery Uploads if provided via multipart/form-data
  if (req.files && req.files.length > 0) {
    const uploadedGallery = req.files.map(file => ({
      link: absolutizeUploadUrl(file.filename, req),
      filename: file.filename,
      filname: file.filename
    }));

    // Merge with existing gallery if any
    if (fields.gallery) {
      fields.gallery = [...fields.gallery, ...uploadedGallery];
    } else {
      fields.gallery = uploadedGallery;
    }
  }

  return fields;
};

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
      total_budget_coins,
      status,
      gallery,
      ad_type,
      budget: budgetObj
    } = req.body;

    // ad_type is compulsory
    if (!ad_type || !['promote', 'general'].includes(ad_type)) {
      return res.status(400).json({ message: 'ad_type is required and must be either "promote" or "general"' });
    }

    const budget = Number(total_budget_coins || 0);

    // If ad_type is "promote", total_budget_coins and budget object are compulsory
    if (ad_type === 'promote') {
      if (!budget || budget <= 0) {
        return res.status(400).json({ message: 'total_budget_coins is required and must be positive for "promote" ads' });
      }

      // Check budget object (daily_budget_coins, start_date, end_date)
      // Note: budgetObj might be a string if sent via multipart/form-data
      let parsedBudget = budgetObj;
      if (typeof budgetObj === 'string') {
        try { parsedBudget = JSON.parse(budgetObj); } catch (e) {}
      }

      if (!parsedBudget || !parsedBudget.daily_budget_coins || !parsedBudget.start_date || !parsedBudget.end_date) {
        return res.status(400).json({
          message: 'Budget details (daily_budget_coins, start_date, end_date) are required for "promote" ads'
        });
      }
    } else {
      // For general ads, total_budget_coins can be 0 or optional depending on your business rules.
      // But the user only specified constraints for "promote".
    }

    const hasNewMedia = media && Array.isArray(media) && media.length > 0;
    const hasLegacyMedia = video_fileName && video_url && duration_seconds;

    if ((!hasNewMedia && !hasLegacyMedia) || !category) {
      return res.status(400).json({ message: 'Missing required fields (media/video, category)' });
    }

    const requestedStatus = normalizeAdStatus(status);
    const initialStatus = requestedStatus === 'draft' ? 'draft' : 'pending';

    // ── Build engagement_controls merging old + new fields ─────────────────────
    const incomingEngagement = engagement_controls || {};
    const builtEngagementControls = {
      hide_likes_count: !!incomingEngagement.hide_likes_count,
      disable_comments: !!incomingEngagement.disable_comments,
      disable_share: !!incomingEngagement.disable_share,
      disable_save: !!incomingEngagement.disable_save,
      disable_report: !!incomingEngagement.disable_report,
      moderation_enabled: !!incomingEngagement.moderation_enabled
    };

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
      status: initialStatus,
      hashtags: hashtags || [],
      tagged_users: tagged_users || [],
      engagement_controls: builtEngagementControls,
      content_type: content_type || 'reel',
      gallery: gallery || [],
      // Merge all new fields from body (handles JSON parsing and files)
      ...buildNewFieldsFromBody(req)
    };

    // Keep compliance.approval_status in sync with ad status
    if (!adData.compliance) adData.compliance = {};
    adData.compliance.approval_status = initialStatus === 'pending' ? 'pending' : 'pending';

    if (hasNewMedia) {
      adData.media = media.map(m => ({
        ...m,
        fileUrl: absolutizeUploadUrl(m.fileUrl || m.fileName, req),
        thumbnails: m.thumbnails ? m.thumbnails.map(t => ({
          ...t,
          fileUrl: absolutizeUploadUrl(t.fileUrl || t.fileName, req)
        })) : []
      }));
    } else {
      const fullVideoUrl = absolutizeUploadUrl(video_url || video_fileName, req);
      const fullThumbnailUrl = absolutizeUploadUrl(thumbnail_url || thumbnail_fileName, req);

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
    let resultingWalletBalance = null;
    let vendorForAlerts = null;

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
        vendorForAlerts = vendor;

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
        resultingWalletBalance = wallet.balance;

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
        vendorForAlerts = vendor;

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
        resultingWalletBalance = wallet.balance;

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
      const vendorUser = await User.findById(userId).select('email full_name username').lean();

      if (createdAd.status === 'pending') {
        const adminUsers = await User.find({ role: 'admin' }).select('email').lean();
        adminUsers
          .filter((admin) => admin.email)
          .forEach((admin) => {
            fireAndForget(
              'New ad pending admin alert',
              sendNewAdPendingAlert({
                adminEmail: admin.email,
                vendor_name:
                  vendorForAlerts?.company_details?.company_name
                  || vendorForAlerts?.business_name
                  || vendorUser?.full_name
                  || vendorUser?.username
                  || 'Vendor',
                ad_caption: createdAd.caption,
                submitted_at: createdAd.createdAt,
              })
            );
          });
      }

      if (vendorUser?.email && resultingWalletBalance !== null && resultingWalletBalance <= LOW_COIN_THRESHOLD) {
        fireAndForget(
          'Coins low email',
          sendCoinsLowEmail({
            email: vendorUser.email,
            full_name: vendorUser.full_name || vendorUser.username,
            current_balance: resultingWalletBalance,
            threshold: LOW_COIN_THRESHOLD,
          })
        );
      }

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

exports.updateAdMetadata = async (req, res) => {
  try {
    const userId = req.userId;
    const adId = req.params.id;

    const ad = await Ad.findById(adId);

    if (!ad || ad.isDeleted) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    if (ad.user_id.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this ad' });
    }

    const {
      caption,
      location,
      hashtags,
      tagged_users,
      engagement_controls,
      content_type,
      category,
      tags,
      target_language,
      target_location,
      target_states,
      total_budget_coins,
      target_preferences,
      status
    } = req.body;

    // ── Legacy / existing fields ───────────────────────────────────────────────
    if (typeof caption !== 'undefined') ad.caption = caption || '';
    if (typeof location !== 'undefined') ad.location = location || '';
    if (typeof hashtags !== 'undefined') ad.hashtags = Array.isArray(hashtags) ? hashtags : [];
    if (typeof tagged_users !== 'undefined') ad.tagged_users = Array.isArray(tagged_users) ? tagged_users : [];

    // Merge engagement_controls (old + new fields)
    if (typeof engagement_controls !== 'undefined') {
      ad.engagement_controls = {
        hide_likes_count: !!engagement_controls?.hide_likes_count,
        disable_comments: !!engagement_controls?.disable_comments,
        disable_share: !!engagement_controls?.disable_share,
        disable_save: !!engagement_controls?.disable_save,
        disable_report: !!engagement_controls?.disable_report,
        moderation_enabled: !!engagement_controls?.moderation_enabled
      };
    }

    if (typeof content_type !== 'undefined' && ['post', 'reel'].includes(content_type)) {
      ad.content_type = content_type;
    }
    if (typeof category !== 'undefined') ad.category = category;
    if (typeof tags !== 'undefined') ad.tags = Array.isArray(tags) ? tags : [];
    if (typeof target_language !== 'undefined') {
      ad.target_language = Array.isArray(target_language) ? target_language : (target_language ? [target_language] : []);
    }
    if (typeof target_location !== 'undefined') {
      ad.target_location = Array.isArray(target_location) ? target_location : (target_location ? [target_location] : []);
    }
    if (typeof target_states !== 'undefined') {
      ad.target_states = Array.isArray(target_states) ? target_states : (target_states ? [target_states] : []);
    }
    if (typeof total_budget_coins !== 'undefined') {
      const budget = Number(total_budget_coins);
      if (!Number.isFinite(budget) || budget <= 0) {
        return res.status(400).json({ message: 'total_budget_coins must be a positive number' });
      }
      ad.total_budget_coins = budget;
    }
    if (typeof target_preferences !== 'undefined') {
      ad.target_preferences = Array.isArray(target_preferences) ? target_preferences : [];
    }
    if (typeof status !== 'undefined') {
      const nextStatus = normalizeAdStatus(status);
      if (!canVendorTransitionAdStatus(ad.status, nextStatus)) {
        return res.status(400).json({ message: `Invalid vendor status transition from ${ad.status} to ${status}` });
      }
      ad.status = nextStatus;
    }

    // ── New fields ─────────────────────────────────────────────────────────────
    const newFields = buildNewFieldsFromBody(req.body);

    if (typeof newFields.ad_title !== 'undefined') ad.ad_title = newFields.ad_title;
    if (typeof newFields.ad_description !== 'undefined') ad.ad_description = newFields.ad_description;
    if (typeof newFields.ad_type !== 'undefined') ad.ad_type = newFields.ad_type;
    if (typeof newFields.sub_category !== 'undefined') ad.sub_category = newFields.sub_category;
    if (typeof newFields.keywords !== 'undefined') ad.keywords = newFields.keywords;

    if (newFields.cta) ad.cta = { ...((ad.cta || {}).toObject ? ad.cta.toObject() : {}), ...newFields.cta };
    if (newFields.budget) ad.budget = { ...((ad.budget || {}).toObject ? ad.budget.toObject() : {}), ...newFields.budget };
    if (newFields.targeting) ad.targeting = { ...((ad.targeting || {}).toObject ? ad.targeting.toObject() : {}), ...newFields.targeting };
    if (newFields.tracking) ad.tracking = { ...((ad.tracking || {}).toObject ? ad.tracking.toObject() : {}), ...newFields.tracking };
    if (newFields.compliance) {
      // Vendor can only set policy_agreed — approval_status is admin-only
      const existingCompliance = (ad.compliance || {}).toObject ? ad.compliance.toObject() : (ad.compliance || {});
      ad.compliance = {
        ...existingCompliance,
        policy_agreed: newFields.compliance.policy_agreed ?? existingCompliance.policy_agreed
        // approval_status NOT updated here — admin does that via adminUpdateAdStatus
      };
    }
    if (newFields.ab_testing) ad.ab_testing = newFields.ab_testing;
    if (newFields.scheduling) ad.scheduling = newFields.scheduling;

    await ad.save();

    if (normalizeAdStatus(status) === 'pending') {
      const vendor = await Vendor.findById(ad.vendor_id).lean();
      const vendorUser = await User.findById(ad.user_id).select('full_name username').lean();
      const adminUsers = await User.find({ role: 'admin' }).select('email').lean();

      adminUsers
        .filter((admin) => admin.email)
        .forEach((admin) => {
          fireAndForget(
            'Draft ad submitted admin alert',
            sendNewAdPendingAlert({
              adminEmail: admin.email,
              vendor_name:
                vendor?.company_details?.company_name
                || vendor?.business_name
                || vendorUser?.full_name
                || vendorUser?.username
                || 'Vendor',
              ad_caption: ad.caption,
              submitted_at: ad.updatedAt || new Date(),
            })
          );
        });
    }

    const updatedAd = await Ad.findById(ad._id)
      .populate('vendor_id', 'business_name logo_url validated')
      .populate('user_id', 'username full_name avatar_url gender location');

    return res.json(updatedAd);
  } catch (error) {
    console.error('Update ad metadata error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Ad not found' });
    }
    return res.status(500).json({ message: 'Server error' });
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
        ...normalizeAdAssets(ad, req),
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

    res.json(normalizeAdAssets(ad, req));
  } catch (error) {
    console.error('Get ad error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.recordClick = async (req, res) => {
  try {
    const adId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    const ad = await Ad.findOne({ _id: adId, isDeleted: false }).select('_id vendor_id status');
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    const click = await recordAdClick({
      ad,
      userId: req.userId,
      user: req.user,
      coinsSpent: 0,
    });

    return res.json({
      success: true,
      message: 'Ad click recorded',
      click: click || {
        ad_id: ad._id,
        user_id: req.userId,
      },
    });
  } catch (error) {
    console.error('Record ad click error:', error);
    return res.status(500).json({ message: 'Server error' });
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
    const adId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    const actingUserId = String(req.userId);

    // ── Duplicate-view guard ─────────────────────────────────
    // If this user already has a rewarded view for this ad,
    // return immediately — no need to run the full transaction.
    const existingRewardedView = await AdView.findOne({
      ad_id: adId,
      user_id: actingUserId,
      rewarded: true
    }).lean();

    if (existingRewardedView) {
      return res.json({
        message: 'View recorded',
        view_count: existingRewardedView.view_count || 1,
        rewarded: true,
        reward: existingRewardedView.coins_rewarded || 0
      });
    }
    // ─────────────────────────────────────────────────────────

    const now = new Date();
    let viewCount = 0;
    let rewardPaid = 0;
    let rewarded = false;

    await runMongoTransaction({
        work: async (session) => {
          const ad = await Ad.findById(adId).session(session);
          if (!ad || ad.isDeleted) {
            const err = new Error('Ad not found');
            err.statusCode = 404;
            throw err;
          }
          if (ad.status !== 'active') {
            const err = new Error(`Ad is not active (current status: ${ad.status})`);
            err.statusCode = 400;
            throw err;
          }

          let adView = await AdView.findOne({ ad_id: adId, user_id: actingUserId }).session(session);
          const isUnique = !adView;

          if (!adView) {
            adView = new AdView({
              ad_id: adId,
              user_id: actingUserId,
              view_count: 1
            });
          } else {
            adView.view_count = Number(adView.view_count || 0) + 1;
          }

          const adUpdate = {
            $inc: {
              views_count: 1,
              ...(isUnique ? { unique_views_count: 1 } : {})
            }
          };

          if (!adView.completed) {
            adView.completed = true;
            adView.completed_at = now;
            adUpdate.$inc.completed_views_count = 1;
          }

          const configuredReward = Number(ad.coins_reward);
          const rewardAmount = Number.isFinite(configuredReward) && configuredReward > 0 ? configuredReward : REWARD_COINS;
          const canReward = rewardAmount > 0 && String(ad.user_id) !== String(actingUserId);

          if (canReward && !adView.rewarded) {
            // Atomically claim the budget slot — only succeeds if enough budget remains
            const budgetClaimed = await Ad.findOneAndUpdate(
              { _id: adId, total_coins_spent: { $lte: ad.total_budget_coins - rewardAmount } },
              { $inc: { total_coins_spent: rewardAmount } },
              { new: true, session }
            );

            if (budgetClaimed) {
              // Dedup: only pay once per user per ad (upsert inserts only on first view)
              const upsertReward = await WalletTransaction.updateOne(
                { user_id: actingUserId, ad_id: ad._id, type: 'AD_VIEW_REWARD' },
                {
                  $setOnInsert: {
                    vendor_id: ad.vendor_id,
                    amount: rewardAmount,
                    status: 'SUCCESS',
                    description: 'Reward for completing ad view'
                  }
                },
                { upsert: true, session }
              );

              if (upsertReward.upsertedCount > 0) {
                // Per-viewer deduction record — use upsert to match the unique index
                // on (user_id, ad_id, type) so retries never cause E11000
                await WalletTransaction.updateOne(
                  { user_id: ad.user_id, ad_id: ad._id, type: 'AD_VIEW_DEDUCTION' },
                  {
                    $setOnInsert: {
                      vendor_id: ad.vendor_id,
                      amount: -rewardAmount,
                      status: 'SUCCESS',
                      description: `Ad budget spent (view by ${actingUserId})`
                    }
                  },
                  { upsert: true, session }
                );

                // Credit member wallet
                await Wallet.findOneAndUpdate(
                  { user_id: actingUserId },
                  { $inc: { balance: rewardAmount } },
                  { upsert: true, session }
                );

                // Debit vendor wallet
                await Wallet.findOneAndUpdate(
                  { user_id: ad.user_id },
                  { $inc: { balance: -rewardAmount } },
                  { upsert: true, session }
                );

                adView.rewarded = true;
                adView.rewarded_at = now;
                adView.coins_rewarded = rewardAmount;
                rewardPaid = rewardAmount;
                rewarded = true;
              } else {
                // Transaction for this user already exists (concurrent request race):
                // roll back the budget we just claimed
                await Ad.updateOne(
                  { _id: adId },
                  { $inc: { total_coins_spent: -rewardAmount } },
                  { session }
                );
              }
            }
          }

          await adView.save({ session });
          await Ad.updateOne({ _id: adId }, adUpdate, { session });

          viewCount = adView.view_count;
        },
        fallback: async () => {
          const ad = await Ad.findById(adId);
          if (!ad || ad.isDeleted) {
            const err = new Error('Ad not found');
            err.statusCode = 404;
            throw err;
          }
          if (ad.status !== 'active') {
            const err = new Error(`Ad is not active (current status: ${ad.status})`);
            err.statusCode = 400;
            throw err;
          }

          let adView = await AdView.findOne({ ad_id: adId, user_id: actingUserId });
          const isUnique = !adView;

          if (!adView) {
            adView = new AdView({
              ad_id: adId,
              user_id: actingUserId,
              view_count: 1
            });
          } else {
            adView.view_count = Number(adView.view_count || 0) + 1;
          }

          const adUpdate = {
            $inc: {
              views_count: 1,
              ...(isUnique ? { unique_views_count: 1 } : {})
            }
          };

          if (!adView.completed) {
            adView.completed = true;
            adView.completed_at = now;
            adUpdate.$inc.completed_views_count = 1;
          }

          const configuredReward = Number(ad.coins_reward);
          const rewardAmount = Number.isFinite(configuredReward) && configuredReward > 0 ? configuredReward : REWARD_COINS;
          const canReward = rewardAmount > 0 && String(ad.user_id) !== String(actingUserId);

          if (canReward && !adView.rewarded) {
            // Atomically claim the budget slot — only succeeds if enough budget remains
            const budgetClaimed = await Ad.findOneAndUpdate(
              { _id: adId, total_coins_spent: { $lte: ad.total_budget_coins - rewardAmount } },
              { $inc: { total_coins_spent: rewardAmount } },
              { new: true }
            );

            if (budgetClaimed) {
              // Dedup: only pay once per user per ad
              const upsertReward = await WalletTransaction.updateOne(
                { user_id: actingUserId, ad_id: ad._id, type: 'AD_VIEW_REWARD' },
                { $setOnInsert: { vendor_id: ad.vendor_id, amount: rewardAmount, status: 'SUCCESS', description: 'Reward for completing ad view' } },
                { upsert: true }
              );

              if (upsertReward.upsertedCount > 0) {
                // Per-viewer deduction record — upsert to avoid E11000 on retry
                await WalletTransaction.updateOne(
                  { user_id: ad.user_id, ad_id: ad._id, type: 'AD_VIEW_DEDUCTION' },
                  {
                    $setOnInsert: {
                      vendor_id: ad.vendor_id,
                      amount: -rewardAmount,
                      status: 'SUCCESS',
                      description: `Ad budget spent (view by ${actingUserId})`
                    }
                  },
                  { upsert: true }
                );

                // Credit member wallet
                await Wallet.findOneAndUpdate(
                  { user_id: actingUserId },
                  { $inc: { balance: rewardAmount } },
                  { upsert: true }
                );

                // Debit vendor wallet
                await Wallet.findOneAndUpdate(
                  { user_id: ad.user_id },
                  { $inc: { balance: -rewardAmount } },
                  { upsert: true }
                );

                adView.rewarded = true;
                adView.rewarded_at = now;
                adView.coins_rewarded = rewardAmount;
                rewardPaid = rewardAmount;
                rewarded = true;
              } else {
                // Transaction already exists for this user — roll back the budget claim
                await Ad.updateOne(
                  { _id: adId },
                  { $inc: { total_coins_spent: -rewardAmount } }
                );
              }
            }
          }

          await adView.save();
          await Ad.updateOne({ _id: adId }, adUpdate);

          viewCount = adView.view_count;
        }
      });

    res.json({
      message: 'View recorded',
      view_count: viewCount,
      rewarded,
      reward: rewardPaid
    });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status !== 500) {
      return res.status(status).json({ message: error.message });
    }
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
        if (!ad || ad.isDeleted) {
          const err = new Error('Ad not found');
          err.statusCode = 404;
          throw err;
        }
        if (ad.status !== 'active') {
          const err = new Error(`Ad is not active (current status: ${ad.status})`);
          err.statusCode = 400;
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

          await WalletTransaction.updateOne(
            { user_id: userId, ad_id: ad._id, type: 'AD_VIEW_REWARD' },
            {
              $setOnInsert: {
                vendor_id: ad.vendor_id,
                amount: rewardAmount,
                status: 'SUCCESS',
                description: 'Reward for completing ad view'
              }
            },
            { upsert: true, session }
          );

          await WalletTransaction.updateOne(
            { user_id: ad.user_id, ad_id: ad._id, type: 'AD_VIEW_DEDUCTION' },
            {
              $setOnInsert: {
                vendor_id: ad.vendor_id,
                amount: -rewardAmount,
                status: 'SUCCESS',
                description: 'Ad budget spent (view)'
              }
            },
            { upsert: true, session }
          );

          rewardPaid = rewardAmount;
        }

        await ad.save({ session });
      },
      fallback: async () => {
        const ad = await Ad.findById(adId);
        if (!ad || ad.isDeleted) {
          const err = new Error('Ad not found');
          err.statusCode = 404;
          throw err;
        }
        if (ad.status !== 'active') {
          const err = new Error(`Ad is not active (current status: ${ad.status})`);
          err.statusCode = 400;
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

          await WalletTransaction.updateOne(
            { user_id: userId, ad_id: ad._id, type: 'AD_VIEW_REWARD' },
            {
              $setOnInsert: {
                vendor_id: ad.vendor_id,
                amount: rewardAmount,
                status: 'SUCCESS',
                description: 'Reward for completing ad view'
              }
            },
            { upsert: true }
          );

          await WalletTransaction.updateOne(
            { user_id: ad.user_id, ad_id: ad._id, type: 'AD_VIEW_DEDUCTION' },
            {
              $setOnInsert: {
                vendor_id: ad.vendor_id,
                amount: -rewardAmount,
                status: 'SUCCESS',
                description: 'Ad budget spent (view)'
              }
            },
            { upsert: true }
          );

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

    const actingUserId = String(req.userId);

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
          // Always create new transaction records — like/dislike can happen multiple times
          // so we never use upsert/$setOnInsert here (that would silently skip repeated actions)
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

          // Credit member wallet
          await Wallet.findOneAndUpdate(
            { user_id: actingUserId },
            { $inc: { balance: rewardAmount } },
            { upsert: true, new: true, session }
          );

          // Debit vendor wallet
          await Wallet.findOneAndUpdate(
            { user_id: ad.user_id },
            { $inc: { balance: -rewardAmount } },
            { upsert: true, new: true, session }
          );

          ad.total_coins_spent = Number(ad.total_coins_spent || 0) + rewardAmount;
          coinsEarned = rewardAmount;

          await MemberAdAction.create([{
            user_id: actingUserId,
            vendor_id: ad.vendor_id,
            ad_id: ad._id,
            event_type: 'like',
            credit_delta: rewardAmount
          }], { session });
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
          // Always create new transaction records — like/dislike can happen multiple times
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

          // Credit member wallet
          await Wallet.findOneAndUpdate(
            { user_id: actingUserId },
            { $inc: { balance: rewardAmount } },
            { upsert: true, new: true }
          );

          // Debit vendor wallet
          await Wallet.findOneAndUpdate(
            { user_id: ad.user_id },
            { $inc: { balance: -rewardAmount } },
            { upsert: true, new: true }
          );

          ad.total_coins_spent = Number(ad.total_coins_spent || 0) + rewardAmount;
          coinsEarned = rewardAmount;

          await MemberAdAction.create({
            user_id: actingUserId,
            vendor_id: ad.vendor_id,
            ad_id: ad._id,
            event_type: 'like',
            credit_delta: rewardAmount
          });
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

    const actingUserId = String(req.userId);

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

        // Remove from likes — the alreadyLiked guard above is the real dedup check.
        // Always create new transaction records every time a dislike (reversal) occurs,
        // so every like→dislike cycle is fully reflected in wallet history.
        ad.likes = ad.likes.filter(like => like.toString() !== actingUserId);
        ad.likes_count = Math.max(0, Number(ad.likes_count || 0) - 1);

        if (ad.user_id.toString() !== actingUserId) {
          // Debit member wallet (reversal of like reward)
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

          // Credit vendor wallet (refund)
          await Wallet.findOneAndUpdate(
            { user_id: ad.user_id },
            { $inc: { balance: rewardAmount } },
            { upsert: true, new: true, session }
          );

          // Always create fresh transaction records for this reversal cycle
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

          ad.total_coins_spent = Math.max(0, Number(ad.total_coins_spent || 0) - rewardAmount);

          await MemberAdAction.create([{
            user_id: actingUserId,
            vendor_id: ad.vendor_id,
            ad_id: ad._id,
            event_type: 'undo-like',
            credit_delta: -rewardAmount
          }], { session });
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
        if (!alreadyLiked) {
          const err = new Error('You can only dislike ads you previously liked');
          err.statusCode = 400;
          throw err;
        }

        ad.likes = ad.likes.filter(like => like.toString() !== actingUserId);
        ad.likes_count = Math.max(0, Number(ad.likes_count || 0) - 1);

        if (ad.user_id.toString() !== actingUserId) {
          // Debit member wallet (reversal of like reward)
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

          // Credit vendor wallet (refund)
          await Wallet.findOneAndUpdate(
            { user_id: ad.user_id },
            { $inc: { balance: rewardAmount } },
            { upsert: true, new: true }
          );

          // Always create fresh transaction records for this reversal cycle
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

          ad.total_coins_spent = Math.max(0, Number(ad.total_coins_spent || 0) - rewardAmount);

          await MemberAdAction.create({
            user_id: actingUserId,
            vendor_id: ad.vendor_id,
            ad_id: ad._id,
            event_type: 'undo-like',
            credit_delta: -rewardAmount
          });
        }

        await ad.save();
        finalLikesCount = ad.likes_count;
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
      recordAdEngagement({ ad, userId, user: req.user, action: 'save' });
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
    recordAdEngagement({ ad, userId, user: req.user, action: 'unsave' });
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

    // Keep compliance.approval_status in sync with admin decision
    if (status === 'active') {
      if (!ad.compliance) ad.compliance = {};
      ad.compliance.approval_status = 'approved';
    } else if (status === 'rejected') {
      if (!ad.compliance) ad.compliance = {};
      ad.compliance.approval_status = 'rejected';
    }

    await ad.save();

    const adOwner = await User.findById(ad.user_id).select('email full_name username').lean();

    if (status === 'active') {
      await sendNotification(req.app, {
        recipient: ad.user_id,
        sender: null,
        type: 'ad_approved',
        message: 'Your ad has been approved and is now live!',
        link: `/ads/${ad._id}`
      });

      if (adOwner?.email) {
        fireAndForget(
          'Ad approved email',
          sendAdApprovedEmail({
            email: adOwner.email,
            full_name: adOwner.full_name || adOwner.username,
            ad_caption: ad.caption,
            ad_id: ad._id,
          })
        );
      }
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

      if (adOwner?.email) {
        fireAndForget(
          'Ad rejected email',
          sendAdRejectedEmail({
            email: adOwner.email,
            full_name: adOwner.full_name || adOwner.username,
            ad_caption: ad.caption,
            ad_id: ad._id,
            reason: ad.rejection_reason,
          })
        );
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
            { ad_title: keywordRegex },
            { ad_description: keywordRegex },
            { location: keywordRegex },
            { hashtags: keywordRegex },
            { tags: keywordRegex },
            { keywords: keywordRegex }
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
