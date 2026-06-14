const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const PhoneOtp = require('../models/PhoneOtp');

const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const ALLOWED_PURPOSES = ['two_factor', 'login_2fa'];

const toE164 = (phone) => {
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
};

const sendSmsOtp = async (phone, otp) => {
  const command = new PublishCommand({
    PhoneNumber: toE164(phone),
    Message: `Your B-Smart verification code is: ${otp}. Valid for 10 minutes. Do not share it.`,
    MessageAttributes: {
      'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
    },
  });
  await snsClient.send(command);
};

/**
 * POST /api/sms/send-otp
 * Body: { phone, purpose: 'two_factor' | 'login_2fa' }
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
    if (!/^\+?\d{7,15}$/.test(phone.replace(/\s/g, ''))) {
      return res.status(400).json({ message: 'Invalid phone number format' });
    }

    await PhoneOtp.deleteMany({ user_id: req.userId, phone });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expires_at = new Date(Date.now() + 10 * 60 * 1000);

    await PhoneOtp.create({ user_id: req.userId, phone, otp, expires_at });
    await sendSmsOtp(phone, otp);

    res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('[SMS] sendOtp error:', err.message);
    res.status(500).json({ message: 'Failed to send OTP', error: err.message });
  }
};

/**
 * POST /api/sms/verify-otp
 * Body: { phone, otp, purpose }
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp, purpose } = req.body;

    if (!phone || !otp || !purpose) {
      return res.status(400).json({ message: 'phone, otp, and purpose are required' });
    }

    const record = await PhoneOtp.findOne({ user_id: req.userId, phone, used: false })
      .sort({ createdAt: -1 });

    if (!record) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    if (new Date() > record.expires_at) {
      await record.deleteOne();
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    if (record.otp !== String(otp)) {
      return res.status(400).json({ message: 'Incorrect OTP. Please try again.' });
    }

    record.used = true;
    await record.save();

    res.json({ verified: true, message: 'OTP verified successfully' });
  } catch (err) {
    console.error('[SMS] verifyOtp error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
