const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { createVendor, getMyVendor, getVendorByUserId } = require('../controllers/vendor.controller');

router.post('/', auth, createVendor);
router.get('/me', auth, getMyVendor);
router.get('/users/:id', getVendorByUserId);

module.exports = router;
