const { sendOtpSms, checkOtpSms } = require('../services/twilio.service');
const User         = require('../models/User');
const Otp          = require('../models/Otp');
const PhoneOtp     = require('../models/PhoneOtp');
const UserSettings = require('../models/UserSettings');
const Post         = require('../models/Post');
const Tweet        = require('../models/tweet.model');
const PromoteReel  = require('../models/PromoteReel');
const Message      = require('../models/Message');
const Conversation = require('../models/Conversation');
const { sendEmail }  = require('../services/email.service');
const { otpTemplate } = require('../templates/email.templates');
const { makeUploader, getFileUrl } = require('../config/multer');

// ─── Multer uploader for profile pictures ────────────────────────────────────
const profileUploader = makeUploader('profile').single('avatar');

// ─── Helpers ─────────────────────────────────────────────────────────────────
const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const otpExpiry   = (minutes = 10) => new Date(Date.now() + minutes * 60 * 1000);

const ALLOWED_GENDERS = ['male', 'female', 'third_gender', 'prefer_not_to_say'];

const sendSmsOtp = (phone) => sendOtpSms(phone);

// ─── GET /api/settings/account ───────────────────────────────────────────────
exports.getAccountSettings = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      'avatar_url full_name username bio website date_of_birth gender ad_interests location ' +
      'email phone is_email_verified is_phone_verified'
    ).lean();

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      personal: {
        avatar_url:    user.avatar_url    || '',
        full_name:     user.full_name     || '',
        username:      user.username      || '',
        bio:           user.bio           || '',
        website:       user.website       || '',
        date_of_birth: user.date_of_birth || null,
        gender:        user.gender        || '',
        interests:     user.ad_interests  || [],
        location:      user.location      || '',
      },
      contact: {
        email:             user.email             || '',
        phone:             user.phone             || '',
        is_email_verified: user.is_email_verified ?? false,
        is_phone_verified: user.is_phone_verified ?? false,
      },
    });
  } catch (err) {
    console.error('[Settings] getAccountSettings error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── PATCH /api/settings/account/personal ────────────────────────────────────
exports.updatePersonalInfo = async (req, res) => {
  try {
    const { full_name, username, bio, website, date_of_birth, gender, interests, location } = req.body;
    const updates = {};

    if (full_name !== undefined) updates.full_name = String(full_name).trim();
    if (bio       !== undefined) updates.bio       = String(bio).trim();
    if (website   !== undefined) updates.website   = String(website).trim();
    if (location  !== undefined) updates.location  = String(location).trim();

    if (date_of_birth !== undefined) {
      const dob = new Date(date_of_birth);
      if (isNaN(dob.getTime())) {
        return res.status(400).json({ message: 'Invalid date_of_birth format (use YYYY-MM-DD)' });
      }
      updates.date_of_birth = dob;
    }

    if (gender !== undefined) {
      if (gender !== '' && !ALLOWED_GENDERS.includes(gender)) {
        return res.status(400).json({
          message: `gender must be one of: ${ALLOWED_GENDERS.join(', ')}`,
        });
      }
      updates.gender = gender;
    }

    if (interests !== undefined) {
      if (!Array.isArray(interests)) {
        return res.status(400).json({ message: 'interests must be an array' });
      }
      updates.ad_interests = interests.map(String);
    }

    if (username !== undefined) {
      const trimmed = String(username).trim().toLowerCase();
      if (!trimmed) return res.status(400).json({ message: 'username cannot be empty' });
      const conflict = await User.findOne({ username: trimmed, _id: { $ne: req.userId } }).lean();
      if (conflict) return res.status(409).json({ message: 'Username is already taken' });
      updates.username = trimmed;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('avatar_url full_name username bio website date_of_birth gender ad_interests location');

    res.json({ message: 'Personal information updated', user });
  } catch (err) {
    console.error('[Settings] updatePersonalInfo error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── POST /api/settings/account/avatar ───────────────────────────────────────
exports.uploadProfilePicture = (req, res) => {
  profileUploader(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
      const avatarUrl = getFileUrl(req, req.file);

      await User.findByIdAndUpdate(req.userId, { avatar_url: avatarUrl });

      res.json({ message: 'Profile picture updated', avatar_url: avatarUrl });
    } catch (saveErr) {
      console.error('[Settings] uploadProfilePicture save error:', saveErr.message);
      res.status(500).json({ message: 'Server error', error: saveErr.message });
    }
  });
};

// ─── PATCH /api/settings/account/contact ─────────────────────────────────────
exports.updateContactInfo = async (req, res) => {
  try {
    const { email, phone } = req.body;
    const updates = {};
    const cleared = {};

    if (email !== undefined) {
      const trimmed = String(email).trim().toLowerCase();
      if (!trimmed) return res.status(400).json({ message: 'email cannot be empty' });
      const conflict = await User.findOne({ email: trimmed, _id: { $ne: req.userId } }).lean();
      if (conflict) return res.status(409).json({ message: 'Email is already registered' });
      updates.email = trimmed;
      cleared.is_email_verified = false; // changing email resets verification
    }

    if (phone !== undefined) {
      const trimmed = String(phone).trim();
      if (!trimmed) return res.status(400).json({ message: 'phone cannot be empty' });
      const conflict = await User.findOne({ phone: trimmed, _id: { $ne: req.userId } }).lean();
      if (conflict) return res.status(409).json({ message: 'Phone number is already registered' });
      updates.phone = trimmed;
      cleared.is_phone_verified = false; // changing phone resets verification
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'Provide email or phone to update' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: { ...updates, ...cleared } },
      { new: true }
    ).select('email phone is_email_verified is_phone_verified');

    res.json({
      message: 'Contact information updated. Please verify your new email/phone.',
      contact: {
        email:             user.email,
        phone:             user.phone,
        is_email_verified: user.is_email_verified,
        is_phone_verified: user.is_phone_verified,
      },
    });
  } catch (err) {
    console.error('[Settings] updateContactInfo error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── POST /api/settings/account/verify-email/send ────────────────────────────
exports.sendEmailOtp = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('email full_name is_email_verified').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.is_email_verified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    // Delete any old pending OTPs for this email + purpose
    await Otp.deleteMany({ email: user.email.toLowerCase(), purpose: 'verify_email' });

    const otp = generateOtp();
    await Otp.create({
      email:     user.email.toLowerCase(),
      otp,
      purpose:   'verify_email',
      expiresAt: otpExpiry(10),
    });

    await sendEmail({
      to:      user.email,
      subject: 'Verify your B-Smart email address',
      html:    otpTemplate({
        full_name:        user.full_name || '',
        otp,
        purpose:          'verify_email',
        expiresInMinutes: 10,
      }),
    });

    res.json({ message: `Verification code sent to ${user.email}` });
  } catch (err) {
    console.error('[Settings] sendEmailOtp error:', err.message);
    res.status(500).json({ message: 'Failed to send OTP', error: err.message });
  }
};

// ─── POST /api/settings/account/verify-email/confirm ─────────────────────────
exports.confirmEmailOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: 'otp is required' });

    const user = await User.findById(req.userId).select('email is_email_verified').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.is_email_verified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    const record = await Otp.findOne({
      email:   user.email.toLowerCase(),
      purpose: 'verify_email',
      used:    false,
    });

    if (!record) {
      return res.status(400).json({ message: 'No pending OTP found. Please request a new one.' });
    }
    if (new Date() > record.expiresAt) {
      await record.deleteOne();
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }
    if (record.otp !== String(otp)) {
      return res.status(400).json({ message: 'Incorrect OTP. Please try again.' });
    }

    record.used = true;
    await record.save();

    await User.findByIdAndUpdate(req.userId, { is_email_verified: true });

    res.json({ message: 'Email verified successfully', is_email_verified: true });
  } catch (err) {
    console.error('[Settings] confirmEmailOtp error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── POST /api/settings/account/verify-phone/send ────────────────────────────
exports.sendPhoneOtp = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('phone is_phone_verified').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.phone) {
      return res.status(400).json({ message: 'No phone number on your account. Add one first under Contact Information.' });
    }
    if (user.is_phone_verified) {
      return res.status(400).json({ message: 'Phone number is already verified' });
    }

    await sendSmsOtp(user.phone);

    const masked = user.phone.replace(/(\d{2})\d+(\d{3})/, '$1*****$2');
    res.json({ message: `Verification code sent to ${masked}` });
  } catch (err) {
    console.error('[Settings] sendPhoneOtp error:', err.message);
    res.status(500).json({ message: 'Failed to send SMS OTP', error: err.message });
  }
};

// ─── GET /api/settings/messaging ─────────────────────────────────────────────
exports.getMessagingSettings = async (req, res) => {
  try {
    const doc = await UserSettings.findOne({ user_id: req.userId }).lean();
    const messaging = doc?.messaging ?? {
      auto_download_images:    true,
      auto_download_videos:    false,
      auto_download_documents: false,
    };
    res.json({ success: true, settings: messaging });
  } catch (err) {
    console.error('[Settings] getMessagingSettings error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── PATCH /api/settings/messaging ───────────────────────────────────────────
exports.updateMessagingSettings = async (req, res) => {
  try {
    const { auto_download_images, auto_download_videos, auto_download_documents } = req.body;
    const updates = {};

    if (auto_download_images !== undefined) {
      if (typeof auto_download_images !== 'boolean') {
        return res.status(400).json({ message: 'auto_download_images must be a boolean' });
      }
      updates['messaging.auto_download_images'] = auto_download_images;
    }
    if (auto_download_videos !== undefined) {
      if (typeof auto_download_videos !== 'boolean') {
        return res.status(400).json({ message: 'auto_download_videos must be a boolean' });
      }
      updates['messaging.auto_download_videos'] = auto_download_videos;
    }
    if (auto_download_documents !== undefined) {
      if (typeof auto_download_documents !== 'boolean') {
        return res.status(400).json({ message: 'auto_download_documents must be a boolean' });
      }
      updates['messaging.auto_download_documents'] = auto_download_documents;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    const doc = await UserSettings.findOneAndUpdate(
      { user_id: req.userId },
      { $set: updates },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    res.json({ success: true, message: 'Settings updated successfully', settings: doc.messaging });
  } catch (err) {
    console.error('[Settings] updateMessagingSettings error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── POST /api/settings/account/verify-phone/confirm ─────────────────────────
exports.confirmPhoneOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: 'otp is required' });

    const user = await User.findById(req.userId).select('phone is_phone_verified').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.is_phone_verified) {
      return res.status(400).json({ message: 'Phone number is already verified' });
    }

    const approved = await checkOtpSms(user.phone, otp);
    if (!approved) {
      return res.status(400).json({ message: 'Incorrect or expired OTP. Please try again.' });
    }

    await User.findByIdAndUpdate(req.userId, { is_phone_verified: true });

    res.json({ message: 'Phone number verified successfully', is_phone_verified: true });
  } catch (err) {
    console.error('[Settings] confirmPhoneOtp error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── Notification Settings ──────────────────────────────────────────────────

const NOTIFICATION_FIELDS = [
  'push_notifications',
  'likes',
  'comments',
  'replies',
  'mentions',
  'tags',
  'shares',
  'new_followers',
  'follow_requests',
  'new_messages',
  'message_requests',
];

const DEFAULT_NOTIFICATION_SETTINGS = Object.fromEntries(
  NOTIFICATION_FIELDS.map((f) => [f, true])
);

exports.getNotificationSettings = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('notification_settings')
      .lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const saved = user.notification_settings || {};
    const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...saved };

    res.json(settings);
  } catch (err) {
    console.error('[Settings] getNotificationSettings error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateNotificationSettings = async (req, res) => {
  try {
    const updates = {};
    for (const field of NOTIFICATION_FIELDS) {
      if (typeof req.body[field] === 'boolean') {
        updates[`notification_settings.${field}`] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid notification fields provided' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true }
    ).select('notification_settings').lean();

    if (!user) return res.status(404).json({ message: 'User not found' });

    const saved = user.notification_settings || {};
    const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...saved };

    res.json(settings);
  } catch (err) {
    console.error('[Settings] updateNotificationSettings error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── Data & Privacy ──────────────────────────────────────────────────────────

// ─── DELETE /api/settings/account/clear-content ──────────────────────────────
// Does NOT delete the account — soft-deletes every post, reel, tweet, and
// promote reel the user created, and clears their chat data (their own sent
// messages, and hides every conversation from their own view).
exports.clearMyContent = async (req, res) => {
  try {
    const userId = req.userId;
    const now = new Date();

    const [posts, tweets, promoteReels, messages, conversations] = await Promise.all([
      Post.updateMany(
        { user_id: userId, isDeleted: false },
        { $set: { isDeleted: true } }
      ),
      Tweet.updateMany(
        { author: userId, isDeleted: false },
        { $set: { isDeleted: true } }
      ),
      PromoteReel.updateMany(
        { user_id: userId, isDeleted: false },
        { $set: { isDeleted: true, deletedBy: userId, deletedAt: now } }
      ),
      Message.updateMany(
        { sender: userId, isDeleted: false },
        { $set: { isDeleted: true, deletedAt: now } }
      ),
      Conversation.updateMany(
        { participants: userId },
        { $addToSet: { deletedFor: userId } }
      ),
    ]);

    res.json({
      success: true,
      message: 'All your posts, reels, tweets, promote reels and chat data have been removed. Your account remains active.',
      removed: {
        posts_and_reels:      posts.modifiedCount,
        tweets:                tweets.modifiedCount,
        promote_reels:         promoteReels.modifiedCount,
        messages:              messages.modifiedCount,
        conversations_hidden:  conversations.modifiedCount,
      },
    });
  } catch (err) {
    console.error('[Settings] clearMyContent error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── CSV helpers ──────────────────────────────────────────────────────────────
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
function csvRow(fields) {
  return fields.map(csvEscape).join(',') + '\r\n';
}

// ─── GET /api/settings/account/export ────────────────────────────────────────
// Downloads a CSV of the current user's profile info plus every post/reel,
// tweet, and promote reel they created, each with its likes/comments counts.
exports.downloadMyData = async (req, res) => {
  try {
    const userId = req.userId;

    const [user, posts, tweets, promoteReels] = await Promise.all([
      User.findById(userId)
        .select('full_name username email phone bio gender date_of_birth location website createdAt')
        .lean(),
      Post.find({ user_id: userId })
        .select('type caption likes_count comments_count isDeleted createdAt')
        .sort({ createdAt: -1 })
        .lean(),
      Tweet.find({ author: userId })
        .select('content likesCount commentsCount repostsCount isDeleted createdAt')
        .sort({ createdAt: -1 })
        .lean(),
      PromoteReel.find({ user_id: userId })
        .select('caption likes_count comments_count isDeleted createdAt')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    if (!user) return res.status(404).json({ message: 'User not found' });

    let csv = '';

    csv += '=== PROFILE ===\r\n';
    csv += csvRow(['field', 'value']);
    csv += csvRow(['Full Name', user.full_name]);
    csv += csvRow(['Username', user.username]);
    csv += csvRow(['Email', user.email]);
    csv += csvRow(['Phone', user.phone]);
    csv += csvRow(['Bio', user.bio]);
    csv += csvRow(['Gender', user.gender]);
    csv += csvRow(['Date of Birth', user.date_of_birth ? new Date(user.date_of_birth).toISOString().slice(0, 10) : '']);
    csv += csvRow(['Location', user.location]);
    csv += csvRow(['Website', user.website]);
    csv += csvRow(['Account Created', user.createdAt ? user.createdAt.toISOString() : '']);
    csv += '\r\n';

    csv += '=== POSTS & REELS ===\r\n';
    csv += csvRow(['id', 'type', 'caption', 'likes_count', 'comments_count', 'is_deleted', 'created_at']);
    posts.forEach((p) => {
      csv += csvRow([p._id, p.type, p.caption, p.likes_count, p.comments_count, p.isDeleted, p.createdAt?.toISOString()]);
    });
    csv += '\r\n';

    csv += '=== TWEETS ===\r\n';
    csv += csvRow(['id', 'content', 'likes_count', 'comments_count', 'reposts_count', 'is_deleted', 'created_at']);
    tweets.forEach((t) => {
      csv += csvRow([t._id, t.content, t.likesCount, t.commentsCount, t.repostsCount, t.isDeleted, t.createdAt?.toISOString()]);
    });
    csv += '\r\n';

    csv += '=== PROMOTE REELS ===\r\n';
    csv += csvRow(['id', 'caption', 'likes_count', 'comments_count', 'is_deleted', 'created_at']);
    promoteReels.forEach((r) => {
      csv += csvRow([r._id, r.caption, r.likes_count, r.comments_count, r.isDeleted, r.createdAt?.toISOString()]);
    });

    const filename = `bsmart-data-export-${userId}-${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch (err) {
    console.error('[Settings] downloadMyData error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
