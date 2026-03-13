const mongoose = require('mongoose');

const runMongoTransaction = async ({ work, fallback }) => {
  const session = await mongoose.startSession();
  try {
    try {
      return await session.withTransaction(async () => work(session));
    } catch (err) {
      console.error('Transaction error:', err);
      const msg = String(err?.message || '');
      const isTxUnsupported = err?.code === 20 || msg.includes('Transaction numbers are only allowed');
      if (isTxUnsupported && typeof fallback === 'function') {
        console.log('Falling back to non-transactional operation');
        return await fallback();
      }
      throw err;
    }
  } finally {
    session.endSession();
  }
};

module.exports = runMongoTransaction;

