const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Otp = require('../models/Otp');
const { sendEmail } = require('../services/email.service');
const {
  welcomeMemberTemplate,
  welcomeVendorTemplate,
  otpTemplate,
  forgotPasswordTemplate,
  passwordChangedTemplate,
  vendorApprovedTemplate,
  vendorRejectedTemplate,
  packagePurchasedTemplate,
  adApprovedTemplate,
  adRejectedTemplate,
  coinsLowTemplate,
  newVendorAlertTemplate,
  newAdPendingTemplate,
  customSendEmailTemplate,
} = require('../templates/email.templates');

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const otpExpiry = (minutes = 10) => new Date(Date.now() + minutes * 60 * 1000);

const fireAndForget = (label, promise) => {
  promise.catch((err) => console.error(`[Email] ${label} failed:`, err.message));
};

const sendWelcomeEmail = async (user) => {
  try {
    const isVendor = user.role === 'vendor';
    await sendEmail({
      to: user.email,
      subject: isVendor
        ? `Welcome to B-Smart, ${user.company_details?.company_name || user.full_name || user.username}!`
        : `Welcome to B-Smart, ${user.full_name || user.username}!`,
      html: isVendor
        ? welcomeVendorTemplate({
            full_name: user.full_name,
            company_name: user.company_details?.company_name,
          })
        : welcomeMemberTemplate({
            full_name: user.full_name,
            username: user.username,
          }),
    });
  } catch (err) {
    console.error('[Email] Welcome email failed:', err.message);
  }
};

const sendVendorApprovedEmail = async ({ email, full_name, company_name }) => {
  try {
    await sendEmail({
      to: email,
      subject: 'Your B-Smart vendor account is approved',
      html: vendorApprovedTemplate({ full_name, company_name }),
    });
  } catch (err) {
    console.error('[Email] Vendor approved email failed:', err.message);
  }
};

const sendVendorRejectedEmail = async ({ email, full_name, company_name, reason }) => {
  try {
    await sendEmail({
      to: email,
      subject: 'Update on your B-Smart vendor application',
      html: vendorRejectedTemplate({ full_name, company_name, reason }),
    });
  } catch (err) {
    console.error('[Email] Vendor rejected email failed:', err.message);
  }
};

const sendPackagePurchasedEmail = async ({
  email,
  full_name,
  company_name,
  package_name,
  tier,
  final_price,
  coins_granted,
  validity_days,
  expires_at,
}) => {
  try {
    await sendEmail({
      to: email,
      subject: `Receipt: ${package_name} package purchased on B-Smart`,
      html: packagePurchasedTemplate({
        full_name,
        company_name,
        package_name,
        tier,
        final_price,
        coins_granted,
        validity_days,
        expires_at,
      }),
    });
  } catch (err) {
    console.error('[Email] Package purchased email failed:', err.message);
  }
};

const sendAdApprovedEmail = async ({ email, full_name, ad_caption, ad_id }) => {
  try {
    await sendEmail({
      to: email,
      subject: 'Your B-Smart ad is now live',
      html: adApprovedTemplate({ full_name, ad_caption, ad_id }),
    });
  } catch (err) {
    console.error('[Email] Ad approved email failed:', err.message);
  }
};

const sendAdRejectedEmail = async ({ email, full_name, ad_caption, ad_id, reason }) => {
  try {
    await sendEmail({
      to: email,
      subject: 'Your B-Smart ad requires changes',
      html: adRejectedTemplate({ full_name, ad_caption, ad_id, reason }),
    });
  } catch (err) {
    console.error('[Email] Ad rejected email failed:', err.message);
  }
};

const sendCoinsLowEmail = async ({ email, full_name, current_balance, threshold }) => {
  try {
    await sendEmail({
      to: email,
      subject: 'Your B-Smart coin balance is running low',
      html: coinsLowTemplate({ full_name, current_balance, threshold }),
    });
  } catch (err) {
    console.error('[Email] Coins low email failed:', err.message);
  }
};

const sendNewVendorAlert = async ({ adminEmail, company_name, email, registered_at }) => {
  try {
    await sendEmail({
      to: adminEmail,
      subject: `[Admin] New vendor registered: ${company_name}`,
      html: newVendorAlertTemplate({ company_name, email, registered_at }),
    });
  } catch (err) {
    console.error('[Email] New vendor admin alert failed:', err.message);
  }
};

const sendNewAdPendingAlert = async ({ adminEmail, vendor_name, ad_caption, submitted_at }) => {
  try {
    await sendEmail({
      to: adminEmail,
      subject: `[Admin] New ad pending review from ${vendor_name}`,
      html: newAdPendingTemplate({ vendor_name, ad_caption, submitted_at }),
    });
  } catch (err) {
    console.error('[Email] New ad pending admin alert failed:', err.message);
  }
};

exports.sendOtp = async (req, res) => {
  try {
    const { email, purpose } = req.body;

    if (!email || !purpose) {
      return res.status(400).json({ message: 'email and purpose are required' });
    }

    if (!['verify_email', 'forgot_password', 'two_factor'].includes(purpose)) {
      return res.status(400).json({ message: 'purpose must be verify_email, forgot_password or two_factor' });
    }

    if (purpose === 'forgot_password') {
      const exists = await User.findOne({ email: email.toLowerCase() });
      if (!exists) {
        return res.json({ message: 'If this email is registered, an OTP has been sent.' });
      }
    }

    await Otp.deleteMany({ email: email.toLowerCase(), purpose });

    const otp = generateOtp();
    await Otp.create({ email: email.toLowerCase(), otp, purpose, expiresAt: otpExpiry(10) });

    const user = await User.findOne({ email: email.toLowerCase() }).select('full_name');

    await sendEmail({
      to: email,
      subject:
        purpose === 'verify_email'
          ? 'Your B-Smart email verification code'
          : purpose === 'two_factor'
          ? 'Your B-Smart login verification code'
          : 'Your B-Smart password reset OTP',
      html: otpTemplate({
        full_name: user?.full_name || '',
        otp,
        purpose,
        expiresInMinutes: 10,
      }),
    });

    return res.json({ message: 'OTP sent successfully. Please check your email.' });
  } catch (err) {
    console.error('[Email] sendOtp error:', err);
    return res.status(500).json({ message: 'Failed to send OTP', error: err.message });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;

    if (!email || !otp || !purpose) {
      return res.status(400).json({ message: 'email, otp and purpose are required' });
    }

    const record = await Otp.findOne({ email: email.toLowerCase(), purpose, used: false });

    if (!record) {
      return res.status(400).json({ message: 'Invalid or expired OTP. Please request a new one.' });
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

    if (purpose === 'verify_email') {
      await User.findOneAndUpdate({ email: email.toLowerCase() }, { is_email_verified: true });
    }

    return res.json({ message: 'OTP verified successfully.', verified: true });
  } catch (err) {
    console.error('[Email] verifyOtp error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({ message: 'If this email is registered, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.password_reset_token = hashedToken;
    user.password_reset_expires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const resetLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;

    await sendEmail({
      to: user.email,
      subject: 'Reset your B-Smart password',
      html: forgotPasswordTemplate({ full_name: user.full_name, resetLink }),
    });

    return res.json({ message: 'If this email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('[Email] forgotPassword error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'token and newPassword are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      password_reset_token: hashedToken,
      password_reset_expires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset link. Please request a new one.' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.password_reset_token = undefined;
    user.password_reset_expires = undefined;
    await user.save();

    fireAndForget(
      'Password changed email',
      sendEmail({
        to: user.email,
        subject: 'Your B-Smart password was changed',
        html: passwordChangedTemplate({ full_name: user.full_name }),
      })
    );

    return res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('[Email] resetPassword error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.sendCustomEmail = async (req, res) => {
  try {
    const { to, subject, message, html } = req.body;

    if (!to || !subject || (!message && !html)) {
      return res.status(400).json({
        message: 'to, subject and either message or html are required',
      });
    }

    const senderName =
      req.user?.full_name ||
      req.user?.username ||
      req.user?.email ||
      'B-Smart User';

    const emailHtml = customSendEmailTemplate({
      subject,
      senderName,
      message,
      html,
    });

    await sendEmail({
      to,
      subject,
      html: emailHtml,
      text: message,
    });

    return res.json({ message: 'Email sent successfully' });
  } catch (err) {
    console.error('[Email] sendCustomEmail error:', err);
    return res.status(500).json({ message: 'Failed to send email', error: err.message });
  }
};

module.exports.sendWelcomeEmail = sendWelcomeEmail;
module.exports.sendVendorApprovedEmail = sendVendorApprovedEmail;
module.exports.sendVendorRejectedEmail = sendVendorRejectedEmail;
module.exports.sendPackagePurchasedEmail = sendPackagePurchasedEmail;
module.exports.sendAdApprovedEmail = sendAdApprovedEmail;
module.exports.sendAdRejectedEmail = sendAdRejectedEmail;
module.exports.sendCoinsLowEmail = sendCoinsLowEmail;
module.exports.sendNewVendorAlert = sendNewVendorAlert;
module.exports.sendNewAdPendingAlert = sendNewAdPendingAlert;
