const express = require('express');
const router = express.Router();
const { register, login, googleLogin, getMe, changePassword } = require('../controllers/auth.controller');
const { getAllUsers } = require('../controllers/user.controller');
const auth = require('../middleware/auth');
const passport = require('passport');
const jwt = require('jsonwebtoken');

// Swagger documentation...
/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication management
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - username
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               username:
 *                 type: string
 *               full_name:
 *                 type: string
 *               phone:
 *                 type: string
 *               gender:
 *                 type: string
 *                 description: Member gender (only when role is member)
 *               location:
 *                 type: string
 *                 description: Member location (only when role is member)
 *               role:
 *                 type: string
 *                 enum: [member, vendor, admin]
 *                 default: member
 *                 description: User role
 *               company_details:
 *                 type: object
 *                 description: Required when role is vendor (ignore for member/admin)
 *                 properties:
 *                   company_name:
 *                     type: string
 *                   "Registered Name":
 *                     type: string
 *                   industry:
 *                     type: string
 *                   "Registration Number":
 *                     type: string
 *                   "Tax ID / VAT / GST":
 *                     type: string
 *                   "Year Established":
 *                     type: string
 *                   "Company Type":
 *                     type: string
 *               credits:
 *                 type: number
 *                 description: Optional wallet credits for vendor, valid for 1 year
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *             examples:
 *               member:
 *                 value:
 *                   token: "jwt_token_here"
 *                   user:
 *                     id: "60f1b2c3d4e5f67890123456"
 *                     email: "member@example.com"
 *                     username: "member123"
 *                     full_name: "Member Name"
 *                     avatar_url: ""
 *                     phone: "+911234567890"
 *                     gender: "male"
 *                     location: "Mumbai, India"
 *                     role: "member"
 *                     followers_count: 0
 *                     following_count: 0
 *                     wallet:
 *                       balance: 0
 *                       currency: "Coins"
 *       400:
 *         description: User already exists or invalid role
 *       500:
 *         description: Server error
 */
router.post('/register', register);

/**
 * @swagger
 * /api/auth/google/token:
 *   post:
 *     summary: Login or Register with Google ID Token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id_token
 *             properties:
 *               id_token:
 *                 type: string
 *                 description: Google ID Token
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     username:
 *                       type: string
 *                     full_name:
 *                       type: string
 *                     avatar_url:
 *                       type: string
 *                     gender:
 *                       type: string
 *                       example: ""
 *                     location:
 *                       type: string
 *                       example: ""
 *                     role:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Invalid Google token
 *       500:
 *         description: Server error
 */
router.post('/google/token', googleLogin);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid credentials
 *       500:
 *         description: Server error
 */
router.post('/login', login);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/me', auth, getMe);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change user password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *               user_id:
 *                 type: string
 *                 description: Optional user ID to change password for (if not provided, uses logged-in user)
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Invalid password or new password too short
 *       404:
 *         description: User not found
 */
router.post('/change-password', auth, changePassword);

/**
 * @swagger
 * /api/auth/users:
 *   get:
 *     summary: Get all users with their posts, comments and likes
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users with embedded posts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserWithPosts'
 *       500:
 *         description: Server error
 */
router.get('/users', auth, getAllUsers);

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Initiate Google Authentication
 *     description: Redirects user to Google login page. NOTE - This cannot be tested directly in Swagger UI as it causes a redirect. Open in browser.
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Redirects to Google
 */
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Google Authentication Callback
 *     description: Handle callback from Google. Redirects to frontend with token.
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         description: Authorization code from Google
 *     responses:
 *       302:
 *         description: Redirects to frontend with JWT token
 *       401:
 *         description: Authentication failed
 */
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    // Generate token
    const token = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, {
      expiresIn: '30d',
    });

    // Redirect to client with token
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}/auth/google/success?token=${token}`);
  }
);

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated id of the user
 *         username:
 *           type: string
 *         email:
 *           type: string
 *         full_name:
 *           type: string
 *         avatar_url:
 *           type: string
 *         phone:
 *           type: string
 *         gender:
 *           type: string
 *           description: User gender (male, female, other, or empty string)
 *           example: "male"
 *         location:
 *           type: string
 *           description: User location city or country
 *           example: "Mumbai, India"
 *         role:
 *           type: string
 *           enum: [member, vendor, admin]
 *         validated:
 *           type: boolean
 *           description: Vendor validation status (true if vendor is validated; false otherwise)
 *         vendor_id:
 *           type: string
 *           description: The ID of the vendor profile if the user is a vendor
 *         wallet:
 *           type: object
 *           properties:
 *             balance:
 *               type: number
 *             currency:
 *               type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     UserWithPosts:
 *       allOf:
 *         - $ref: '#/components/schemas/User'
 *         - type: object
 *           properties:
 *             posts:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Post'
 */

module.exports = router;
