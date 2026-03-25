const nodemailer = require('nodemailer');

const requiredEnvVars = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS'];

const getMissingEmailEnvVars = () =>
  requiredEnvVars.filter((key) => !process.env[key]);

const isEmailConfigured = () => getMissingEmailEnvVars().length === 0;

const transporter = isEmailConfigured()
  ? nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })
  : null;

const verifyEmailTransport = async () => {
  if (!transporter) {
    console.warn(
      `[Email] SMTP is not configured. Missing: ${getMissingEmailEnvVars().join(', ')}`
    );
    return false;
  }

  try {
    await transporter.verify();
    console.log('[Email] SMTP server is ready to send emails');
    return true;
  } catch (error) {
    console.error('[Email] SMTP connection failed:', error.message);
    return false;
  }
};

void verifyEmailTransport();

const sendEmail = async ({ to, subject, html, text }) => {
  if (!transporter) {
    throw new Error(
      `SMTP is not configured. Missing: ${getMissingEmailEnvVars().join(', ')}`
    );
  }

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'B-Smart'}" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''),
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`[Email] Sent to ${to} | MessageId: ${info.messageId}`);
  return info;
};

module.exports = {
  sendEmail,
  isEmailConfigured,
  verifyEmailTransport,
};
