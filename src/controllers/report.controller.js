const mongoose = require('mongoose');
const Ad         = require('../models/Ad');
const AdClick    = require('../models/AdClick');
const AdView     = require('../models/AdView');
const AdComment  = require('../models/AdComment');
const AdEngagement = require('../models/AdEngagement');
const MemberAdAction = require('../models/MemberAdAction');
const WalletTransaction = require('../models/WalletTransaction');
const VendorProfileView = require('../models/VendorProfileView');
const Vendor = require('../models/Vendor');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a Mongoose date filter object from query params.
 * @param {string|undefined} startDate  ISO date string  e.g. "2025-01-01"
 * @param {string|undefined} endDate    ISO date string  e.g. "2025-03-31"
 * @returns {object}  Empty object (no filter) or { $gte, $lte }
 */
function buildDateFilter(startDate, endDate) {
  const filter = {};
  if (startDate) filter.$gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);   // include the full end day
    filter.$lte = end;
  }
  return Object.keys(filter).length ? filter : null;
}

/**
 * Resolve vendor_id for the request.
 * - Admins can pass ?vendor_id=xxx to scope the report to a specific vendor.
 * - Vendors always get their own data only (vendor_id from Vendor profile).
 *
 * Returns null if the caller is an admin with no vendor_id filter (= all vendors).
 */
async function resolveVendorId(req) {
  const { role } = req.user;

  if (role === 'admin') {
    return req.query.vendor_id
      ? new mongoose.Types.ObjectId(req.query.vendor_id)
      : null; // null → no vendor filter for admin
  }

  // Vendor: must scope to their own vendor profile
  const Vendor = require('../models/Vendor');
  const vendor = await Vendor.findOne({ user_id: req.user._id }).lean();
  if (!vendor) throw Object.assign(new Error('Vendor profile not found'), { status: 403 });
  return vendor._id;
}

async function resolveFilteredAdIds({
  vendorId,
  adId,
  dateFilter,
  country,
  gender,
  language,
}) {
  const adFilter = { isDeleted: false };
  if (vendorId) adFilter.vendor_id = vendorId;
  if (adId && mongoose.Types.ObjectId.isValid(adId)) {
    adFilter._id = new mongoose.Types.ObjectId(adId);
  }

  if (country || gender || language) {
    const clickMatch = {};
    const saveMatch = { action_type: 'save' };

    if (vendorId) {
      clickMatch.vendor_id = vendorId;
      saveMatch.vendor_id = vendorId;
    }
    if (adId && mongoose.Types.ObjectId.isValid(adId)) {
      const objectId = new mongoose.Types.ObjectId(adId);
      clickMatch.ad_id = objectId;
      saveMatch.ad_id = objectId;
    }
    if (country) {
      clickMatch.country = new RegExp(country, 'i');
      saveMatch.country = new RegExp(country, 'i');
    }
    if (gender) {
      clickMatch.gender = String(gender).toLowerCase();
      saveMatch.gender = String(gender).toLowerCase();
    }
    if (language) {
      clickMatch.language = new RegExp(language, 'i');
      saveMatch.language = new RegExp(language, 'i');
    }
    if (dateFilter) {
      clickMatch.createdAt = dateFilter;
      saveMatch.createdAt = dateFilter;
    }

    const [clickIds, saveIds] = await Promise.all([
      AdClick.distinct('ad_id', clickMatch),
      AdEngagement.distinct('ad_id', saveMatch),
    ]);

    const mergedIds = [...new Set([...clickIds, ...saveIds].map((id) => String(id)))];
    if (mergedIds.length === 0) return [];
    adFilter._id = { $in: mergedIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const ads = await Ad.find(adFilter).select('_id').lean();
  return ads.map((ad) => ad._id);
}

exports.getSummaryReport = async (req, res) => {
  try {
    const { startDate, endDate, ad_id, country, gender, language } = req.query;

    let vendorId;
    try {
      vendorId = await resolveVendorId(req);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }

    const dateFilter = buildDateFilter(startDate, endDate);
    const adIds = await resolveFilteredAdIds({
      vendorId,
      adId: ad_id,
      dateFilter,
      country,
      gender,
      language,
    });

    if (adIds.length === 0) {
      return res.json({
        filters: {
          startDate: startDate || null,
          endDate: endDate || null,
          ad_id: ad_id || null,
          country: country || null,
          language: language || null,
          gender: gender || null,
        },
        overview: {
          total_impressions: 0,
          total_clicks: 0,
          engagement_rate: 0,
          total_spend: 0,
          conversions: 0,
          reach: 0,
        },
      });
    }

    const adObjectIds = adIds.map((id) => new mongoose.Types.ObjectId(id));

    const adViewMatch = { ad_id: { $in: adObjectIds } };
    if (dateFilter) adViewMatch.createdAt = dateFilter;

    const adClickMatch = { ad_id: { $in: adObjectIds } };
    if (vendorId) adClickMatch.vendor_id = vendorId;
    if (country) adClickMatch.country = new RegExp(country, 'i');
    if (gender) adClickMatch.gender = String(gender).toLowerCase();
    if (language) adClickMatch.language = new RegExp(language, 'i');
    if (dateFilter) adClickMatch.createdAt = dateFilter;

    const saveMatch = { ad_id: { $in: adObjectIds }, action_type: 'save' };
    if (vendorId) saveMatch.vendor_id = vendorId;
    if (country) saveMatch.country = new RegExp(country, 'i');
    if (gender) saveMatch.gender = String(gender).toLowerCase();
    if (language) saveMatch.language = new RegExp(language, 'i');
    if (dateFilter) saveMatch.createdAt = dateFilter;

    const actionMatch = { ad_id: { $in: adObjectIds } };
    if (dateFilter) actionMatch.createdAt = dateFilter;

    const commentMatch = { ad_id: { $in: adObjectIds }, isDeleted: false };
    if (dateFilter) commentMatch.createdAt = dateFilter;

    const spendMatch = {
      ad_id: { $in: adObjectIds },
      type: { $in: ['AD_VIEW_DEDUCTION', 'AD_LIKE_DEDUCTION', 'AD_COMMENT_DEDUCTION', 'AD_REPLY_DEDUCTION', 'AD_SAVE_DEDUCTION'] },
    };
    if (dateFilter) spendMatch.createdAt = dateFilter;

    const [
      viewAgg,
      clickAgg,
      saveAgg,
      actionAgg,
      commentAgg,
      spendAgg,
      reachAgg,
    ] = await Promise.all([
      AdView.aggregate([
        { $match: adViewMatch },
        { $group: { _id: null, total_impressions: { $sum: '$view_count' } } },
      ]),
      AdClick.aggregate([
        { $match: adClickMatch },
        {
          $group: {
            _id: null,
            total_clicks: { $sum: 1 },
            unique_clicks: { $sum: { $cond: ['$is_unique', 1, 0] } },
          },
        },
      ]),
      AdEngagement.aggregate([
        { $match: saveMatch },
        { $group: { _id: null, saves: { $sum: 1 } } },
      ]),
      MemberAdAction.aggregate([
        { $match: actionMatch },
        {
          $group: {
            _id: null,
            likes: { $sum: { $cond: [{ $eq: ['$event_type', 'like'] }, 1, 0] } },
          },
        },
      ]),
      AdComment.aggregate([
        { $match: commentMatch },
        { $group: { _id: null, comments: { $sum: 1 } } },
      ]),
      WalletTransaction.aggregate([
        { $match: spendMatch },
        { $group: { _id: null, total_spend: { $sum: { $abs: '$amount' } } } },
      ]),
      AdView.aggregate([
        { $match: adViewMatch },
        { $group: { _id: '$user_id' } },
        { $count: 'reach' },
      ]),
    ]);

    const totalImpressions = viewAgg[0]?.total_impressions || 0;
    const totalClicks = clickAgg[0]?.total_clicks || 0;
    const uniqueClicks = clickAgg[0]?.unique_clicks || 0;
    const likes = actionAgg[0]?.likes || 0;
    const comments = commentAgg[0]?.comments || 0;
    const saves = saveAgg[0]?.saves || 0;
    const totalSpend = spendAgg[0]?.total_spend || 0;
    const reach = reachAgg[0]?.reach || 0;
    const engagementRate =
      totalImpressions > 0 ? +(((likes + comments + saves) / totalImpressions) * 100).toFixed(2) : 0;

    return res.json({
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        ad_id: ad_id || null,
        country: country || null,
        language: language || null,
        gender: gender || null,
      },
      overview: {
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        engagement_rate: engagementRate,
        total_spend: totalSpend,
        conversions: uniqueClicks,
        reach,
      },
    });
  } catch (err) {
    console.error('[SummaryReport]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 1.  CLICK REPORT
//     GET /api/reports/clicks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc   Click-through report — one row per ad with click metrics.
 * @access Vendor (own ads) | Admin (all or filtered by vendor_id)
 *
 * Query params
 * ────────────
 *  startDate   string   ISO date  e.g. "2025-01-01"
 *  endDate     string   ISO date  e.g. "2025-03-31"
 *  ad_id       string   Filter to a single ad
 *  vendor_id   string   Admin only — scope to a specific vendor
 *  country     string   Filter clicks by viewer country
 *  gender      string   Filter clicks by viewer gender  (male|female|other)
 *  language    string   Filter clicks by viewer language
 *  page        number   Default 1
 *  limit       number   Default 20, max 100
 *
 * Response shape (per ad row)
 * ───────────────────────────
 *  ad_id, ad_name (caption), status, category
 *  total_clicks, unique_clicks, invalid_clicks
 *  cpc          → total_coins_spent / total_clicks  (0 if no clicks)
 *  click_rate   → total_clicks / impressions * 100   (0 if no impressions)
 *  impressions  → AdView total view_count sum for this ad in the date range
 */
exports.getClickReport = async (req, res) => {
  try {
    const {
      startDate, endDate,
      ad_id,
      country, gender, language,
      page = 1, limit = 20,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);
    const skip     = (pageNum - 1) * limitNum;

    // ── 1. Resolve vendor scope ───────────────────────────────────────────
    let vendorId;
    try {
      vendorId = await resolveVendorId(req);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }

    // ── 2. Build AdClick match stage ─────────────────────────────────────
    const clickMatch = {};
    if (vendorId)  clickMatch.vendor_id  = vendorId;
    if (ad_id && mongoose.Types.ObjectId.isValid(ad_id)) {
      clickMatch.ad_id = new mongoose.Types.ObjectId(ad_id);
    }
    if (country)  clickMatch.country  = new RegExp(country, 'i');
    if (gender)   clickMatch.gender   = gender.toLowerCase();
    if (language) clickMatch.language = new RegExp(language, 'i');

    const dateFilter = buildDateFilter(startDate, endDate);
    if (dateFilter) clickMatch.createdAt = dateFilter;

    // ── 3. Aggregate clicks → group by ad_id ─────────────────────────────
    const clickAgg = await AdClick.aggregate([
      { $match: clickMatch },
      {
        $group: {
          _id:           '$ad_id',
          total_clicks:  { $sum: 1 },
          unique_clicks: { $sum: { $cond: ['$is_unique', 1, 0] } },
          invalid_clicks:{ $sum: { $cond: ['$is_invalid', 1, 0] } },
          coins_spent:   { $sum: '$coins_spent' },
        },
      },
    ]);

    // Build a lookup map: adId → click stats
    const clickMap = {};
    for (const row of clickAgg) {
      clickMap[row._id.toString()] = row;
    }

    // ── 4. Fetch the ads themselves (for name / status / category) ────────
    const adFilter = { isDeleted: false };
    if (vendorId) adFilter.vendor_id = vendorId;
    if (ad_id && mongoose.Types.ObjectId.isValid(ad_id)) {
      adFilter._id = new mongoose.Types.ObjectId(ad_id);
    }
    const totalAds = await Ad.countDocuments(adFilter);
    const ads = await Ad.find(adFilter, {
      _id: 1, caption: 1, status: 1, category: 1,
      views_count: 1, total_coins_spent: 1, vendor_id: 1,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // ── 5. Pull impressions from AdView for these ads in date window ──────
    const adIds = ads.map(a => a._id);
    const viewMatch = { ad_id: { $in: adIds } };
    if (dateFilter) viewMatch.createdAt = dateFilter;

    const viewAgg = await AdView.aggregate([
      { $match: viewMatch },
      {
        $group: {
          _id:         '$ad_id',
          impressions: { $sum: '$view_count' },
        },
      },
    ]);
    const viewMap = {};
    for (const v of viewAgg) viewMap[v._id.toString()] = v.impressions;

    // ── 6. Compose final rows ─────────────────────────────────────────────
    const rows = ads.map((ad) => {
      const adIdStr       = ad._id.toString();
      const clicks        = clickMap[adIdStr] || {};
      const total_clicks  = clicks.total_clicks  || 0;
      const unique_clicks = clicks.unique_clicks || 0;
      const invalid_clicks= clicks.invalid_clicks|| 0;
      const coins_spent   = clicks.coins_spent   || 0;
      const impressions   = viewMap[adIdStr]     || 0;

      const cpc        = total_clicks > 0 ? +(coins_spent / total_clicks).toFixed(2) : 0;
      const click_rate = impressions  > 0 ? +((total_clicks / impressions) * 100).toFixed(2) : 0;

      return {
        ad_id:         ad._id,
        ad_name:       ad.caption || '(Untitled)',
        status:        ad.status,
        category:      ad.category,
        impressions,
        total_clicks,
        unique_clicks,
        invalid_clicks,
        cpc,
        click_rate,
        coins_spent,
      };
    });

    return res.json({
      total:      totalAds,
      page:       pageNum,
      limit:      limitNum,
      totalPages: Math.ceil(totalAds / limitNum),
      data:       rows,
    });
  } catch (err) {
    console.error('[ClickReport]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2.  ENGAGEMENT REPORT
//     GET /api/reports/engagement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc   Engagement report — one row per ad with likes / comments / saves metrics.
 * @access Vendor (own ads) | Admin (all or filtered by vendor_id)
 *
 * Query params
 * ────────────
 *  startDate   string   ISO date  e.g. "2025-01-01"
 *  endDate     string   ISO date  e.g. "2025-03-31"
 *  ad_id       string   Filter to a single ad
 *  vendor_id   string   Admin only — scope to a specific vendor
 *  country     string   Filter engagement events by viewer country
 *  gender      string   Filter engagement events by viewer gender
 *  language    string   Filter engagement events by viewer language
 *  page        number   Default 1
 *  limit       number   Default 20, max 100
 *
 * Response shape (per ad row)
 * ───────────────────────────
 *  ad_id, ad_name, status, category
 *  likes        → MemberAdAction count where event_type = 'like' in date window
 *  dislikes     → MemberAdAction count where event_type = 'dislike'
 *  comments     → AdComment count in date window
 *  saves        → AdEngagement count where action_type = 'save' in date window
 *  impressions  → AdView total for date window
 *  engagement_rate → (likes + comments + saves) / impressions * 100
 */
exports.getEngagementReport = async (req, res) => {
  try {
    const {
      startDate, endDate,
      ad_id,
      country, gender, language,
      page = 1, limit = 20,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);
    const skip     = (pageNum - 1) * limitNum;

    // ── 1. Resolve vendor scope ───────────────────────────────────────────
    let vendorId;
    try {
      vendorId = await resolveVendorId(req);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }

    const dateFilter = buildDateFilter(startDate, endDate);

    // ── 2. Build demographic filter for AdEngagement ──────────────────────
    //    (AdEngagement stores denormalised country / gender / language)
    const engMatch = { action_type: 'save' };
    if (vendorId) engMatch.vendor_id = vendorId;
    if (ad_id && mongoose.Types.ObjectId.isValid(ad_id)) {
      engMatch.ad_id = new mongoose.Types.ObjectId(ad_id);
    }
    if (country)  engMatch.country  = new RegExp(country, 'i');
    if (gender)   engMatch.gender   = gender.toLowerCase();
    if (language) engMatch.language = new RegExp(language, 'i');
    if (dateFilter) engMatch.createdAt = dateFilter;

    // ── 3. Build like-action match for MemberAdAction ─────────────────────
    //    MemberAdAction does NOT have denormalised demographics → we use AdView
    //    for impression filtering and fall back to the Ad list for likes/comments.
    //    If demographic filters are requested we first get the matching ad list
    //    from AdEngagement, then scope likes/comments to those ads.
    let demographicAdIds = null; // null = no demographic restriction
    if (country || gender || language) {
      const demographicAgg = await AdEngagement.distinct('ad_id', engMatch);
      demographicAdIds = demographicAgg;
    }

    // ── 4. Fetch ads ──────────────────────────────────────────────────────
    const adFilter = { isDeleted: false };
    if (vendorId) adFilter.vendor_id = vendorId;
    if (ad_id && mongoose.Types.ObjectId.isValid(ad_id)) {
      adFilter._id = new mongoose.Types.ObjectId(ad_id);
    }
    if (demographicAdIds) {
      adFilter._id = { $in: demographicAdIds };
    }

    const totalAds = await Ad.countDocuments(adFilter);
    const ads = await Ad.find(adFilter, {
      _id: 1, caption: 1, status: 1, category: 1, views_count: 1,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const adIds = ads.map(a => a._id);

    // ── 5. Aggregate likes from MemberAdAction ────────────────────────────
    const likeMatch = {
      ad_id: { $in: adIds },
      event_type: 'like',
    };
    if (dateFilter) likeMatch.createdAt = dateFilter;

    const likeAgg = await MemberAdAction.aggregate([
      { $match: likeMatch },
      { $group: { _id: '$ad_id', likes: { $sum: 1 } } },
    ]);
    const likeMap = {};
    for (const r of likeAgg) likeMap[r._id.toString()] = r.likes;

    // ── 6. Aggregate dislikes from MemberAdAction ─────────────────────────
    const dislikeMatch = {
      ad_id: { $in: adIds },
      event_type: 'dislike',
    };
    if (dateFilter) dislikeMatch.createdAt = dateFilter;

    const dislikeAgg = await MemberAdAction.aggregate([
      { $match: dislikeMatch },
      { $group: { _id: '$ad_id', dislikes: { $sum: 1 } } },
    ]);
    const dislikeMap = {};
    for (const r of dislikeAgg) dislikeMap[r._id.toString()] = r.dislikes;

    // ── 7. Aggregate comments from AdComment ─────────────────────────────
    const commentMatch = { ad_id: { $in: adIds }, isDeleted: false };
    if (dateFilter) commentMatch.createdAt = dateFilter;

    const commentAgg = await AdComment.aggregate([
      { $match: commentMatch },
      { $group: { _id: '$ad_id', comments: { $sum: 1 } } },
    ]);
    const commentMap = {};
    for (const r of commentAgg) commentMap[r._id.toString()] = r.comments;

    // ── 8. Aggregate saves from AdEngagement ─────────────────────────────
    const saveMatch = { ad_id: { $in: adIds }, action_type: 'save' };
    if (vendorId) saveMatch.vendor_id = vendorId;
    if (dateFilter) saveMatch.createdAt = dateFilter;

    const saveAgg = await AdEngagement.aggregate([
      { $match: saveMatch },
      { $group: { _id: '$ad_id', saves: { $sum: 1 } } },
    ]);
    const saveMap = {};
    for (const r of saveAgg) saveMap[r._id.toString()] = r.saves;

    // ── 9. Impressions from AdView ────────────────────────────────────────
    const viewMatch = { ad_id: { $in: adIds } };
    if (dateFilter) viewMatch.createdAt = dateFilter;

    const viewAgg = await AdView.aggregate([
      { $match: viewMatch },
      { $group: { _id: '$ad_id', impressions: { $sum: '$view_count' } } },
    ]);
    const viewMap = {};
    for (const v of viewAgg) viewMap[v._id.toString()] = v.impressions;

    // ── 10. Compose final rows ────────────────────────────────────────────
    const rows = ads.map((ad) => {
      const id         = ad._id.toString();
      const likes      = likeMap[id]    || 0;
      const dislikes   = dislikeMap[id] || 0;
      const comments   = commentMap[id] || 0;
      const saves      = saveMap[id]    || 0;
      const impressions= viewMap[id]    || 0;

      const engagement_rate =
        impressions > 0
          ? +(((likes + comments + saves) / impressions) * 100).toFixed(2)
          : 0;

      return {
        ad_id:           ad._id,
        ad_name:         ad.caption || '(Untitled)',
        status:          ad.status,
        category:        ad.category,
        impressions,
        likes,
        dislikes,
        comments,
        saves,
        engagement_rate,
      };
    });

    return res.json({
      total:      totalAds,
      page:       pageNum,
      limit:      limitNum,
      totalPages: Math.ceil(totalAds / limitNum),
      data:       rows,
    });
  } catch (err) {
    console.error('[EngagementReport]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Geographic report
exports.getGeographicReport = async (req, res) => {
  try {
    const {
      startDate, endDate,
      ad_id,
      country, gender, language,
      page = 1, limit = 50,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 50);
    const skip = (pageNum - 1) * limitNum;

    let vendorId;
    try {
      vendorId = await resolveVendorId(req);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }

    const dateFilter = buildDateFilter(startDate, endDate);
    const adIds = await resolveFilteredAdIds({
      vendorId,
      adId: ad_id,
      dateFilter,
      country,
      gender,
      language,
    });

    if (adIds.length === 0) {
      return res.json({ total: 0, page: pageNum, limit: limitNum, totalPages: 0, data: [] });
    }

    const adObjectIds = adIds.map((id) => new mongoose.Types.ObjectId(id));

    const clickMatch = { ad_id: { $in: adObjectIds } };
    if (vendorId) clickMatch.vendor_id = vendorId;
    if (country) clickMatch.country = new RegExp(country, 'i');
    if (gender) clickMatch.gender = String(gender).toLowerCase();
    if (language) clickMatch.language = new RegExp(language, 'i');
    if (dateFilter) clickMatch.createdAt = dateFilter;

    const clickRows = await AdClick.aggregate([
      { $match: clickMatch },
      {
        $group: {
          _id: { $ifNull: ['$country', 'Unknown'] },
          ad_clicks: { $sum: 1 },
        },
      },
    ]);

    const profileViewMatch = {};
    if (req.user.role === 'vendor') {
      profileViewMatch.vendor_user_id = new mongoose.Types.ObjectId(req.user._id);
    } else if (vendorId) {
      const vendorDoc = await Vendor.findById(vendorId).select('user_id').lean();
      if (vendorDoc?.user_id) {
        profileViewMatch.vendor_user_id = new mongoose.Types.ObjectId(vendorDoc.user_id);
      }
    }
    if (country) profileViewMatch.country = new RegExp(country, 'i');
    if (gender) profileViewMatch.gender = String(gender).toLowerCase();
    if (language) profileViewMatch.language = new RegExp(language, 'i');
    if (dateFilter) profileViewMatch.updatedAt = dateFilter;

    const profileViewRows = await VendorProfileView.aggregate([
      { $match: profileViewMatch },
      {
        $group: {
          _id: { $ifNull: ['$country', 'Unknown'] },
          profile_views: { $sum: '$view_count' },
          profile_viewers: { $addToSet: '$viewer_user_id' },
        },
      },
      {
        $project: {
          _id: 1,
          profile_views: 1,
          profile_unique_viewers: { $size: '$profile_viewers' },
        },
      },
    ]);

    const viewMatch = { ad_id: { $in: adObjectIds } };
    if (dateFilter) viewMatch.createdAt = dateFilter;

    const viewRows = await AdView.aggregate([
      { $match: viewMatch },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'viewer',
        },
      },
      { $unwind: { path: '$viewer', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          viewer_country: {
            $ifNull: [
              '$viewer.address.country',
              { $ifNull: ['$viewer.location', 'Unknown'] },
            ],
          },
          viewer_gender: { $toLower: { $ifNull: ['$viewer.gender', ''] } },
          viewer_language: { $ifNull: ['$viewer.language', ''] },
        },
      },
      ...(country ? [{ $match: { viewer_country: new RegExp(country, 'i') } }] : []),
      ...(gender ? [{ $match: { viewer_gender: String(gender).toLowerCase() } }] : []),
      ...(language ? [{ $match: { viewer_language: new RegExp(language, 'i') } }] : []),
      {
        $group: {
          _id: '$viewer_country',
          impressions: { $sum: '$view_count' },
          viewers: { $addToSet: '$user_id' },
        },
      },
      {
        $project: {
          _id: 1,
          impressions: 1,
          reach: { $size: '$viewers' },
        },
      },
    ]);

    const countryMap = {};
    clickRows.forEach((row) => {
      const key = row._id || 'Unknown';
      countryMap[key] = {
        country: key,
        impressions: 0,
        clicks: row.ad_clicks || 0,
        ad_clicks: row.ad_clicks || 0,
        profile_views: 0,
        profile_unique_viewers: 0,
        reach: 0,
      };
    });
    viewRows.forEach((row) => {
      const key = row._id || 'Unknown';
      if (!countryMap[key]) {
        countryMap[key] = {
          country: key,
          impressions: 0,
          clicks: 0,
          ad_clicks: 0,
          profile_views: 0,
          profile_unique_viewers: 0,
          reach: 0,
        };
      }
      countryMap[key].impressions = row.impressions || 0;
      countryMap[key].reach = row.reach || 0;
    });
    profileViewRows.forEach((row) => {
      const key = row._id || 'Unknown';
      if (!countryMap[key]) {
        countryMap[key] = {
          country: key,
          impressions: 0,
          clicks: 0,
          ad_clicks: 0,
          profile_views: 0,
          profile_unique_viewers: 0,
          reach: 0,
        };
      }
      countryMap[key].profile_views = row.profile_views || 0;
      countryMap[key].profile_unique_viewers = row.profile_unique_viewers || 0;
      countryMap[key].clicks += row.profile_views || 0;
    });

    const allRows = Object.values(countryMap)
      .map((row) => ({
        ...row,
        ctr: row.impressions > 0 ? +((row.clicks / row.impressions) * 100).toFixed(2) : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

    const pagedRows = allRows.slice(skip, skip + limitNum);

    return res.json({
      total: allRows.length,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(allRows.length / limitNum),
      data: pagedRows,
    });
  } catch (err) {
    console.error('[GeographicReport]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE SUMMARY REPORT  (date-wise)
// GET /api/reports/performance-summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc   Performance Summary — date-wise impressions, clicks, CTR, reach, frequency.
 * @access Vendor (own ads) | Admin (all or filtered by vendor_id)
 *
 * Query params
 * ────────────
 *  startDate   string   ISO date  e.g. "2025-01-01"
 *  endDate     string   ISO date  e.g. "2025-03-31"
 *  ad_id       string   Filter to a single ad
 *  vendor_id   string   Admin only — scope to a specific vendor
 *  country     string   Filter by viewer country (case-insensitive)
 *  gender      string   Filter by viewer gender  (male|female|other)
 *  language    string   Filter by viewer language (case-insensitive)
 *
 * Response shape
 * ──────────────
 *  data: [
 *    {
 *      date:        "2025-01-01",          // YYYY-MM-DD
 *      impressions: 12400,                 // total view_count for that day
 *      clicks:      320,                   // total click events for that day
 *      ctr:         2.58,                  // clicks / impressions * 100  (%)
 *      reach:       9800,                  // distinct users who saw the ad
 *      frequency:   1.26,                  // impressions / reach
 *    },
 *    ...
 *  ]
 */
exports.getPerformanceSummaryReport = async (req, res) => {
  try {
    const { startDate, endDate, ad_id, country, gender, language } = req.query;

    // ── 1. Resolve vendor scope ───────────────────────────────────────────
    let vendorId;
    try {
      vendorId = await resolveVendorId(req);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }

    const dateFilter = buildDateFilter(startDate, endDate);

    // ── 2. Resolve matching ad IDs (honours vendor scope + demographic filters)
    const adIds = await resolveFilteredAdIds({
      vendorId,
      adId: ad_id,
      dateFilter,
      country,
      gender,
      language,
    });

    if (adIds.length === 0) {
      return res.json({
        filters: {
          startDate: startDate || null,
          endDate:   endDate   || null,
          ad_id:     ad_id     || null,
          country:   country   || null,
          gender:    gender    || null,
          language:  language  || null,
        },
        total_days: 0,
        data: [],
      });
    }

    const adObjectIds = adIds.map((id) => new mongoose.Types.ObjectId(id));

    // ── 3. Date-wise IMPRESSIONS + REACH from AdView ──────────────────────
    const viewMatch = { ad_id: { $in: adObjectIds } };
    if (dateFilter) viewMatch.createdAt = dateFilter;

    const viewPipeline = [{ $match: viewMatch }];

    if (country || gender || language) {
      viewPipeline.push(
        {
          $lookup: {
            from: 'users',
            localField: 'user_id',
            foreignField: '_id',
            as: '_viewer',
          },
        },
        { $unwind: { path: '$_viewer', preserveNullAndEmptyArrays: true } }
      );

      const demographicMatch = {};
      if (country) {
        demographicMatch['$or'] = [
          { '_viewer.address.country': new RegExp(country, 'i') },
          { '_viewer.location': new RegExp(country, 'i') },
        ];
      }
      if (gender) {
        demographicMatch['_viewer.gender'] = String(gender).toLowerCase();
      }
      if (language) {
        demographicMatch['_viewer.language'] = new RegExp(language, 'i');
      }
      viewPipeline.push({ $match: demographicMatch });
    }

    viewPipeline.push(
      {
        $group: {
          _id: {
            year:  { $year:        '$createdAt' },
            month: { $month:       '$createdAt' },
            day:   { $dayOfMonth:  '$createdAt' },
          },
          impressions: { $sum: '$view_count' },
          viewers:     { $addToSet: '$user_id' },
        },
      },
      {
        $project: {
          _id:         1,
          impressions: 1,
          reach:       { $size: '$viewers' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    );

    // ── 4. Date-wise CLICKS from AdClick ──────────────────────────────────
    const clickMatch = { ad_id: { $in: adObjectIds } };
    if (vendorId)   clickMatch.vendor_id  = vendorId;
    if (country)    clickMatch.country    = new RegExp(country, 'i');
    if (gender)     clickMatch.gender     = String(gender).toLowerCase();
    if (language)   clickMatch.language   = new RegExp(language, 'i');
    if (dateFilter) clickMatch.createdAt  = dateFilter;

    const clickPipeline = [
      { $match: clickMatch },
      {
        $group: {
          _id: {
            year:  { $year:       '$createdAt' },
            month: { $month:      '$createdAt' },
            day:   { $dayOfMonth: '$createdAt' },
          },
          clicks: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ];

    // ── 5. Run both aggregations in parallel ──────────────────────────────
    const [viewRows, clickRows] = await Promise.all([
      AdView.aggregate(viewPipeline),
      AdClick.aggregate(clickPipeline),
    ]);

    // ── 6. Merge into a single date-keyed map ─────────────────────────────
    const padded = (n) => String(n).padStart(2, '0');
    const toKey  = ({ year, month, day }) =>
      `${year}-${padded(month)}-${padded(day)}`;

    const dayMap = {};

    for (const row of viewRows) {
      const key = toKey(row._id);
      dayMap[key] = { impressions: row.impressions || 0, reach: row.reach || 0, clicks: 0 };
    }

    for (const row of clickRows) {
      const key = toKey(row._id);
      if (!dayMap[key]) {
        dayMap[key] = { impressions: 0, reach: 0, clicks: 0 };
      }
      dayMap[key].clicks = row.clicks || 0;
    }

    // ── 7. Build final sorted array ───────────────────────────────────────
    const data = Object.entries(dayMap)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, metrics]) => {
        const { impressions, clicks, reach } = metrics;
        const ctr       = impressions > 0 ? +((clicks / impressions) * 100).toFixed(2) : 0;
        const frequency = reach       > 0 ? +(impressions / reach).toFixed(2)          : 0;
        return { date, impressions, clicks, ctr, reach, frequency };
      });

    return res.json({
      filters: {
        startDate: startDate || null,
        endDate:   endDate   || null,
        ad_id:     ad_id     || null,
        country:   country   || null,
        gender:    gender    || null,
        language:  language  || null,
      },
      total_days: data.length,
      data,
    });
  } catch (err) {
    console.error('[PerformanceSummaryReport]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
