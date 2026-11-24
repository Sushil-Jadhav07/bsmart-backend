const Post = require('../models/Post');
const Comment = require('../models/Comment');
const PostView = require('../models/PostView');
const User = require('../models/User');
const mongoose = require('mongoose');

// ─── URL Helper (copied from post.controller.js's resolveMediaUrl, same
// R2/CloudFront precedence rules — kept local per this codebase's convention
// of per-controller copies rather than a shared import) ────────────────────
const resolveMediaUrl = (fileName, fileUrl, baseUrl) => {
  const cloudfront = (process.env.R2_PUBLIC_BASE_URL || process.env.CLOUDFRONT_BASE_URL)
    ? (process.env.R2_PUBLIC_BASE_URL || process.env.CLOUDFRONT_BASE_URL).replace(/\/+$/, '')
    : null;

  if (fileUrl && fileUrl.startsWith('http')) {
    if (cloudfront && fileUrl.includes('api.bebsmart.in/uploads/')) {
      return fileUrl.replace(/https?:\/\/api\.bebsmart\.in\/uploads\//, `${cloudfront}/uploads/`);
    }
    return fileUrl;
  }

  if (fileName) {
    if (fileName.startsWith('uploads/') || fileName.startsWith('/uploads/')) {
      const key = fileName.replace(/^\/+/, '');
      if (cloudfront) return `${cloudfront}/${key}`;
      return `${baseUrl}/${key}`;
    }
    if (cloudfront) return `${cloudfront}/uploads/${fileName}`;
    return `${baseUrl}/uploads/${fileName}`;
  }

  if (fileUrl) {
    if (fileUrl.startsWith('/')) return `${baseUrl}${fileUrl}`;
    return `${baseUrl}/${fileUrl}`;
  }

  return '';
};

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
    // Insights (who liked/viewed, their age/gender/location) are private to
    // the post's own author — this previously had no ownership check at all.
    if (post.user_id.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to view this post’s insights' });
    }

    // ── 2. Likes — populate users who liked, group by gender ─────────────
    const likedUserIds = post.likes || [];

    const likedUsers = await User.find(
      { _id: { $in: likedUserIds } },
      { _id: 1, username: 1, full_name: 1, avatar_url: 1, gender: 1, location: 1, age: 1 }
    ).lean();

    const getAgeGroup = (age) => {
      if (age === undefined || age === null || age === '') return 'Unknown';
      const a = Number(age);
      if (isNaN(a)) return 'Unknown';
      if (a <= 12) return 'Child (0–12 years)';
      if (a <= 19) return 'Teen (13–19 years)';
      if (a <= 39) return 'Adult (20–39 years)';
      if (a <= 59) return 'Middle Age (40–59 years)';
      return 'Senior (60+ years)';
    };

    // Build gender and age buckets
    const genderBuckets = { male: [], female: [], other: [], unknown: [] };
    const likeAgeBuckets = {
      'Child (0–12 years)': 0,
      'Teen (13–19 years)': 0,
      'Adult (20–39 years)': 0,
      'Middle Age (40–59 years)': 0,
      'Senior (60+ years)': 0,
      Unknown: 0,
    };

    for (const u of likedUsers) {
      const g = (u.gender || '').toLowerCase();
      if (g === 'male') genderBuckets.male.push(u);
      else if (g === 'female') genderBuckets.female.push(u);
      else if (g) genderBuckets.other.push(u);
      else genderBuckets.unknown.push(u);

      const ageGroup = getAgeGroup(u.age);
      likeAgeBuckets[ageGroup]++;
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
      { _id: 1, username: 1, full_name: 1, avatar_url: 1, gender: 1, location: 1, age: 1 }
    ).lean();

    // Gender and age breakdown for dislikes too
    const dislikeGenderBuckets = { male: 0, female: 0, other: 0, unknown: 0 };
    const dislikeAgeBuckets = {
      'Child (0–12 years)': 0,
      'Teen (13–19 years)': 0,
      'Adult (20–39 years)': 0,
      'Middle Age (40–59 years)': 0,
      'Senior (60+ years)': 0,
      Unknown: 0,
    };

    for (const u of dislikedUsers) {
      const g = (u.gender || '').toLowerCase();
      if (g === 'male') dislikeGenderBuckets.male++;
      else if (g === 'female') dislikeGenderBuckets.female++;
      else if (g) dislikeGenderBuckets.other++;
      else dislikeGenderBuckets.unknown++;

      const ageGroup = getAgeGroup(u.age);
      dislikeAgeBuckets[ageGroup]++;
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
    const viewStats = await PostView.aggregate([
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
        $facet: {
          byLocation: [
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
          ],
          byAge: [
            {
              $project: {
                age: '$user.age',
                view_count: '$view_count',
              },
            },
            {
              $addFields: {
                ageGroup: {
                  $switch: {
                    branches: [
                        { case: { $lte: ['$age', 12] }, then: 'Child (0–12 years)' },
                        { case: { $lte: ['$age', 19] }, then: 'Teen (13–19 years)' },
                        { case: { $lte: ['$age', 39] }, then: 'Adult (20–39 years)' },
                        { case: { $lte: ['$age', 59] }, then: 'Middle Age (40–59 years)' },
                        { case: { $gte: ['$age', 60] }, then: 'Senior (60+ years)' },
                      ],
                    default: 'Unknown',
                  },
                },
              },
            },
            {
              $group: {
                _id: '$ageGroup',
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    const viewsWithLocation = viewStats[0].byLocation || [];
    const viewsByAgeRaw = viewStats[0].byAge || [];
    const viewsByAge = {
      'Child (0–12 years)': 0,
      'Teen (13–19 years)': 0,
      'Adult (20–39 years)': 0,
      'Middle Age (40–59 years)': 0,
      'Senior (60+ years)': 0,
      Unknown: 0,
    };
    viewsByAgeRaw.forEach((item) => {
      viewsByAge[item._id] = item.count;
    });

    // ── 5b. Retention curve — only meaningful for reels (PostView only
    // tracks reel views). Each viewer's watch_fraction is the max point they
    // reached; retained_pct at each decile = % of viewers who got at least
    // that far — a real, honest curve, not fabricated.
    const deciles = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const toCurve = (fractions) => {
      const total = fractions.length;
      return deciles.map((d) => ({
        percent: Math.round(d * 100),
        retained_pct: total
          ? Math.round((fractions.filter((f) => (f.watch_fraction || 0) >= d).length / total) * 100)
          : 0,
      }));
    };

    let retentionCurve = [];
    let platformAvgRetentionCurve = [];
    if (post.type === 'reel') {
      const fractions = await PostView.find({ post_id: id }, { watch_fraction: 1 }).lean();
      retentionCurve = toCurve(fractions);

      // Platform-wide baseline — a real average across other reels' viewers
      // (sampled, not every view ever, to keep this one request cheap), so
      // "your reel vs. the platform" is an honest comparison, never invented.
      const platformFractions = await PostView.aggregate([
        { $lookup: { from: 'posts', localField: 'post_id', foreignField: '_id', as: 'post' } },
        { $unwind: '$post' },
        { $match: { 'post.type': 'reel', post_id: { $ne: new mongoose.Types.ObjectId(id) } } },
        { $project: { watch_fraction: 1 } },
        { $sample: { size: 5000 } },
      ]);
      if (platformFractions.length) {
        platformAvgRetentionCurve = toCurve(platformFractions);
      }
    }

    // ── 5c. Thumbnail — reuse the same R2/CloudFront resolution the main
    // feed uses, so the insights page can show the actual content next to
    // its stats instead of a blank header.
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const firstMedia = Array.isArray(post.media) ? post.media[0] : null;
    let thumbnailUrl = '';
    if (firstMedia) {
      if (firstMedia.thumbnail && firstMedia.thumbnail.fileName) {
        thumbnailUrl = resolveMediaUrl(firstMedia.thumbnail.fileName, null, baseUrl);
      } else if (Array.isArray(firstMedia.thumbnails) && firstMedia.thumbnails[0]?.fileName) {
        thumbnailUrl = resolveMediaUrl(firstMedia.thumbnails[0].fileName, null, baseUrl);
      } else {
        thumbnailUrl = resolveMediaUrl(firstMedia.fileName, firstMedia.fileUrl, baseUrl);
      }
    }

    // ── 6. Build final response ───────────────────────────────────────────
    res.json({
      post_id: post._id,
      caption: post.caption,
      type: post.type,
      created_at: post.createdAt,
      thumbnail_url: thumbnailUrl,

      likes: {
        total: likedUserIds.length,
        by_gender: likesByGender,
        by_age: likeAgeBuckets,
        user_ids: likedUserIds,           // raw ObjectId array
      },

      dislikes: {
        total: dislikedIds.length,
        by_gender: dislikesByGender,
        by_age: dislikeAgeBuckets,
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
        by_age: viewsByAge,
      },

      // Empty array for non-reel posts — there's no per-viewer watch-progress
      // tracking for images, so no curve can honestly be drawn for them.
      retention_curve: retentionCurve,
      // Empty when there isn't yet a meaningful platform sample — never
      // filled with a guessed number.
      platform_avg_retention_curve: platformAvgRetentionCurve,
    });
  } catch (error) {
    console.error('[PostStats]', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
