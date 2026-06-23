const Ad = require('../models/Ad');
const User = require('../models/User');
const AdView = require('../models/AdView');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const SavedAd = require('../models/SavedAd');
const Vendor = require('../models/Vendor');
const mongoose = require('mongoose');
const runMongoTransaction = require('../utils/runMongoTransaction');
const sendNotification = require('../utils/sendNotification');
const { getBlockedPrivateUserIds, canViewAuthorContent, getFollowedUserIds } = require('../utils/privacyVisibility');
const { convertToHlsAndUpload } = require('../utils/convertToHlsAndUpload');

// ─── URL resolver — always returns CloudFront URL ─────────────────────────────
function resolveAdMediaUrl(fileName, fileUrl) {
  let cf = process.env.CLOUDFRONT_BASE_URL || '';
  if (cf && !cf.startsWith('http')) cf = `https://${cf}`;
  cf = cf.replace(/\/+$/, '');

  // fileUrl is already a full URL — fix http→https and swap to CloudFront
  if (fileUrl && fileUrl.startsWith('http')) {
    let url = fileUrl.replace(/^http:\/\/api\.bebsmart\.in/i, 'https://api.bebsmart.in');
    if (cf) {
      url = url
        .replace(/https?:\/\/api\.bebsmart\.in\/uploads\//i, `${cf}/uploads/`)
        .replace(/https?:\/\/[^/]+\.s3\.[^/]+\.amazonaws\.com\//i, `${cf}/`);
    }
    return url;
  }

  // fileName is an S3 key e.g. "uploads/users/123/ads/abc.mp4"
  if (fileName) {
    const key = fileName.replace(/^\/+/, '');
    if (cf) return `${cf}/${key}`;
    const bucket = process.env.S3_BUCKET_NAME || '';
    const region = process.env.AWS_REGION || 'ap-south-1';
    if (bucket) return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    return `/${key}`;
  }

  return fileUrl || '';
}

// Resolve all media items in an ad — called before saving AND when returning to client
function resolveAdMedia(mediaArray) {
  if (!Array.isArray(mediaArray)) return mediaArray;
  return mediaArray.map(item => ({
    ...item,
    fileUrl: resolveAdMediaUrl(item.fileName, item.fileUrl || item.url || ''),
    thumbnails: Array.isArray(item.thumbnails)
      ? item.thumbnails.map(t => ({
          ...t,
          fileUrl: resolveAdMediaUrl(t.fileName, t.fileUrl || ''),
        }))
      : [],
  }));
}

// ─── Background HLS for Ads ───────────────────────────────────────────────────
async function runAdHlsInBackground(app, adId, mediaIndex, rawS3Key) {
  try {
    console.log(`[HLS-Ad] Background job started for ad ${adId}, key: ${rawS3Key}`);
    const hlsFolder = rawS3Key.replace(/\.[^/.]+$/, '');
    const { m3u8Key, m3u8Url } = await convertToHlsAndUpload(rawS3Key, hlsFolder);

    const updatePath = `media.${mediaIndex}`;
    await Ad.findOneAndUpdate(
      { _id: adId },
      {
        $set: {
          [`${updatePath}.fileUrl`]:    m3u8Url,
          [`${updatePath}.fileName`]:   m3u8Key,
          [`${updatePath}.hls`]:        true,
          [`${updatePath}.processing`]: false,
        },
      }
    );
    console.log(`[HLS-Ad] Ad ${adId} media[${mediaIndex}] updated → ${m3u8Url}`);

    const io          = app.get('io');
    const onlineUsers = app.get('onlineUsers');
    if (io && onlineUsers) {
      // Notify all sockets for this vendor/user — they can refresh the ad feed
      const ad = await Ad.findById(adId).select('user_id').lean();
      if (ad) {
        const socketIds = onlineUsers.get(String(ad.user_id));
        if (socketIds) {
          for (const sid of socketIds) {
            io.to(sid).emit('ad_ready', { adId: String(adId), mediaIndex, m3u8Url, hls: true, processing: false });
          }
        }
      }
    }
  } catch (err) {
    console.error(`[HLS-Ad] Background conversion failed for ad ${adId}:`, err.message);
    try {
      await Ad.findOneAndUpdate(
        { _id: adId },
        { $set: { [`media.${mediaIndex}.processing`]: false } }
      );
    } catch {}
  }
}

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
    const normalizedStatus = String(status || '').trim().toLowerCase();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    const ad = await Ad.findById(id).lean();
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    if (normalizedStatus && !['active', 'paused', 'rejected'].includes(normalizedStatus)) {
      return res.status(400).json({ success: false, message: 'status must be active, paused, or rejected' });
    }

    const updates = {};
    if (normalizedStatus) {
      updates.status = normalizedStatus;
      if (normalizedStatus === 'rejected') {
        updates.rejection_reason = rejection_reason || 'No reason provided';
        updates['compliance.approval_status'] = 'rejected';
      } else if (normalizedStatus === 'active') {
        updates.rejection_reason = '';
        updates['compliance.approval_status'] = 'approved';
      } else if (normalizedStatus === 'paused') {
        // Keep approval status intact when paused; only pause delivery.
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    const updatedAd = await Ad.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.json({ success: true, message: `Ad status updated to ${updatedAd.status}`, data: updatedAd, ad: updatedAd });
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

    await Ad.findByIdAndDelete(id);

    res.json({ success: true, message: 'Ad deleted' });
  } catch (error) {
    console.error('[Admin] adminDeleteAd error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── Ad Feed ────────────────────────────────────────────────────────────────

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

    const [ads, savedAdRecords] = await Promise.all([
      Ad.find(adQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('vendor_id', 'business_name logo_url validated')
        .populate('user_id', 'username full_name avatar_url gender location isPrivate')
        .lean(),
      SavedAd.find({ user_id: req.userId }).select('ad_id').lean(),
    ]);

    const savedAdSet = new Set(savedAdRecords.map((s) => String(s.ad_id)));

    const data = ads.map((ad) => {
      const authorId = String(ad?.user_id?._id || ad?.user_id?.id || '');
      const isAuthorFollowed = authorId ? followedSet.has(authorId) : false;
      const isLikedByMe = hasUserInList(ad?.likes, req.userId);
      return {
        ...ad,
        media: resolveAdMedia(ad.media),
        likes_count: Number(ad?.likes_count || (Array.isArray(ad?.likes) ? ad.likes.length : 0)),
        is_liked_by_me: isLikedByMe,
        is_saved_by_me: savedAdSet.has(String(ad._id)),
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

    const isSavedByMe = !!(await SavedAd.exists({ user_id: req.userId, ad_id: id }));

    res.json({
      ...ad,
      media: resolveAdMedia(ad.media),
      likes_count: Number(ad?.likes_count || (Array.isArray(ad?.likes) ? ad.likes.length : 0)),
      is_liked_by_me: hasUserInList(ad?.likes, req.userId),
      is_saved_by_me: isSavedByMe,
    });
  } catch (error) {
    console.error('[Ad] getAdById error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── Wallet Transaction Helper ───────────────────────────────────────────────

const createWalletTransaction = async (payload, session) => {
  try {
    if (session) {
      await WalletTransaction.create([payload], { session });
      return;
    }
    await WalletTransaction.create(payload);
  } catch (error) {
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

// ─── Like / Dislike Internal Helpers ────────────────────────────────────────

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
  await ad.save({ session: session || undefined, validateBeforeSave: false });

  return { ad, reward, memberWalletBalance, isOwnAd };
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

  await ad.save({ session: session || undefined, validateBeforeSave: false });

  return { ad, reversalAmount, memberWalletBalance };
};

// ─── Record Views / Clicks ───────────────────────────────────────────────────

exports.recordAdView = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    const ad = await Ad.findOne({ _id: id, isDeleted: false });
    if (!ad) return res.status(404).json({ message: 'Ad not found' });

    // Get/create AdView — returns the doc BEFORE the increment (null = brand new)
    const prevView = await AdView.findOneAndUpdate(
      { ad_id: id, user_id: userId },
      { $inc: { view_count: 1 } },
      { upsert: true, new: false, setDefaultsOnInsert: true }
    );

    const isFirstView = !prevView;
    const alreadyRewarded = prevView?.rewarded || false;
    const isOwnAd = String(ad.user_id) === String(userId);

    let rewarded = false;
    const rewardAmount = Number(ad.coins_reward) || 10;

    if (!alreadyRewarded && !isOwnAd) {
      // Deduct from vendor wallet only if they have enough balance
      const vendorWallet = await Wallet.findOneAndUpdate(
        { user_id: ad.user_id, balance: { $gte: rewardAmount } },
        { $inc: { balance: -rewardAmount } },
        { new: true }
      );

      if (vendorWallet) {
        // Credit member wallet
        await Wallet.findOneAndUpdate(
          { user_id: userId },
          { $inc: { balance: rewardAmount }, $setOnInsert: { currency: 'Coins' } },
          { upsert: true, new: true }
        );

        await createWalletTransaction({
          user_id: ad.user_id,
          vendor_id: ad.vendor_id,
          ad_id: ad._id,
          type: 'AD_VIEW_DEDUCTION',
          amount: rewardAmount,
          status: 'SUCCESS',
          description: `Deducted ${rewardAmount} coins from ad budget for view reward`,
        });

        await createWalletTransaction({
          user_id: userId,
          vendor_id: ad.vendor_id,
          ad_id: ad._id,
          type: 'AD_VIEW_REWARD',
          amount: rewardAmount,
          status: 'SUCCESS',
          description: `Earned ${rewardAmount} coins for viewing ad`,
        });

        // Mark AdView as rewarded
        await AdView.findOneAndUpdate(
          { ad_id: id, user_id: userId },
          { $set: { rewarded: true, coins_rewarded: rewardAmount, rewarded_at: new Date() } }
        );

        rewarded = true;
      }
    }

    // Update Ad counters — always bump views_count, unique on first view
    const adInc = { views_count: 1 };
    if (rewarded) adInc.total_coins_spent = rewardAmount;
    if (isFirstView) adInc.unique_views_count = 1;
    const updatedAd = await Ad.findByIdAndUpdate(id, { $inc: adInc }, { new: true });

    return res.json({
      message: rewarded ? 'View recorded and reward credited' : 'View recorded',
      view_count: updatedAd.views_count,
      rewarded,
      reward: rewarded ? rewardAmount : 0,
    });
  } catch (error) {
    console.error('[Ad] recordAdView error:', error);
    return res.status(500).json({ message: 'Server error' });
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

// ─── List / Search Ads ───────────────────────────────────────────────────────

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

// ─── CREATE AD ───────────────────────────────────────────────────────────────

/**
 * POST /api/ads
 * Creates a new ad. Requires the user to have a vendor profile.
 * Deducts total_budget_coins from vendor wallet.
 */
exports.createAd = async (req, res) => {
  try {
    const userId = req.userId;

    // Helper to parse fields that may come as JSON strings (multipart/form-data)
    const parseField = (val) => {
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return val; }
      }
      return val;
    };

    const body = req.body;

    const ad_title         = body.ad_title;
    const ad_description   = body.ad_description;
    const caption          = body.caption;
    const location         = body.location;
    const ad_type          = body.ad_type;
    const content_type     = body.content_type;
    const total_budget_coins = body.total_budget_coins;
    const category         = body.category;
    const sub_category     = body.sub_category;

    // These may come as JSON strings in multipart or parsed objects in JSON requests
    const media            = parseField(body.media);
    const gallery          = parseField(body.gallery);
    const cta              = parseField(body.cta);
    const budget           = parseField(body.budget);
    const tags             = parseField(body.tags);
    const keywords         = parseField(body.keywords);
    const hashtags         = parseField(body.hashtags);
    const tagged_users     = parseField(body.tagged_users);
    const target_language  = parseField(body.target_language);
    const target_location  = parseField(body.target_location);
    const target_states    = parseField(body.target_states);
    const targeting        = parseField(body.targeting);
    const engagement_controls = parseField(body.engagement_controls);
    const tracking         = parseField(body.tracking);
    const compliance       = parseField(body.compliance);

    // ── Validations ──────────────────────────────────────────────────────────

    if (!ad_type || !['promote', 'general'].includes(ad_type)) {
      return res.status(400).json({ message: 'ad_type is required and must be promote or general' });
    }

    if (!category || !String(category).trim()) {
      return res.status(400).json({ message: 'category is required' });
    }

    if (!Array.isArray(media) || media.length === 0) {
      return res.status(400).json({ message: 'At least one media item is required' });
    }

    // Each media item must have fileName
    for (const item of media) {
      if (!item.fileName) {
        return res.status(400).json({ message: 'Each media item must have a fileName' });
      }
    }

    if (!compliance?.policy_agreed) {
      return res.status(400).json({ message: 'You must agree to the policy to create an ad' });
    }

    const budgetCoins = Number(total_budget_coins) || 0;
    if (budgetCoins < 0) {
      return res.status(400).json({ message: 'total_budget_coins cannot be negative' });
    }

    // ── Find vendor profile ──────────────────────────────────────────────────

    const vendor = await Vendor.findOne({ user_id: userId });
    if (!vendor) {
      return res.status(403).json({
        message: 'You must have a vendor profile to create an ad. Please complete your vendor registration.',
      });
    }

    // ── Wallet check & deduction ─────────────────────────────────────────────

    if (budgetCoins > 0) {
      const wallet = await Wallet.findOne({ user_id: userId });
      if (!wallet || wallet.balance < budgetCoins) {
        return res.status(400).json({
          message: `Insufficient wallet balance. Required: ${budgetCoins} coins, Available: ${wallet?.balance || 0} coins`,
        });
      }

      // Deduct coins from wallet
      await Wallet.findOneAndUpdate(
        { user_id: userId },
        { $inc: { balance: -budgetCoins } }
      );

      // Record transaction
      await createWalletTransaction({
        user_id: userId,
        vendor_id: vendor._id,
        type: 'AD_BUDGET_DEDUCTION',
        amount: budgetCoins,
        status: 'SUCCESS',
        description: `Budget allocated for ad: ${ad_title || 'Untitled Ad'}`,
      });
    }

    // ── Build media array ────────────────────────────────────────────────────
    // BUGFIX: never trust item.hls or item.processing from the frontend.
    // Instead, detect HLS by checking whether the fileName ends with .m3u8.
    // If the upload route already converted the video (synchronous HLS via
    // handleVideoUpload), the fileName will be the m3u8 key — mark it as
    // hls:true, processing:false so we do NOT re-trigger background conversion.
    // If the fileName is still a raw video file (.mp4 etc.), mark it as
    // processing:true so background HLS runs after we respond.
    const normalizedMedia = media.map((item) => {
      const fileName    = item.fileName || '';
      const isAlreadyHls = fileName.endsWith('.m3u8') ||
                           (item.fileUrl || '').endsWith('.m3u8') ||
                           (item.fileUrl || '').includes('/index.m3u8');
      const isVideo     = (item.media_type || 'image') === 'video';

      // If the upload already produced HLS, honour it — no background job needed.
      // If it is a raw video that still needs conversion, set processing:true.
      const hlsFlag        = isAlreadyHls ? true  : false;
      const processingFlag = isVideo && !isAlreadyHls ? true : false;

      return {
        fileName,
        // Always resolve to CloudFront URL before saving to MongoDB
        fileUrl:    resolveAdMediaUrl(fileName, item.fileUrl || item.url || ''),
        media_type: item.media_type || 'image',
        video_meta: item.video_meta || {},
        timing_window:  item.timing_window  || {},
        crop_settings:  item.crop_settings  || {},
        hls:        hlsFlag,
        processing: processingFlag,
        thumbnails: Array.isArray(item.thumbnails)
          ? item.thumbnails.map((t) => ({
              fileName:   t.fileName   || '',
              fileUrl:    resolveAdMediaUrl(t.fileName, t.fileUrl || ''),
              media_type: t.type || t.media_type || 'image',
            }))
          : [],
      };
    });

    // ── Create Ad ────────────────────────────────────────────────────────────

    const ad = await Ad.create({
      vendor_id: vendor._id,
      user_id: userId,
      ad_title: ad_title || '',
      ad_description: ad_description || '',
      caption: caption || '',
      location: location || '',
      ad_type,
      content_type: content_type || 'reel',
      status: 'pending',
      media: normalizedMedia,
      gallery: Array.isArray(gallery) ? gallery : [],
      cta: cta || {},
      total_budget_coins: budgetCoins,
      budget: budget || {},
      category: String(category).trim(),
      sub_category: sub_category || '',
      tags: Array.isArray(tags) ? tags : [],
      keywords: Array.isArray(keywords) ? keywords : [],
      hashtags: Array.isArray(hashtags) ? hashtags : [],
      tagged_users: Array.isArray(tagged_users) ? tagged_users : [],
      target_language: Array.isArray(target_language) ? target_language : [],
      target_location: Array.isArray(target_location) ? target_location : [],
      target_states: Array.isArray(target_states) ? target_states : [],
      targeting: targeting || {},
      engagement_controls: engagement_controls || {},
      tracking: tracking || {},
      compliance: {
        policy_agreed: compliance?.policy_agreed || false,
        approval_status: 'pending',
      },
    });

    const populatedAd = await Ad.findById(ad._id)
      .populate('vendor_id', 'business_name logo_url validated')
      .populate('user_id', 'username full_name avatar_url')
      .lean();

    res.status(201).json({
      success: true,
      message: 'Ad created successfully and is pending review',
      data: populatedAd,
      ad: populatedAd,
    });

    // After responding — fire background HLS only for videos that are NOT yet HLS.
    // With the fix above, processing:true is only set when fileName is a raw video.
    normalizedMedia.forEach((item, idx) => {
      if (item.media_type === 'video' && item.processing === true && item.fileName && !item.fileName.endsWith('.m3u8')) {
        setImmediate(() => runAdHlsInBackground(req.app, ad._id, idx, item.fileName));
      }
    });

    // After responding — notify tagged users
    if (Array.isArray(tagged_users) && tagged_users.length > 0) {
      setImmediate(async () => {
        try {
          const creator = await User.findById(userId).select('username').lean();
          for (const tag of tagged_users) {
            const taggedUserId = tag?.user_id || tag;
            if (taggedUserId && String(taggedUserId) !== String(userId)) {
              sendNotification(req.app, {
                recipient:  taggedUserId,
                sender:     userId,
                type:       'ad_tag',
                message:    `${creator.username} tagged you in an ad`,
                link:       `/ads/${ad._id}`,
                senderName: creator.username,
              }).catch(() => {});
            }
          }
        } catch (e) {
          console.error('[Ad] tag notification error:', e.message);
        }
      });
    }

  } catch (error) {
    console.error('[Ad] createAd error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── GET USER ADS ────────────────────────────────────────────────────────────

exports.getUserAdsWithComments = async (req, res) => {
  try {
    const { userId } = req.params;
    const { category } = req.query || {};

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const filter = {
      user_id: userId,
      isDeleted: false,
    };

    if (category && String(category).trim() && String(category).toLowerCase() !== 'all') {
      filter.category = String(category).trim();
    }

    const [ads, savedAdRecords] = await Promise.all([
      Ad.find(filter)
        .sort({ createdAt: -1 })
        .populate('vendor_id', 'business_name logo_url validated')
        .populate('user_id', 'username full_name avatar_url gender location isPrivate')
        .lean(),
      req.userId ? SavedAd.find({ user_id: req.userId }).select('ad_id').lean() : [],
    ]);

    const savedAdSet = new Set(savedAdRecords.map((s) => String(s.ad_id)));

    const data = ads.map((ad) => ({
      ...ad,
      likes_count: Number(ad?.likes_count || (Array.isArray(ad?.likes) ? ad.likes.length : 0)),
      comments_count: Number(ad?.comments_count || 0),
      is_liked_by_me: req.userId ? hasUserInList(ad?.likes, req.userId) : false,
      is_saved_by_me: savedAdSet.has(String(ad._id)),
    }));

    return res.json({ ads: data, total: data.length });
  } catch (error) {
    console.error('[Ad] getUserAdsWithComments error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── CATEGORIES ──────────────────────────────────────────────────────────────

exports.getAdCategories = async (req, res) => {
  try {
    const fromDb = await Ad.distinct('category', { isDeleted: false });
    const normalizedFromDb = fromDb
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const categories = Array.from(new Set([...DEFAULT_AD_CATEGORIES, ...normalizedFromDb])).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
    return res.json({ success: true, data: categories, categories });
  } catch (error) {
    console.error('[Ad] getAdCategories error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.addAdCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }
    // Categories are derived from ads, no separate collection needed
    // Just return success — the category will appear once an ad uses it
    return res.json({ success: true, message: 'Category noted', category: String(name).trim() });
  } catch (error) {
    console.error('[Ad] addAdCategory error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── LIKE / DISLIKE ──────────────────────────────────────────────────────────

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

// ─── SAVE / UNSAVE AD ────────────────────────────────────────────────────────

/**
 * POST /api/ads/:id/save
 */
exports.saveAd = async (req, res) => {
  try {
    const { id: adId } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    const ad = await Ad.findOne({ _id: adId, isDeleted: false });
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    const existing = await SavedAd.findOne({ user_id: userId, ad_id: adId });
    if (existing) {
      return res.status(409).json({ message: 'Ad already saved', is_saved: true });
    }

    await SavedAd.create({ user_id: userId, ad_id: adId });

    return res.json({ success: true, message: 'Ad saved successfully', is_saved: true });
  } catch (error) {
    console.error('[Ad] saveAd error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * DELETE /api/ads/:id/save
 */
exports.unsaveAd = async (req, res) => {
  try {
    const { id: adId } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    const deleted = await SavedAd.findOneAndDelete({ user_id: userId, ad_id: adId });
    if (!deleted) {
      return res.status(404).json({ message: 'Saved ad not found', is_saved: false });
    }

    return res.json({ success: true, message: 'Ad removed from saved', is_saved: false });
  } catch (error) {
    console.error('[Ad] unsaveAd error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── DELETE AD ───────────────────────────────────────────────────────────────

/**
 * DELETE /api/ads/:id
 * Soft deletes an ad. Only the owner can delete.
 * Refunds remaining budget back to wallet.
 */
exports.deleteAd = async (req, res) => {
  try {
    const { id: adId } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    const ad = await Ad.findOne({ _id: adId, isDeleted: false });
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    if (String(ad.user_id) !== String(userId)) {
      return res.status(403).json({ message: 'You can only delete your own ads' });
    }

    // Refund remaining unspent budget
    const spent = Number(ad.total_coins_spent || 0);
    const total = Number(ad.total_budget_coins || 0);
    const refund = Math.max(0, total - spent);

    if (refund > 0) {
      await Wallet.findOneAndUpdate(
        { user_id: userId },
        { $inc: { balance: refund }, $setOnInsert: { currency: 'Coins' } },
        { upsert: true }
      );

      await createWalletTransaction({
        user_id: userId,
        vendor_id: ad.vendor_id,
        ad_id: ad._id,
        type: 'AD_BUDGET_REFUND',
        amount: refund,
        status: 'SUCCESS',
        description: `Refund of unused budget for deleted ad: ${ad.ad_title || 'Untitled Ad'}`,
      });
    }

    // Soft delete
    ad.isDeleted = true;
    ad.deletedBy = userId;
    ad.deletedAt = new Date();
    ad.status = 'paused';
    await ad.save();

    return res.json({
      success: true,
      message: 'Ad deleted successfully',
      refunded_coins: refund,
    });
  } catch (error) {
    console.error('[Ad] deleteAd error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── UPDATE AD METADATA ──────────────────────────────────────────────────────

/**
 * PATCH /api/ads/:id
 * Updates allowed metadata fields. Only the owner can update.
 * Cannot update media or budget after creation.
 */
exports.updateAdMetadata = async (req, res) => {
  try {
    const { id: adId } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    const ad = await Ad.findOne({ _id: adId, isDeleted: false });
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    if (String(ad.user_id) !== String(userId)) {
      return res.status(403).json({ message: 'You can only update your own ads' });
    }

    // Only allow updating these fields
    const allowedFields = [
      'ad_title', 'ad_description', 'caption', 'location',
      'cta', 'targeting', 'target_language', 'target_location',
      'target_states', 'engagement_controls', 'tracking',
      'tags', 'keywords', 'hashtags', 'tagged_users',
      'category', 'sub_category', 'gallery',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    // If ad was rejected, allow re-submission by resetting to pending
    if (ad.status === 'rejected') {
      updates.status = 'pending';
      updates['compliance.approval_status'] = 'pending';
      updates.rejection_reason = '';
    }

    const updatedAd = await Ad.findByIdAndUpdate(
      adId,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate('vendor_id', 'business_name logo_url validated')
      .populate('user_id', 'username full_name avatar_url')
      .lean();

    return res.json({
      success: true,
      message: 'Ad updated successfully',
      data: updatedAd,
      ad: updatedAd,
    });
  } catch (error) {
    console.error('[Ad] updateAdMetadata error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getAllGalleryImages = async (req, res) => {
  try {
    // Get all ads that have gallery items
    const ads = await Ad.find({ isDeleted: false, gallery: { $exists: true, $not: { $size: 0 } } })
      .select('_id gallery')
      .lean();

    // Flatten into array of { adId, ...galleryItem }
    const galleryImages = [];
    ads.forEach(ad => {
      ad.gallery.forEach(item => {
        galleryImages.push({
          adId: ad._id,
          ...item
        });
      });
    });

    res.json({ success: true, data: galleryImages });
  } catch (error) {
    console.error('[Ad] getAllGalleryImages error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};