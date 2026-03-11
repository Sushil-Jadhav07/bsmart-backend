const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getVendorTransactions } = require('../controllers/member.v1.controller');

/**
 * GET /api/v1/vendor/transactions?userId=...&adId=...
 */
router.get('/transactions', auth, getVendorTransactions);

module.exports = router;

