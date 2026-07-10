'use strict';

/**
 * Twilio Verify service — manages OTP send + check via Twilio Verify API.
 *
 * Env vars required:
 *   TWILIO_ACCOUNT_SID        – from Twilio Console dashboard (top of home page)
 *   TWILIO_AUTH_TOKEN         – from Twilio Console dashboard (top of home page)
 *   TWILIO_VERIFY_SERVICE_SID – from Verify → Services (starts with VA...)
 *
 * No phone number purchase needed — Twilio Verify sends from its own pool.
 * Docs: https://www.twilio.com/docs/verify/api
 */

const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

/**
 * Normalise any Indian or international phone to E.164.
 *   "9876543210"    → "+919876543210"
 *   "+919876543210" → "+919876543210"
 */
const toE164 = (phone) => {
  const digits = String(phone).replace(/\D/g, '');
  if (String(phone).trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
};

/**
 * Send OTP via Twilio Verify.
 * Twilio auto-generates and delivers the 6-digit code — nothing stored in our DB.
 *
 * @param {string} phone  – any format, auto-normalised
 * @returns {Promise<{ status: string, to: string }>}
 */
const sendOtpSms = async (phone) => {
  if (!SERVICE_SID) throw new Error('TWILIO_VERIFY_SERVICE_SID is not configured in .env');

  const result = await client.verify.v2
    .services(SERVICE_SID)
    .verifications.create({ to: toE164(phone), channel: 'sms' });

  return { status: result.status, to: result.to };
};

/**
 * Check OTP via Twilio Verify.
 * Returns true if approved, false if wrong/expired.
 *
 * @param {string} phone  – same number used in sendOtpSms
 * @param {string} code   – 6-digit code entered by the user
 * @returns {Promise<boolean>}
 */
const checkOtpSms = async (phone, code) => {
  if (!SERVICE_SID) throw new Error('TWILIO_VERIFY_SERVICE_SID is not configured in .env');

  const result = await client.verify.v2
    .services(SERVICE_SID)
    .verificationChecks.create({ to: toE164(phone), code: String(code) });

  return result.status === 'approved';
};

module.exports = { sendOtpSms, checkOtpSms, toE164 };
