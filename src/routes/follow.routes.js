const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const { followUser, unfollowUser, getFollowers, getFollowing } = require('../controllers/follow.controller');

router.post('/follow', verifyToken, followUser);
router.post('/unfollow', verifyToken, unfollowUser);
router.get('/users/:id/followers', getFollowers);
router.get('/users/:id/following', getFollowing);

module.exports = router;
