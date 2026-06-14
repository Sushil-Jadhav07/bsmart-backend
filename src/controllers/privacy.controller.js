const User = require('../models/User');

const VISIBILITY_VALUES = ['everyone', 'followers_only', 'nobody'];
const VISIBILITY_FIELDS = ['profile', 'posts', 'stories', 'pulse', 'followers_list', 'following_list'];

// ─── GET /api/privacy ─────────────────────────────────────────────────────────
exports.getPrivacySettings = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('privacy').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const defaults = defaultPrivacy();
    res.json(mergeDefaults(defaults, user.privacy || {}));
  } catch (err) {
    console.error('[Privacy] getPrivacySettings error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── PATCH /api/privacy/profile-visibility ────────────────────────────────────
exports.updateProfileVisibility = async (req, res) => {
  try {
    const updates = {};
    for (const field of VISIBILITY_FIELDS) {
      if (req.body[field] !== undefined) {
        if (!VISIBILITY_VALUES.includes(req.body[field])) {
          return res.status(400).json({
            message: `"${field}" must be one of: ${VISIBILITY_VALUES.join(', ')}`,
          });
        }
        updates[`privacy.profile_visibility.${field}`] = req.body[field];
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true }
    ).select('privacy.profile_visibility').lean();

    res.json({ message: 'Profile visibility updated', profile_visibility: user.privacy.profile_visibility });
  } catch (err) {
    console.error('[Privacy] updateProfileVisibility error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── PATCH /api/privacy/activity-status ──────────────────────────────────────
exports.updateActivityStatus = async (req, res) => {
  try {
    const { show_online_status, show_last_seen, show_read_receipts } = req.body;
    const updates = {};

    if (show_online_status  !== undefined) updates['privacy.activity_status.show_online_status']  = !!show_online_status;
    if (show_last_seen      !== undefined) updates['privacy.activity_status.show_last_seen']      = !!show_last_seen;
    if (show_read_receipts  !== undefined) updates['privacy.activity_status.show_read_receipts']  = !!show_read_receipts;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true }
    ).select('privacy.activity_status').lean();

    res.json({ message: 'Activity status updated', activity_status: user.privacy.activity_status });
  } catch (err) {
    console.error('[Privacy] updateActivityStatus error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── PATCH /api/privacy/follow-settings ──────────────────────────────────────
exports.updateFollowSettings = async (req, res) => {
  try {
    const { allow_follow_requests, auto_approve_follow_requests } = req.body;
    const updates = {};

    if (allow_follow_requests        !== undefined) updates['privacy.follow_settings.allow_follow_requests']        = !!allow_follow_requests;
    if (auto_approve_follow_requests !== undefined) updates['privacy.follow_settings.auto_approve_follow_requests'] = !!auto_approve_follow_requests;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true }
    ).select('privacy.follow_settings').lean();

    res.json({ message: 'Follow settings updated', follow_settings: user.privacy.follow_settings });
  } catch (err) {
    console.error('[Privacy] updateFollowSettings error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── PATCH /api/privacy/messaging ────────────────────────────────────────────
exports.updateMessagingPrivacy = async (req, res) => {
  try {
    const { messaging_privacy } = req.body;
    if (!messaging_privacy) return res.status(400).json({ message: 'messaging_privacy is required' });
    if (!VISIBILITY_VALUES.includes(messaging_privacy)) {
      return res.status(400).json({ message: `messaging_privacy must be one of: ${VISIBILITY_VALUES.join(', ')}` });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: { 'privacy.messaging_privacy': messaging_privacy } },
      { new: true }
    ).select('privacy.messaging_privacy').lean();

    res.json({ message: 'Messaging privacy updated', messaging_privacy: user.privacy.messaging_privacy });
  } catch (err) {
    console.error('[Privacy] updateMessagingPrivacy error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── PATCH /api/privacy/search-discovery ─────────────────────────────────────
exports.updateSearchDiscovery = async (req, res) => {
  try {
    const { allow_search_by_username, allow_search_by_email, allow_search_by_phone, appear_in_suggestions } = req.body;
    const updates = {};

    if (allow_search_by_username !== undefined) updates['privacy.search_discovery.allow_search_by_username'] = !!allow_search_by_username;
    if (allow_search_by_email    !== undefined) updates['privacy.search_discovery.allow_search_by_email']    = !!allow_search_by_email;
    if (allow_search_by_phone    !== undefined) updates['privacy.search_discovery.allow_search_by_phone']    = !!allow_search_by_phone;
    if (appear_in_suggestions    !== undefined) updates['privacy.search_discovery.appear_in_suggestions']    = !!appear_in_suggestions;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true }
    ).select('privacy.search_discovery').lean();

    res.json({ message: 'Search & discovery settings updated', search_discovery: user.privacy.search_discovery });
  } catch (err) {
    console.error('[Privacy] updateSearchDiscovery error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function defaultPrivacy() {
  return {
    profile_visibility: {
      profile: 'everyone', posts: 'everyone', stories: 'everyone',
      pulse: 'everyone', followers_list: 'everyone', following_list: 'everyone',
    },
    activity_status: { show_online_status: true, show_last_seen: true, show_read_receipts: true },
    follow_settings: { allow_follow_requests: true, auto_approve_follow_requests: false },
    messaging_privacy: 'everyone',
    search_discovery: {
      allow_search_by_username: true, allow_search_by_email: true,
      allow_search_by_phone: true, appear_in_suggestions: true,
    },
  };
}

function mergeDefaults(defaults, stored) {
  const result = {};
  for (const key of Object.keys(defaults)) {
    if (stored[key] !== null && typeof stored[key] === 'object' && !Array.isArray(stored[key])) {
      result[key] = { ...defaults[key], ...stored[key] };
    } else {
      result[key] = stored[key] !== undefined ? stored[key] : defaults[key];
    }
  }
  return result;
}
