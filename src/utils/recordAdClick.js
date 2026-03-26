const AdClick = require('../models/AdClick');

const FRAUD_THRESHOLD = parseInt(process.env.CLICK_FRAUD_THRESHOLD, 10) || 5;
const ONE_HOUR_MS = 60 * 60 * 1000;

const resolveCountry = (user) => {
  if (user?.address?.country) return String(user.address.country);
  if (user?.location && typeof user.location === 'object' && user.location.country) {
    return String(user.location.country);
  }
  return typeof user?.location === 'string' ? user.location : '';
};

async function recordAdClick({ ad, userId, user, coinsSpent = 0 }) {
  try {
    const existingClick = await AdClick.findOne({ ad_id: ad._id, user_id: userId })
      .select('_id')
      .lean();
    const is_unique = !existingClick;

    const recentCount = await AdClick.countDocuments({
      ad_id: ad._id,
      user_id: userId,
      createdAt: { $gte: new Date(Date.now() - ONE_HOUR_MS) },
    });
    const is_invalid = recentCount >= FRAUD_THRESHOLD;

    const country = resolveCountry(user);
    const language = user?.language ? String(user.language) : '';
    const rawGender = String(user?.gender || '').toLowerCase();
    const gender = ['male', 'female', 'other'].includes(rawGender) ? rawGender : '';
    const viewer_name = String(user?.full_name || user?.username || '');
    const viewer_username = String(user?.username || '');

    const clickDoc = await AdClick.create({
      ad_id: ad._id,
      user_id: userId,
      viewer_name,
      viewer_username,
      vendor_id: ad.vendor_id,
      is_unique,
      is_invalid,
      coins_spent: Number(coinsSpent) || 0,
      country,
      language,
      gender,
    });
    return {
      _id: clickDoc._id,
      ad_id: clickDoc.ad_id,
      user_id: clickDoc.user_id,
      vendor_id: clickDoc.vendor_id,
      is_unique: clickDoc.is_unique,
      is_invalid: clickDoc.is_invalid,
      coins_spent: clickDoc.coins_spent,
      country: clickDoc.country,
      language: clickDoc.language,
      gender: clickDoc.gender,
      created_at: clickDoc.createdAt,
    };
  } catch (err) {
    console.error('[recordAdClick] Failed to record click:', err.message);
    return null;
  }
}

module.exports = recordAdClick;
