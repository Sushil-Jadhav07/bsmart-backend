const AdEngagement = require('../models/AdEngagement');

const resolveCountry = (user) => {
  if (user?.address?.country) return String(user.address.country);
  if (user?.location && typeof user.location === 'object' && user.location.country) {
    return String(user.location.country);
  }
  return typeof user?.location === 'string' ? user.location : '';
};

async function recordAdEngagement({ ad, userId, user, action }) {
  try {
    const country = resolveCountry(user);
    const language = user?.language ? String(user.language) : '';
    const rawGender = String(user?.gender || '').toLowerCase();
    const gender = ['male', 'female', 'other'].includes(rawGender) ? rawGender : '';

    await AdEngagement.create({
      ad_id: ad._id,
      user_id: userId,
      vendor_id: ad.vendor_id,
      action_type: action,
      country,
      language,
      gender,
    });
  } catch (err) {
    console.error('[recordAdEngagement] Failed to record engagement:', err.message);
  }
}

module.exports = recordAdEngagement;
