const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { updateMyProfile, getMyAdTransactions, getMyAdTransactions: getMyTransactionsQuery } = require('../controllers/member.v1.controller');

/**
 * PATCH /api/v1/member/profile
 * body: { gender: "male|female|other", address: { street, city, state, zip, country } }
 */
router.patch('/profile', auth, requireRole('member'), updateMyProfile);
router.put('/profile', auth, requireRole('member'), updateMyProfile);

/**
 * GET /api/v1/member/ads/:adId/transactions
 */
router.get('/ads/:adId/transactions', auth, requireRole('member'), getMyAdTransactions);

/**
 * GET /api/v1/member/transactions?adId=...
 */
router.get('/transactions', auth, requireRole('member'), getMyTransactionsQuery);

module.exports = router;

