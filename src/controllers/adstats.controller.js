const Ad = require('../models/Ad');
const AdView = require('../models/AdView');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * GET /api/ads/:id/stats
 *
 * Returns comprehensive stats for a single ad:
 *  - likes breakdown by gender (male / female / other / unknown) + user IDs
 *  - dislikes breakdown by gender + user IDs
 *  - views breakdown by user location (total / unique / completed / rewarded)
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

    // ── 4. Views — group by viewer location via AdView → User join ────────
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

    // ── 5. Build final response ───────────────────────────────────────────
    res.json({
      ad_id:        ad._id,
      caption:      ad.caption,
      category:     ad.category,
      status:       ad.status,
      content_type: ad.content_type,
      created_at:   ad.createdAt,

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

      views: {
        total:       ad.views_count          || 0,
        unique:      ad.unique_views_count    || 0,
        completed:   ad.completed_views_count || 0,
        by_location: viewsWithLocation,
      },
    });
  } catch (error) {
    console.error('[AdStats]', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};