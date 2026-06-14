const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { sendOtp, verifyOtp } = require('../controllers/sms.controller');

/**
 * @swagger
 * tags:
 *   name: SMS
 *   description: SMS OTP endpoints for 2FA and phone verification
 */

/**
 * @swagger
 * /api/sms/send-otp:
 *   post:
 *     summary: Send SMS OTP
 *     tags: [SMS]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - purpose
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Phone number in E.164 or 10-digit Indian format
 *                 example: "+919876543210"
 *               purpose:
 *                 type: string
 *                 enum: [two_factor, login_2fa]
 *                 example: "two_factor"
 *     responses:
 *       200:
 *         description: OTP sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "OTP sent successfully"
 *       400:
 *         description: Validation error
 *       500:
 *         description: Failed to send OTP
 */
router.post('/send-otp', auth, sendOtp);

/**
 * @swagger
 * /api/sms/verify-otp:
 *   post:
 *     summary: Verify SMS OTP
 *     tags: [SMS]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - otp
 *               - purpose
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+919876543210"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *               purpose:
 *                 type: string
 *                 enum: [two_factor, login_2fa]
 *                 example: "two_factor"
 *     responses:
 *       200:
 *         description: OTP verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 verified:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid or expired OTP
 *       500:
 *         description: Server error
 */
router.post('/verify-otp', auth, verifyOtp);

module.exports = router;
