const Ad = require('../models/Ad');
const AdComment = require('../models/AdComment');
const AdView = require('../models/AdView');
const SavedAd = require('../models/SavedAd');
const MemberAdAction = require('../models/MemberAdAction');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * GET /api/ads/:id/stats
 *
 * Returns comprehensive stats for a single ad:
 *  - likes breakdown by gender (male / female / other / unknown) + user IDs
 *  - dislikes breakdown by gender + user IDs (Ad model has explicit dislikes[])
 *  - comments count (top-level + replies) + recent 5
 *  - views breakdown by user location (total / unique / completed / rewarded)
 *  - saves count
 *  - budget summary (total / spent / remaining)
 *  - coins earned per action type from MemberAdAction
 */
exports.getAdStats = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }

    // ── 1. Fetch the ad ───────────────────────────────────────────────────
    const ad = await Ad.findById(id).lean();
    if (!ad || ad.isDeleted) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    // ── 2. Likes — group liked users by gender ────────────────────────────
    const likedUserIds = ad.likes || [];

    const likedUsers = await User.find(
      { _id: { $in: likedUserIds } },
      { _id: 1, username: 1, full_name: 1, avatar_url: 1, gender: 1, location: 1 }
    ).lean();

    const likeGenderBuckets = { male: [], female: [], other: [], unknown: [] };
    for (const u of likedUsers) {
      const g = (u.gender || '').toLowerCase();
      if (g === 'male')        likeGenderBuckets.male.push(u);
      else if (g === 'female') likeGenderBuckets.female.push(u);
      else if (g)              likeGenderBuckets.other.push(u);
      else                     likeGenderBuckets.unknown.push(u);
    }

    const likesByGender = {
      male:    { count: likeGenderBuckets.male.length,    users: likeGenderBuckets.male },
      female:  { count: likeGenderBuckets.female.length,  users: likeGenderBuckets.female },
      other:   { count: likeGenderBuckets.other.length,   users: likeGenderBuckets.other },
      unknown: { count: likeGenderBuckets.unknown.length, users: likeGenderBuckets.unknown },
    };

    // ── 3. Dislikes — Ad model has explicit dislikes[] array ─────────────
    const dislikedUserIds = ad.dislikes || [];

    const dislikedUsers = await User.find(
      { _id: { $in: dislikedUserIds } },
      { _id: 1, username: 1, full_name: 1, avatar_url: 1, gender: 1, location: 1 }
    ).lean();

    const dislikeGenderBuckets = { male: 0, female: 0, other: 0, unknown: 0 };
    for (const u of dislikedUsers) {
      const g = (u.gender || '').toLowerCase();
      if (g === 'male')        dislikeGenderBuckets.male++;
      else if (g === 'female') dislikeGenderBuckets.female++;
      else if (g)              dislikeGenderBuckets.other++;
      else                     dislikeGenderBuckets.unknown++;
    }

    const dislikesByGender = {
      male:    { count: dislikeGenderBuckets.male },
      female:  { count: dislikeGenderBuckets.female },
      other:   { count: dislikeGenderBuckets.other },
      unknown: { count: dislikeGenderBuckets.unknown },
      users:   dislikedUsers,
    };

    // ── 4. Comments — total, top-level vs replies ─────────────────────────
    const [totalComments, topLevelComments, replyComments] = await Promise.all([
      AdComment.countDocuments({ ad_id: id, isDeleted: false }),
      AdComment.countDocuments({ ad_id: id, parent_id: null, isDeleted: false }),
      AdComment.countDocuments({ ad_id: id, parent_id: { $ne: null }, isDeleted: false }),
    ]);

    // Recent 5 top-level comments with commenter info
    const recentComments = await AdComment.find(
      { ad_id: id, parent_id: null, isDeleted: false }
    )
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user_id', 'username avatar_url')
      .lean();

    const recentCommentsMapped = recentComments.map(c => ({
      _id: c._id,
      text: c.text,
      likes_count: (c.likes || []).length,
      dislikes_count: (c.dislikes || []).length,
      user: c.user_id
        ? { username: c.user_id.username, avatar_url: c.user_id.avatar_url }
        : null,
      createdAt: c.createdAt,
    }));

    // ── 5. Views — group by viewer location via AdView → User join ────────
    const viewsWithLocation = await AdView.aggregate([
      { $match: { ad_id: new mongoose.Types.ObjectId(id) } },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$user.location', 'Unknown'] },
          views: { $sum: '$view_count' },
          unique_viewers: { $addToSet: '$user_id' },
          completed_views: {
            $sum: { $cond: [{ $eq: ['$completed', true] }, 1, 0] },
          },
          rewarded_views: {
            $sum: { $cond: [{ $eq: ['$rewarded', true] }, 1, 0] },
          },
          total_coins_rewarded: { $sum: '$coins_rewarded' },
        },
      },
      {
        $project: {
          location: '$_id',
          views: 1,
          unique_viewers: { $size: '$unique_viewers' },
          completed_views: 1,
          rewarded_views: 1,
          total_coins_rewarded: 1,
          _id: 0,
        },
      },
      { $sort: { views: -1 } },
    ]);

    // ── 6. Saves count ────────────────────────────────────────────────────
    const savesCount = await SavedAd.countDocuments({ ad_id: id });

    // ── 7. Coins breakdown from MemberAdAction ────────────────────────────
    const coinBreakdown = await MemberAdAction.aggregate([
      { $match: { ad_id: new mongoose.Types.ObjectId(id) } },
      {
        $group: {
          _id: '$event_type',
          count: { $sum: 1 },
          total_coins: { $sum: '$credit_delta' },
        },
      },
      {
        $project: {
          event_type: '$_id',
          count: 1,
          total_coins: 1,
          _id: 0,
        },
      },
    ]);

    // Convert to a map for easy reading
    const coinsByAction = {};
    for (const row of coinBreakdown) {
      coinsByAction[row.event_type] = {
        count: row.count,
        total_coins: row.total_coins,
      };
    }

    // ── 8. Budget summary ─────────────────────────────────────────────────
    const totalBudget = ad.total_budget_coins || 0;
    const totalSpent  = ad.total_coins_spent  || 0;
    const budget = {
      total: totalBudget,
      spent: totalSpent,
      remaining: Math.max(0, totalBudget - totalSpent),
      spent_percentage: totalBudget > 0
        ? parseFloat(((totalSpent / totalBudget) * 100).toFixed(2))
        : 0,
    };

    // ── 9. Build final response ───────────────────────────────────────────
    res.json({
      ad_id:      ad._id,
      caption:    ad.caption,
      category:   ad.category,
      status:     ad.status,
      content_type: ad.content_type,
      created_at: ad.createdAt,

      likes: {
        total:     likedUserIds.length,
        by_gender: likesByGender,
        user_ids:  likedUserIds,
      },

      dislikes: {
        total:     dislikedUserIds.length,
        by_gender: dislikesByGender,
        user_ids:  dislikedUserIds,
      },

      comments: {
        total:     totalComments,
        top_level: topLevelComments,
        replies:   replyComments,
        recent:    recentCommentsMapped,
      },

      views: {
        total:     ad.views_count        || 0,
        unique:    ad.unique_views_count  || 0,
        completed: ad.completed_views_count || 0,
        by_location: viewsWithLocation,
      },

      saves: {
        total: savesCount,
      },

      budget,

      coins: {
        by_action: coinsByAction,
      },
    });
  } catch (error) {
    console.error('[AdStats]', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};