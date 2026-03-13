
const mongoose = require('mongoose');
const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Models
const User = require('./src/models/User');
const Vendor = require('./src/models/Vendor');
const Ad = require('./src/models/Ad');
const Wallet = require('./src/models/Wallet');
const WalletTransaction = require('./src/models/WalletTransaction');
const AdView = require('./src/models/AdView');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/myapp';
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const BASE_URL = 'http://localhost:5000/api';

const testRunId = `test_run_${Date.now()}`;

async function setup() {
  console.log('--- Setting up test data ---');
  await mongoose.connect(MONGO_URI);

  // 1. Create Vendor User + Vendor document
  const vendorUser = await User.create({
    username: `vendor_${testRunId}`,
    email: `vendor_${testRunId}@test.com`,
    password: 'password123',
    role: 'vendor',
    testRunId
  });

  const vendor = await Vendor.create({
    user_id: vendorUser._id,
    business_name: `Business ${testRunId}`,
    validated: true,
    testRunId
  });

  // 2. Create Member Users
  const member1User = await User.create({
    username: `member1_${testRunId}`,
    email: `member1_${testRunId}@test.com`,
    password: 'password123',
    role: 'member',
    testRunId
  });

  const member2User = await User.create({
    username: `member2_${testRunId}`,
    email: `member2_${testRunId}@test.com`,
    password: 'password123',
    role: 'member',
    testRunId
  });

  // 3. Create Wallets
  await Wallet.create({ user_id: vendorUser._id, balance: 1000, testRunId });
  await Wallet.create({ user_id: member1User._id, balance: 0, testRunId });
  await Wallet.create({ user_id: member2User._id, balance: 0, testRunId });

  // 4. Create an active Ad
  const ad = await Ad.create({
    user_id: vendorUser._id,
    vendor_id: vendor._id,
    status: 'active',
    total_budget_coins: 500,
    coins_reward: 0, // Should fallback to 10
    category: 'Retail',
    media: [{ fileName: 'test.jpg', fileUrl: 'test.jpg', media_type: 'image' }],
    testRunId
  });

  console.log('Test data created successfully.\n');

  return {
    vendorUser,
    vendor,
    member1User,
    member2User,
    ad
  };
}

async function cleanup(data) {
  console.log('\n--- Cleaning up test data ---');
  if (data) {
    const { vendorUser, member1User, member2User, ad } = data;
    const userIds = [vendorUser._id, member1User._id, member2User._id];

    await User.deleteMany({ _id: { $in: userIds } });
    await Vendor.deleteMany({ user_id: vendorUser._id });
    await Ad.deleteMany({ _id: ad._id });
    await Wallet.deleteMany({ user_id: { $in: userIds } });
    await WalletTransaction.deleteMany({ ad_id: ad._id });
    await AdView.deleteMany({ ad_id: ad._id });
  } else {
    // Fallback if setup failed partially
    await User.deleteMany({ username: { $regex: testRunId } });
    await Vendor.deleteMany({ business_name: { $regex: testRunId } });
  }
  console.log('Cleanup complete.');
}

async function runTests() {
  let data;
  try {
    data = await setup();
  } catch (err) {
    console.error('Setup failed:', err);
    process.exit(1);
  }

  const { member1User, member2User, vendorUser, ad } = data;

  const token1 = jwt.sign({ id: member1User._id, role: member1User.role }, JWT_SECRET, { expiresIn: '1h' });
  const token2 = jwt.sign({ id: member2User._id, role: member2User.role }, JWT_SECRET, { expiresIn: '1h' });

  const api = axios.create({
    baseURL: BASE_URL,
    timeout: 5000
  });

  let passedCount = 0;
  const totalTests = 7;

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  try {
    // TEST 1: Member1 views ad
    console.log('Running TEST 1: Member1 views ad...');
    await api.post(`/ads/${ad._id}/view`, {}, { headers: { Authorization: `Bearer ${token1}` } });
    await sleep(200);

    const m1Wallet = await Wallet.findOne({ user_id: member1User._id });
    const vWallet1 = await Wallet.findOne({ user_id: vendorUser._id });

    if (m1Wallet.balance === 10) {
      console.log('✅ TEST 1 PASSED: Member1 wallet went from 0 to 10');
      passedCount++;
    } else {
      console.log(`❌ TEST 1 FAILED: Member1 wallet | Expected: 10 Got: ${m1Wallet.balance}`);
    }

    if (vWallet1.balance === 990) {
      console.log('✅ TEST 1.1 PASSED: Vendor wallet went from 1000 to 990');
    } else {
      console.log(`❌ TEST 1.1 FAILED: Vendor wallet | Expected: 990 Got: ${vWallet1.balance}`);
    }

    // TEST 2: Member1 views same ad again
    console.log('\nRunning TEST 2: Member1 views same ad again...');
    try {
      await api.post(`/ads/${ad._id}/view`, {}, { headers: { Authorization: `Bearer ${token1}` } });
    } catch (err) {
      // It might return 400 Already Rewarded, which is fine for idempotency check
    }
    await sleep(200);

    const m1WalletAgain = await Wallet.findOne({ user_id: member1User._id });
    if (m1WalletAgain.balance === 10) {
      console.log('✅ TEST 2 PASSED: Member1 wallet stays at 10 (no double reward)');
      passedCount++;
    } else {
      console.log(`❌ TEST 2 FAILED: Member1 wallet | Expected: 10 Got: ${m1WalletAgain.balance}`);
    }

    // TEST 3: Member2 views same ad
    console.log('\nRunning TEST 3: Member2 views same ad...');
    await api.post(`/ads/${ad._id}/view`, {}, { headers: { Authorization: `Bearer ${token2}` } });
    await sleep(200);

    const m2Wallet = await Wallet.findOne({ user_id: member2User._id });
    const vWallet2 = await Wallet.findOne({ user_id: vendorUser._id });

    if (m2Wallet.balance === 10 && vWallet2.balance === 980) {
      console.log('✅ TEST 3 PASSED: Member2 rewarded, Vendor balance updated');
      passedCount++;
    } else {
      console.log(`❌ TEST 3 FAILED: Member2 balance: ${m2Wallet.balance} (Exp: 10), Vendor balance: ${vWallet2.balance} (Exp: 980)`);
    }

    // TEST 4: AdView for member1 has rewarded=true, coins_rewarded=10
    console.log('\nRunning TEST 4: Verifying AdView for member1...');
    const adView1 = await AdView.findOne({ ad_id: ad._id, user_id: member1User._id });
    if (adView1 && adView1.rewarded === true && adView1.coins_rewarded === 10) {
      console.log('✅ TEST 4 PASSED: AdView rewarded=true, coins_rewarded=10');
      passedCount++;
    } else {
      console.log(`❌ TEST 4 FAILED: AdView | rewarded: ${adView1?.rewarded}, coins_rewarded: ${adView1?.coins_rewarded}`);
    }

    // TEST 5: WalletTransaction AD_VIEW_REWARD exists for member1
    console.log('\nRunning TEST 5: Verifying WalletTransaction AD_VIEW_REWARD for member1...');
    const txReward = await WalletTransaction.findOne({ user_id: member1User._id, ad_id: ad._id, type: 'AD_VIEW_REWARD' });
    if (txReward && txReward.amount === 10) {
      console.log('✅ TEST 5 PASSED: AD_VIEW_REWARD transaction found');
      passedCount++;
    } else {
      console.log(`❌ TEST 5 FAILED: AD_VIEW_REWARD transaction not found or amount mismatch`);
    }

    // TEST 6: WalletTransaction AD_VIEW_DEDUCTION exists for vendor
    console.log('\nRunning TEST 6: Verifying WalletTransaction AD_VIEW_DEDUCTION for vendor...');
    const txDeductions = await WalletTransaction.find({ user_id: vendorUser._id, ad_id: ad._id, type: 'AD_VIEW_DEDUCTION' });
    if (txDeductions.length === 2) {
      console.log('✅ TEST 6 PASSED: 2 AD_VIEW_DEDUCTION transactions found for vendor');
      passedCount++;
    } else {
      console.log(`❌ TEST 6 FAILED: Expected 2 deductions, found ${txDeductions.length}`);
    }

    // TEST 7: Ad.total_coins_spent should be 20
    console.log('\nRunning TEST 7: Verifying Ad.total_coins_spent...');
    const finalAd = await Ad.findById(ad._id);
    if (finalAd.total_coins_spent === 20) {
      console.log('✅ TEST 7 PASSED: Ad.total_coins_spent is 20');
      passedCount++;
    } else {
      console.log(`❌ TEST 7 FAILED: Ad.total_coins_spent | Expected: 20 Got: ${finalAd.total_coins_spent}`);
    }

  } catch (err) {
    console.error('An error occurred during tests:', err.response ? err.response.data : err.message);
  } finally {
    console.log(`\nSummary: ${passedCount}/${totalTests} tests passed`);

    // Final cleanup
    await cleanup(data);

    await mongoose.connection.close();
  }
}

runTests();
