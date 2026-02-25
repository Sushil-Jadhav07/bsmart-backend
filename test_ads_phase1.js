const fetch = global.fetch;

const API_URL = 'http://localhost:5000/api';
let vendorToken = '';
let userToken = '';
let adminToken = '';
let vendorId = '';
let adId = '';
let vendorUserId = '';

// Test Data
const timestamp = Date.now();
const vendorUser = {
  username: `vendor_${timestamp}`,
  email: `vendor_${timestamp}@test.com`,
  password: 'password123',
  full_name: 'Test Vendor User'
};

const regularUser = {
  username: `user_${timestamp}`,
  email: `user_${timestamp}@test.com`,
  password: 'password123',
  full_name: 'Test Regular User'
};

async function runPhase1() {
  try {
    console.log('--- PHASE 1: REGISTRATION ---');

    // 1. Register Vendor User
    console.log('1. Registering Vendor User...');
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vendorUser)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Registration failed');
      
      vendorToken = data.token;
      vendorUserId = data.user.id;
      console.log('   Vendor User Registered. ID:', vendorUserId);
      console.log('   Token:', vendorToken);
    } catch (e) {
      console.error('   Failed to register vendor user:', e.message);
      return;
    }

    // 2. Create Vendor Profile (Apply as Vendor)
    console.log('2. Creating Vendor Profile...');
    try {
      const res = await fetch(`${API_URL}/vendors`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${vendorToken}`
        },
        body: JSON.stringify({
          business_name: `Biz_${timestamp}`,
          business_type: 'Retail',
          description: 'Test Vendor Business',
          phone: '1234567890',
          address: '123 Test St',
          website: 'https://test.com'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Vendor creation failed');
      
      console.log('   Vendor Profile Created. Status:', data.status || 'pending');
    } catch (e) {
      console.error('   Failed to create vendor profile:', e.message);
      return;
    }

    // 3. Register Regular User (Viewer)
    console.log('3. Registering Regular User...');
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regularUser)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'User registration failed');
      
      userToken = data.token;
      console.log('   Regular User Registered.');
      console.log('   Token:', userToken);
    } catch (e) {
      console.error('   Failed to register regular user:', e.message);
      return;
    }

    console.log('\n--- PAUSED FOR MANUAL VALIDATION ---');
    console.log(`Please go to your Admin Dashboard and VALIDATE the vendor:`);
    console.log(`Username: ${vendorUser.username}`);
    console.log(`Email: ${vendorUser.email}`);
    console.log(`Business: Biz_${timestamp}`);
    console.log('\nOnce validated, tell me to "continue" to proceed with Phase 2 (Ad Creation & Testing).');

    // Save tokens to a temp file for Phase 2
    const fs = require('fs');
    fs.writeFileSync('test_tokens.json', JSON.stringify({ 
      vendorToken, 
      userToken, 
      vendorUser,
      regularUser
    }, null, 2));

  } catch (error) {
    console.error('Unexpected error in Phase 1:', error.message);
  }
}

// Check if run directly
if (require.main === module) {
  runPhase1();
}

module.exports = { vendorUser, regularUser, runPhase1 };
