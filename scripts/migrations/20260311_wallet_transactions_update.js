const mongoose = require('mongoose');
const WalletTransaction = require('../../src/models/WalletTransaction');
const Ad = require('../../src/models/Ad');

const MONGO_URI = process.env.MONGO_URI;

const run = async () => {
  if (!MONGO_URI) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(MONGO_URI);

  await WalletTransaction.updateMany(
    { description: { $exists: false } },
    { $set: { description: '' } }
  );

  const debitTypes = [
    'AD_VIEW_DEDUCTION',
    'AD_LIKE_DEDUCTION',
    'AD_COMMENT_DEDUCTION',
    'AD_REPLY_DEDUCTION',
    'AD_SAVE_DEDUCTION',
    'AD_BUDGET_DEDUCTION'
  ];

  await WalletTransaction.updateMany(
    { type: { $in: debitTypes }, amount: { $gt: 0 } },
    [{ $set: { amount: { $multiply: ['$amount', -1] } } }]
  );

  try {
    await WalletTransaction.collection.dropIndex('user_id_1_ad_id_1_type_1');
  } catch (e) {
    if (e && e.codeName !== 'IndexNotFound') {
      throw e;
    }
  }

  await WalletTransaction.collection.createIndex(
    { user_id: 1, ad_id: 1, type: 1 },
    {
      unique: true,
      name: 'user_id_1_ad_id_1_type_1',
      partialFilterExpression: {
        ad_id: { $type: 'objectId' },
        type: {
          $in: [
            'AD_VIEW_REWARD',
            'AD_VIEW_DEDUCTION',
            'AD_BUDGET_DEDUCTION',
            'AD_COMMENT_REWARD',
            'AD_COMMENT_DEDUCTION',
            'AD_REPLY_REWARD',
            'AD_REPLY_DEDUCTION',
            'AD_SAVE_REWARD',
            'AD_SAVE_DEDUCTION'
          ]
        }
      }
    }
  );

  const cursor = WalletTransaction.find({ ad_id: { $type: 'objectId' }, vendor_id: { $exists: false } })
    .select('_id ad_id')
    .cursor();

  for await (const tx of cursor) {
    const ad = await Ad.findById(tx.ad_id).select('vendor_id').lean();
    if (ad?.vendor_id) {
      await WalletTransaction.updateOne({ _id: tx._id }, { $set: { vendor_id: ad.vendor_id } });
    }
  }

  await mongoose.disconnect();
};

run().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
