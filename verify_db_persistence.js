const mongoose = require('mongoose');
const User = require('./src/models/User');
const Wallet = require('./src/models/Wallet');

const API_URL = 'http://localhost:5000/api';
const MONGO_URI = 'mongodb://127.0.0.1:27017/b_smart';

async function verifyPersistence() {
  console.log('--- Starting DB Persistence Verification ---');

  // 1. Connect to Database
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const timestamp = Date.now();
  const username = `db_test_${timestamp}`;
  const email = `db_test_${timestamp}@test.com`;

  try {
    // 2. Register via API (simulating real frontend request)
    console.log(`\nRegistering user: ${username} (Role: vendor)...`);
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        email,
        password: 'password123',
        role: 'vendor'
      })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(`Registration failed: ${data.message}`);
    }
    
    const userId = data.user.id;
    console.log(`✅ API Registration Successful. User ID: ${userId}`);

    // 3. Verify User Document
    console.log('\nChecking "users" collection...');
    const userDoc = await User.findById(userId);
    if (userDoc) {
      console.log('✅ User document found in DB.');
      // Ensure wallet is NOT in user doc (it should be undefined or not present in _doc)
      if (!userDoc.toObject().wallet) {
         console.log('✅ "wallet" field is correctly MISSING from User document (Good, because it should be in its own collection).');
      } else {
         console.log('⚠️ Warning: "wallet" field found in User document. (Did you mean to separate it?)');
         console.log(userDoc.toObject().wallet);
      }
    } else {
      console.log('❌ User document NOT found!');
    }

    // 4. Verify Wallet Document
    console.log('\nChecking "wallets" collection...');
    const walletDoc = await Wallet.findOne({ user_id: userId });
    
    if (walletDoc) {
      console.log('✅ Wallet document found in DB!');
      console.log('--------------------------------------------------');
      console.log('RAW WALLET DOCUMENT FROM DB:');
      console.log(walletDoc);
      console.log('--------------------------------------------------');
      
      if (walletDoc.balance === 5000) {
        console.log('✅ Balance is correct (5000).');
      } else {
        console.log(`❌ Balance mismatch! Expected 5000, got ${walletDoc.balance}`);
      }
    } else {
      console.log('❌ Wallet document NOT found in "wallets" collection!');
    }

  } catch (error) {
    console.error('❌ Error during verification:', error);
  } finally {
    // Cleanup
    console.log('\nCleaning up...');
    if (mongoose.connection.readyState === 1) {
        // Optional: Delete the test data
        // await User.deleteOne({ email });
        // await Wallet.deleteOne({ user_id: ... });
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
  }
}

verifyPersistence();
