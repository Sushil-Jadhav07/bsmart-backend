const Post = require('../models/Post');
const Comment = require('../models/Comment');
const PostView = require('../models/PostView');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * GET /api/posts/:id/stats
 *
 * Returns comprehensive stats for a single post:
 *  - likes breakdown by gender (male / female / other / unknown)
 *  - full list of user IDs (and basic profile) who liked
 *  - dislikes (unlikes) — tracked via who is NOT in likes but viewed
 *  - comments count (top-level + replies)
 *  - views breakdown by user location
 *  - unique viewers count
 */
exports.getPostStats = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid post ID' });
    }

    // ── 1. Fetch the post ─────────────────────────────────────────────────
    const post = await Post.findById(id).lean();
    if (!post || post.isDeleted) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // ── 2. Likes — populate users who liked, group by gender ─────────────
    const likedUserIds = post.likes || [];

    const likedUsers = await User.find(
      { _id: { $in: likedUserIds } },
      { _id: 1, username: 1, full_name: 1, avatar_url: 1, gender: 1, location: 1 }
    ).lean();

    // Build gender buckets
    const genderBuckets = { male: [], female: [], other: [], unknown: [] };
    for (const u of likedUsers) {
      const g = (u.gender || '').toLowerCase();
      if (g === 'male') genderBuckets.male.push(u);
      else if (g === 'female') genderBuckets.female.push(u);
      else if (g) genderBuckets.other.push(u);
      else genderBuckets.unknown.push(u);
    }

    const likesByGender = {
      male:    { count: genderBuckets.male.length,    users: genderBuckets.male },
      female:  { count: genderBuckets.female.length,  users: genderBuckets.female },
      other:   { count: genderBuckets.other.length,   users: genderBuckets.other },
      unknown: { count: genderBuckets.unknown.length, users: genderBuckets.unknown },
    };

    // ── 3. Dislikes — users who viewed but are NOT in the likes array ─────
    const viewerDocs = await PostView.find(
      { post_id: id },
      { user_id: 1 }
    ).lean();

    const viewerIds = viewerDocs.map(v => v.user_id.toString());
    const likedSet  = new Set(likedUserIds.map(u => u.toString()));
    const dislikedIds = viewerIds.filter(uid => !likedSet.has(uid));

    const dislikedUsers = await User.find(
      { _id: { $in: dislikedIds } },
      { _id: 1, username: 1, full_name: 1, avatar_url: 1, gender: 1, location: 1 }
    ).lean();

    // Gender breakdown for dislikes too
    const dislikeGenderBuckets = { male: 0, female: 0, other: 0, unknown: 0 };
    for (const u of dislikedUsers) {
      const g = (u.gender || '').toLowerCase();
      if (g === 'male') dislikeGenderBuckets.male++;
      else if (g === 'female') dislikeGenderBuckets.female++;
      else if (g) dislikeGenderBuckets.other++;
      else dislikeGenderBuckets.unknown++;
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
      Comment.countDocuments({ post_id: id, isDeleted: false }),
      Comment.countDocuments({ post_id: id, parent_id: null, isDeleted: false }),
      Comment.countDocuments({ post_id: id, parent_id: { $ne: null }, isDeleted: false }),
    ]);

    // Recent 5 comments (top-level only)
    const recentComments = await Comment.find(
      { post_id: id, parent_id: null, isDeleted: false },
      { text: 1, 'user.username': 1, 'user.avatar_url': 1, likes_count: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // ── 5. Views — group by user location ────────────────────────────────
    // Join PostView → User to get location
    const viewsWithLocation = await PostView.aggregate([
      { $match: { post_id: new mongoose.Types.ObjectId(id) } },
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
        },
      },
      {
        $project: {
          location: '$_id',
          views: 1,
          unique_viewers: { $size: '$unique_viewers' },
          completed_views: 1,
          _id: 0,
        },
      },
      { $sort: { views: -1 } },
    ]);

    // ── 6. Build final response ───────────────────────────────────────────
    res.json({
      post_id: post._id,
      caption: post.caption,
      type: post.type,
      created_at: post.createdAt,

      likes: {
        total: likedUserIds.length,
        by_gender: likesByGender,
        user_ids: likedUserIds,           // raw ObjectId array
      },

      dislikes: {
        total: dislikedIds.length,
        by_gender: dislikesByGender,
      },

      comments: {
        total: totalComments,
        top_level: topLevelComments,
        replies: replyComments,
        recent: recentComments,
      },

      views: {
        total: post.views_count || 0,
        unique: post.unique_views_count || 0,
        completed: post.completed_views_count || 0,
        by_location: viewsWithLocation,
      },
    });
  } catch (error) {
    console.error('[PostStats]', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
