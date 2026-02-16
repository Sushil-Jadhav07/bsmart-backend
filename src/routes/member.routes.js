const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getMyMember, getMemberByUserId } = require('../controllers/member.controller');

router.get('/me', auth, getMyMember);
router.get('/users/:id', getMemberByUserId);

module.exports = router;
