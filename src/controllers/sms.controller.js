'use strict';

const { sendOtpSms, checkOtpSms } = require('../services/twilio.service');

const ALLOWED_PURPOSES = ['two_factor', 'login_2fa'];

/**
 * POST /api/sms/send-otp
 * Body: { phone, purpose: 'two_factor' | 'login_2fa' }
 * Twilio Verify generates and delivers the OTP — nothing stored in our DB.
 */
exports.sendOtp = async (req, res) => {
  try {
    const { phone, purpose } = req.body;

    if (!phone || !purpose) {
      return res.status(400).json({ message: 'phone and purpose are required' });
    }
    if (!ALLOWED_PURPOSES.includes(purpose)) {
      return res.status(400).json({ message: `Invalid purpose. Allowed: ${ALLOWED_PURPOSES.join(', ')}` });
    }
    if (!/^\+?\d{7,15}$/.test(String(phone).replace(/\s/g, ''))) {
      return res.status(400).json({ message: 'Invalid phone number format' });
    }

    await sendOtpSms(phone);

    res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('[SMS] sendOtp error:', err.message);
    res.status(500).json({ message: 'Failed to send OTP', error: err.message });
  }
};

/**
 * POST /api/sms/verify-otp
 * Body: { phone, otp, purpose }
 * Twilio Verify checks the code — no DB lookup needed.
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp, purpose } = req.body;

    if (!phone || !otp || !purpose) {
      return res.status(400).json({ message: 'phone, otp, and purpose are required' });
    }

    const approved = await checkOtpSms(phone, otp);

    if (!approved) {
      return res.status(400).json({ message: 'Incorrect or expired OTP. Please try again.' });
    }

    res.json({ verified: true, message: 'OTP verified successfully' });
  } catch (err) {
    console.error('[SMS] verifyOtp error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
