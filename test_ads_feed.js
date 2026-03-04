const fetch = global.fetch;

const API_URL = 'http://localhost:5000/api';
const credentials = {
  email: "bsmart@gmail.com",
  password: "Bsmart@123"
};

async function runTest() {
  try {
    console.log('--- STARTING ADS FEED TEST ---');

    // 1. Login
    console.log('1. Logging in...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    if (!loginRes.ok) {
      const err = await loginRes.json();
      throw new Error(`Login failed: ${err.message}`);
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('   Login successful.');

    // 2. Get Ads Feed
    console.log('2. Fetching Ads Feed...');
    const feedRes = await fetch(`${API_URL}/ads/feed`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const feedData = await feedRes.json();

    if (!feedRes.ok) {
      throw new Error(`Get Feed failed: ${JSON.stringify(feedData)}`);
    }

    console.log('   Feed fetched successfully!');
    console.log('   Ads count:', Array.isArray(feedData) ? feedData.length : 'Not an array');
    console.log('   Data:', JSON.stringify(feedData, null, 2).substring(0, 500) + '...');

    if (Array.isArray(feedData) && feedData.length === 0) {
      console.warn('   WARNING: Feed is empty. Ensure there are ACTIVE ads in the DB.');
    }

  } catch (error) {
    console.error('--- TEST FAILED ---');
    console.error(error.message);
  }
}

if (require.main === module) {
  runTest();
}
