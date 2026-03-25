const express = require('express');
const {
  sendOtp,
  verifyOtp,
  forgotPassword,
  resetPassword,
} = require('../controllers/email.controller');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Email
 *   description: OTP and password reset email flows
 */

/**
 * @swagger
 * /api/email/send-otp:
 *   post:
 *     summary: Send OTP for email verification or forgot-password flow
 *     tags: [Email]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - purpose
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               purpose:
 *                 type: string
 *                 enum: [verify_email, forgot_password]
 *                 example: verify_email
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: OTP sent successfully. Please check your email.
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Failed to send OTP
 */
router.post('/send-otp', sendOtp);

/**
 * @swagger
 * /api/email/verify-otp:
 *   post:
 *     summary: Verify OTP and mark email verified when applicable
 *     tags: [Email]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *               - purpose
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               otp:
 *                 type: string
 *                 example: "123456"
 *               purpose:
 *                 type: string
 *                 enum: [verify_email, forgot_password]
 *                 example: verify_email
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: OTP verified successfully.
 *                 verified:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid, expired, or incorrect OTP
 *       500:
 *         description: Server error
 */
router.post('/verify-otp', verifyOtp);

/**
 * @swagger
 * /api/email/forgot-password:
 *   post:
 *     summary: Send password reset link to the user's email
 *     tags: [Email]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Generic success response to avoid email enumeration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: If this email is registered, a reset link has been sent.
 *       400:
 *         description: Email is required
 *       500:
 *         description: Server error
 */
router.post('/forgot-password', forgotPassword);

/**
 * @swagger
 * /api/email/reset-password:
 *   post:
 *     summary: Reset password using the token sent by email
 *     tags: [Email]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *                 example: 8c3bcac7b5f5a57f60792591d39f3fd949ea4d1b5f85eef0b5e21cd85f6fd980
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 example: newStrongPassword123
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password reset successfully. You can now log in.
 *       400:
 *         description: Invalid token, expired token, or invalid new password
 *       500:
 *         description: Server error
 */
router.post('/reset-password', resetPassword);

module.exports = router;
