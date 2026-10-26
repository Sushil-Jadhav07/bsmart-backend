// Shared coin-reward logic — used by every signup path (email/password in
// auth.controller.js, and the web OAuth popup flow in config/passport.js)
// and by login, so the bonus amounts and transaction bookkeeping stay
// consistent no matter how an account was created.
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');

const REGISTRATION_BONUS_COINS = 50;
const DAILY_REWARD_COINS = 5;

// Creates this user's wallet pre-loaded with the signup bonus, and the
// matching transaction record.
const createWalletWithRegistrationBonus = async (userId) => {
  const wallet = await Wallet.create({ user_id: userId, balance: REGISTRATION_BONUS_COINS });
  await WalletTransaction.create({
    user_id: userId,
    type: 'REGISTRATION_CREDIT',
    amount: REGISTRATION_BONUS_COINS,
    description: 'Welcome bonus for joining bSmart',
    status: 'SUCCESS',
  });
  return wallet;
};

// Grants the daily login reward at most once per calendar day. Returns
// { granted, amount } so the caller can reflect it in a response.
const grantDailyRewardIfDue = async (userId) => {
  const todayStart = new Date(new Date().toDateString());
  const alreadyGranted = await WalletTransaction.exists({
    user_id: userId,
    type: 'DAILY_LOGIN_REWARD',
    createdAt: { $gte: todayStart },
  });
  if (alreadyGranted) return { granted: false, amount: 0 };

  await Wallet.updateOne({ user_id: userId }, { $inc: { balance: DAILY_REWARD_COINS } }, { upsert: true });
  await WalletTransaction.create({
    user_id: userId,
    type: 'DAILY_LOGIN_REWARD',
    amount: DAILY_REWARD_COINS,
    description: 'Daily login reward',
    status: 'SUCCESS',
  });
  return { granted: true, amount: DAILY_REWARD_COINS };
};

module.exports = {
  REGISTRATION_BONUS_COINS,
  DAILY_REWARD_COINS,
  createWalletWithRegistrationBonus,
  grantDailyRewardIfDue,
};
