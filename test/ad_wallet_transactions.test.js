const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const User = require('../src/models/User');
const Vendor = require('../src/models/Vendor');
const Wallet = require('../src/models/Wallet');
const WalletTransaction = require('../src/models/WalletTransaction');
const Ad = require('../src/models/Ad');
const Notification = require('../src/models/notification.model');

const { createAd, likeAd, dislikeAd } = require('../src/controllers/ad.controller');
const { getAdWalletHistory } = require('../src/controllers/wallet.controller');

const makeRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

const makeAppStub = () => ({
  get: () => null
});

const getMongoUri = () => process.env.MONGO_URI_TEST || process.env.MONGO_URI || '';

test('wallet transactions for ad create/like/dislike', async (t) => {
  const uri = getMongoUri();
  if (!uri) {
    t.skip('MONGO_URI_TEST or MONGO_URI is not set');
    return;
  }

  const dbName = `test_${Date.now()}`;
  await mongoose.connect(uri, { dbName });

  t.after(async () => {
    await mongoose.disconnect();
  });

  await Promise.all([
    User.deleteMany({}),
    Vendor.deleteMany({}),
    Wallet.deleteMany({}),
    WalletTransaction.deleteMany({}),
    Ad.deleteMany({}),
    Notification.deleteMany({})
  ]);

  const vendorUser = await User.create({
    email: 'vendor@test.com',
    password: 'hashed',
    username: 'vendor1',
    role: 'vendor',
    gender: '',
    location: ''
  });

  const memberUser = await User.create({
    email: 'member@test.com',
    password: 'hashed',
    username: 'member1',
    role: 'member',
    gender: 'male',
    location: 'Mumbai'
  });

  const memberUser2 = await User.create({
    email: 'member2@test.com',
    password: 'hashed',
    username: 'member2',
    role: 'member',
    gender: 'female',
    location: 'Pune'
  });

  const vendor = await Vendor.create({
    user_id: vendorUser._id,
    business_name: 'Shop',
    validated: true,
    profile_completion_percentage: 30
  });

  await Wallet.create({ user_id: vendorUser._id, balance: 1000, currency: 'Coins' });
  await Wallet.create({ user_id: memberUser._id, balance: 0, currency: 'Coins' });
  await Wallet.create({ user_id: memberUser2._id, balance: 0, currency: 'Coins' });

  const createReq = {
    userId: vendorUser._id.toString(),
    protocol: 'http',
    get: () => 'localhost:5000',
    body: {
      caption: 'Ad 1',
      location: 'Delhi',
      category: 'Retail',
      media: [{ fileName: 'file.jpg', fileUrl: 'file.jpg', media_type: 'image', thumbnails: [] }],
      total_budget_coins: 200
    }
  };
  const createRes = makeRes();
  await createAd(createReq, createRes);

  assert.equal(createRes.statusCode, 201);
  assert.ok(createRes.body && createRes.body._id);

  const ad = await Ad.findById(createRes.body._id).lean();
  assert.equal(ad.total_budget_coins, 200);
  assert.equal(ad.total_coins_spent, 0);
  assert.equal(String(ad.vendor_id), String(vendor._id));

  const vendorWalletAfterCreate = await Wallet.findOne({ user_id: vendorUser._id }).lean();
  assert.equal(vendorWalletAfterCreate.balance, 800);

  const budgetTx = await WalletTransaction.findOne({ ad_id: ad._id, type: 'AD_BUDGET_DEDUCTION' }).lean();
  assert.ok(budgetTx);
  assert.equal(String(budgetTx.user_id), String(vendorUser._id));
  assert.equal(String(budgetTx.vendor_id), String(vendor._id));
  assert.equal(budgetTx.amount, -200);

  const vendorSelfLikeReq = {
    params: { id: ad._id.toString() },
    userId: vendorUser._id.toString(),
    user: vendorUser,
    body: { user: { id: vendorUser._id.toString() } },
    app: makeAppStub()
  };
  const vendorSelfLikeRes = makeRes();
  await likeAd(vendorSelfLikeReq, vendorSelfLikeRes);
  assert.equal(vendorSelfLikeRes.statusCode, 200);
  assert.equal(vendorSelfLikeRes.body.is_liked, true);
  assert.equal(vendorSelfLikeRes.body.coins_earned, 0);

  const adAfterVendorSelfLike = await Ad.findById(ad._id).lean();
  assert.equal(adAfterVendorSelfLike.total_coins_spent, 0);
  assert.ok(adAfterVendorSelfLike.likes.some((id) => id.toString() === vendorUser._id.toString()));

  const vendorWalletAfterSelfLike = await Wallet.findOne({ user_id: vendorUser._id }).lean();
  assert.equal(vendorWalletAfterSelfLike.balance, 800);

  const member2DislikeWithoutLikeReq = {
    params: { id: ad._id.toString() },
    userId: memberUser2._id.toString(),
    user: memberUser2,
    body: { user: { id: memberUser2._id.toString() } },
    app: makeAppStub()
  };
  const member2DislikeWithoutLikeRes = makeRes();
  await dislikeAd(member2DislikeWithoutLikeReq, member2DislikeWithoutLikeRes);
  assert.equal(member2DislikeWithoutLikeRes.statusCode, 400);

  const likeReq = {
    params: { id: ad._id.toString() },
    userId: memberUser._id.toString(),
    user: memberUser,
    body: { user: { id: memberUser._id.toString() } },
    app: makeAppStub()
  };
  const likeRes = makeRes();
  await likeAd(likeReq, likeRes);
  assert.equal(likeRes.statusCode, 200);
  assert.equal(likeRes.body.is_liked, true);
  assert.equal(likeRes.body.coins_earned, 10);

  const likeAgainRes = makeRes();
  await likeAd(likeReq, likeAgainRes);
  assert.equal(likeAgainRes.statusCode, 409);

  const memberWalletAfterLike = await Wallet.findOne({ user_id: memberUser._id }).lean();
  assert.equal(memberWalletAfterLike.balance, 10);

  const adAfterLike = await Ad.findById(ad._id).lean();
  assert.equal(adAfterLike.total_coins_spent, 10);
  assert.ok(adAfterLike.likes.some((id) => id.toString() === memberUser._id.toString()));

  const likeUserTx = await WalletTransaction.findOne({ ad_id: ad._id, user_id: memberUser._id, type: 'AD_LIKE_REWARD' }).lean();
  const likeVendorTx = await WalletTransaction.findOne({ ad_id: ad._id, user_id: vendorUser._id, type: 'AD_LIKE_DEDUCTION' }).lean();
  assert.ok(likeUserTx);
  assert.ok(likeVendorTx);
  assert.equal(likeUserTx.amount, 10);
  assert.equal(likeVendorTx.amount, -10);

  const dislikeReq = {
    params: { id: ad._id.toString() },
    userId: memberUser._id.toString(),
    user: memberUser,
    body: { user: { id: memberUser._id.toString() } },
    app: makeAppStub()
  };
  const dislikeRes = makeRes();
  await dislikeAd(dislikeReq, dislikeRes);
  assert.equal(dislikeRes.statusCode, 200);

  const memberWalletAfterDislike = await Wallet.findOne({ user_id: memberUser._id }).lean();
  assert.equal(memberWalletAfterDislike.balance, 0);

  const adAfterDislike = await Ad.findById(ad._id).lean();
  assert.equal(adAfterDislike.total_coins_spent, 0);
  assert.ok(!adAfterDislike.likes.some((id) => id.toString() === memberUser._id.toString()));
  assert.ok(adAfterDislike.likes.some((id) => id.toString() === vendorUser._id.toString()));

  const vendorWalletAfterMemberDislike = await Wallet.findOne({ user_id: vendorUser._id }).lean();
  assert.equal(vendorWalletAfterMemberDislike.balance, 800);

  const reversalUserTx = await WalletTransaction.findOne({ ad_id: ad._id, user_id: memberUser._id, type: 'AD_LIKE_REWARD_REVERSAL' }).lean();
  const refundVendorTx = await WalletTransaction.findOne({ ad_id: ad._id, user_id: vendorUser._id, type: 'AD_LIKE_BUDGET_REFUND' }).lean();
  assert.ok(reversalUserTx);
  assert.ok(refundVendorTx);
  assert.equal(reversalUserTx.amount, -10);
  assert.equal(refundVendorTx.amount, 10);

  const historyReq = {
    params: { adId: ad._id.toString() },
    query: {},
    user: vendorUser
  };
  const historyRes = makeRes();
  await getAdWalletHistory(historyReq, historyRes);
  assert.equal(historyRes.statusCode, 200);
  assert.equal(historyRes.body.ad._id, ad._id.toString());
  assert.ok(Array.isArray(historyRes.body.transactions));
});

