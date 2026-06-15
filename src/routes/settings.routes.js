const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const {
  getAccountSettings,
  updatePersonalInfo,
  uploadProfilePicture,
  updateContactInfo,
  sendEmailOtp,
  confirmEmailOtp,
  sendPhoneOtp,
  confirmPhoneOtp,
  getMessagingSettings,
  updateMessagingSettings,
} = require('../controllers/settings.controller');

/**
 * @swagger
 * tags:
 *   name: Settings
 *   description: Account settings — personal info, contact info, and OTP verification
 */

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT — GET
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/settings/account:
 *   get:
 *     summary: Get current user's account settings
 *     description: Returns all editable profile fields grouped into personal and contact sections.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 personal:
 *                   type: object
 *                   properties:
 *                     avatar_url:    { type: string, example: "https://cdn.example.com/uploads/users/123/profile/pic.jpg" }
 *                     full_name:     { type: string, example: "Riya Sharma" }
 *                     username:      { type: string, example: "riya_sharma" }
 *                     bio:           { type: string, example: "Loves travel and food" }
 *                     website:       { type: string, example: "https://riyasharma.in" }
 *                     date_of_birth: { type: string, format: date, nullable: true, example: "1998-05-20" }
 *                     gender:
 *                       type: string
 *                       enum: [male, female, third_gender, prefer_not_to_say, ""]
 *                       example: female
 *                     interests:
 *                       type: array
 *                       items: { type: string }
 *                       example: ["Fashion", "Travel", "Food"]
 *                     location: { type: string, example: "Mumbai, India" }
 *                 contact:
 *                   type: object
 *                   properties:
 *                     email:             { type: string, format: email, example: "riya@example.com" }
 *                     phone:             { type: string, example: "+919876543210" }
 *                     is_email_verified: { type: boolean, example: true }
 *                     is_phone_verified: { type: boolean, example: false }
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/account', auth, getAccountSettings);

// ─────────────────────────────────────────────────────────────────────────────
// PERSONAL INFORMATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/settings/account/personal:
 *   patch:
 *     summary: Update personal information
 *     description: |
 *       Updates any subset of personal profile fields.
 *       Only provided fields are updated — others are left unchanged.
 *       **Username** must be unique across the platform.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *                 example: "Riya Sharma"
 *               username:
 *                 type: string
 *                 example: "riya_sharma"
 *                 description: Must be unique. Will be saved as lowercase.
 *               bio:
 *                 type: string
 *                 example: "Loves travel and food"
 *               website:
 *                 type: string
 *                 example: "https://riyasharma.in"
 *               date_of_birth:
 *                 type: string
 *                 format: date
 *                 example: "1998-05-20"
 *                 description: ISO date string (YYYY-MM-DD)
 *               gender:
 *                 type: string
 *                 enum: [male, female, third_gender, prefer_not_to_say, ""]
 *                 example: female
 *               interests:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Fashion", "Travel", "Food"]
 *                 description: Full replacement list of interest categories
 *               location:
 *                 type: string
 *                 example: "Mumbai, India"
 *     responses:
 *       200:
 *         description: Personal information updated
 *         content:
 *           application/json:
 *             example:
 *               message: "Personal information updated"
 *               user:
 *                 avatar_url: "https://cdn.example.com/uploads/users/123/profile/pic.jpg"
 *                 full_name: "Riya Sharma"
 *                 username: "riya_sharma"
 *                 bio: "Loves travel and food"
 *                 website: "https://riyasharma.in"
 *                 date_of_birth: "1998-05-20T00:00:00.000Z"
 *                 gender: "female"
 *                 ad_interests: ["Fashion", "Travel"]
 *                 location: "Mumbai, India"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Username already taken
 *       500:
 *         description: Server error
 */
router.patch('/account/personal', auth, updatePersonalInfo);

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE PICTURE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/settings/account/avatar:
 *   post:
 *     summary: Upload or replace profile picture
 *     description: |
 *       Accepts a multipart/form-data upload with field name **`avatar`**.
 *       The image is stored in S3 and served via CloudFront.
 *       Replaces the existing profile picture URL on the user.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - avatar
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: Image file (JPEG, PNG, WebP, GIF)
 *     responses:
 *       200:
 *         description: Profile picture updated
 *         content:
 *           application/json:
 *             example:
 *               message: "Profile picture updated"
 *               avatar_url: "https://d1mqgru84n0min.cloudfront.net/uploads/users/123/profile/1781266249675.jpg"
 *       400:
 *         description: No file uploaded or unsupported format
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/account/avatar', auth, uploadProfilePicture);

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT INFORMATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/settings/account/contact:
 *   patch:
 *     summary: Update email address or mobile number
 *     description: |
 *       Updates the user's email and/or phone number.
 *       **Changing either field resets its verification status to false.**
 *       Call the corresponding `/verify-email` or `/verify-phone` endpoints afterwards.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "newemail@example.com"
 *               phone:
 *                 type: string
 *                 example: "+919876543210"
 *                 description: Provide in E.164 format or 10-digit Indian number (auto-prefixed with +91)
 *     responses:
 *       200:
 *         description: Contact information updated
 *         content:
 *           application/json:
 *             example:
 *               message: "Contact information updated. Please verify your new email/phone."
 *               contact:
 *                 email: "newemail@example.com"
 *                 phone: "+919876543210"
 *                 is_email_verified: false
 *                 is_phone_verified: false
 *       400:
 *         description: Validation error or empty values
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Email or phone already registered to another account
 *       500:
 *         description: Server error
 */
router.patch('/account/contact', auth, updateContactInfo);

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/settings/account/verify-email/send:
 *   post:
 *     summary: Send email verification OTP
 *     description: |
 *       Sends a 6-digit OTP to the user's current email address.
 *       The OTP is valid for **10 minutes**.
 *       Returns 400 if the email is already verified.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OTP sent to email
 *         content:
 *           application/json:
 *             example:
 *               message: "Verification code sent to riya@example.com"
 *       400:
 *         description: Email already verified
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to send OTP
 */
router.post('/account/verify-email/send', auth, sendEmailOtp);

/**
 * @swagger
 * /api/settings/account/verify-email/confirm:
 *   post:
 *     summary: Confirm email OTP and mark email as verified
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - otp
 *             properties:
 *               otp:
 *                 type: string
 *                 example: "482917"
 *                 description: 6-digit code received by email
 *     responses:
 *       200:
 *         description: Email verified successfully
 *         content:
 *           application/json:
 *             example:
 *               message: "Email verified successfully"
 *               is_email_verified: true
 *       400:
 *         description: Missing OTP, invalid OTP, or OTP expired
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/account/verify-email/confirm', auth, confirmEmailOtp);

// ─────────────────────────────────────────────────────────────────────────────
// PHONE VERIFICATION (AWS SNS SMS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/settings/account/verify-phone/send:
 *   post:
 *     summary: Send mobile number verification OTP via SMS
 *     description: |
 *       Sends a 6-digit OTP to the user's registered mobile number via **AWS SNS SMS**.
 *       The OTP is valid for **10 minutes**.
 *       Requires a phone number to be saved on the account first (use `PATCH /api/settings/account/contact`).
 *       Returns 400 if the phone is already verified or not set.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OTP sent via SMS
 *         content:
 *           application/json:
 *             example:
 *               message: "Verification code sent to +91*****210"
 *       400:
 *         description: Phone already verified or no phone number on account
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to send SMS OTP
 */
router.post('/account/verify-phone/send', auth, sendPhoneOtp);

/**
 * @swagger
 * /api/settings/account/verify-phone/confirm:
 *   post:
 *     summary: Confirm phone OTP and mark mobile number as verified
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - otp
 *             properties:
 *               otp:
 *                 type: string
 *                 example: "391047"
 *                 description: 6-digit code received via SMS
 *     responses:
 *       200:
 *         description: Phone number verified successfully
 *         content:
 *           application/json:
 *             example:
 *               message: "Phone number verified successfully"
 *               is_phone_verified: true
 *       400:
 *         description: Missing OTP, invalid OTP, or OTP expired
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/account/verify-phone/confirm', auth, confirmPhoneOtp);

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGING SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/settings/messaging:
 *   get:
 *     summary: Get messaging settings
 *     description: Returns the current user's messaging auto-download preferences.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Messaging settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 settings:
 *                   type: object
 *                   properties:
 *                     auto_download_images:    { type: boolean, example: true }
 *                     auto_download_videos:    { type: boolean, example: false }
 *                     auto_download_documents: { type: boolean, example: false }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/messaging', auth, getMessagingSettings);

/**
 * @swagger
 * /api/settings/messaging:
 *   patch:
 *     summary: Update messaging settings
 *     description: Updates one or more messaging auto-download preferences. Only provided fields are updated.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               auto_download_images:    { type: boolean, example: true }
 *               auto_download_videos:    { type: boolean, example: true }
 *               auto_download_documents: { type: boolean, example: false }
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Settings updated successfully"
 *               settings:
 *                 auto_download_images: true
 *                 auto_download_videos: true
 *                 auto_download_documents: false
 *       400:
 *         description: Validation error or no valid fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.patch('/messaging', auth, updateMessagingSettings);

module.exports = router;
