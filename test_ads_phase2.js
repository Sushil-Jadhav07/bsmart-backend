const fetch = global.fetch;
const fs = require('fs');

const API_URL = 'http://localhost:5000/api';

// Load tokens from Phase 1
let tokens = {};
try {
  const data = fs.readFileSync('test_tokens.json', 'utf8');
  tokens = JSON.parse(data);
} catch (e) {
  console.error('Failed to load test_tokens.json. Did you run Phase 1?');
  process.exit(1);
}

const { vendorToken, userToken, vendorUser } = tokens;
let adId = '';
let adminToken = ''; // We will use vendorToken as adminToken for simplicity if we can't login as admin easily, 
// BUT the prompt says "login as vendor i will validate it then test with ads vendors also".
// Actually, to APPROVE the ad we need an ADMIN token.
// Since I cannot interactively login as admin, I will assume the user has validated the vendor.
// To approve the ad, I need an admin token.
// Let's try to login with a known admin if possible, OR register a new user and try to use them.
// HOWEVER, without admin credentials, I cannot approve the ad via API.
// workaround: I will ask you to approve the ad manually too, OR I can try to direct DB update if I had access (I don't have direct DB access here except via code).
// Wait, I can create a temporary script to update the ad status to 'active' directly in DB?
// No, I should use the API.
// Let's proceed with creating the ad first.

async function runPhase2() {
  try {
    console.log('--- PHASE 2: AD LIFECYCLE ---');

    // 1. Create Ad (as Vendor)
    console.log('1. Creating Ad (as Vendor)...');
    try {
      const res = await fetch(`${API_URL}/ads`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${vendorToken}`
        },
        body: JSON.stringify({
          title: 'Test Ad Campaign',
          description: 'This is a test ad',
          video_fileName: 'test_video.mp4',
          video_url: 'http://example.com/video.mp4',
          thumbnail_fileName: 'thumb.jpg',
          thumbnail_url: 'http://example.com/thumb.jpg',
          duration_seconds: 30,
          coins_reward: 50,
          category: 'Electronics',
          tags: ['test', 'electronics'],
          target_language: 'en',
          daily_limit: 10,
          total_budget_coins: 1000
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ad creation failed');
      
      adId = data._id;
      console.log('   Ad Created. ID:', adId);
      console.log('   Status:', data.status); // Should be pending
    } catch (e) {
      console.error('   Failed to create ad:', e.message);
      return;
    }

    console.log('\n--- MANUAL STEP REQUIRED ---');
    console.log(`Please go to your Admin Dashboard and APPROVE the ad with ID: ${adId}`);
    console.log('Set status to "active".');
    console.log('Once approved, type "continue" to proceed with User Viewing & Rewards.');
    
    // Update token file with adId for Phase 3
    tokens.adId = adId;
    fs.writeFileSync('test_tokens.json', JSON.stringify(tokens, null, 2));

  } catch (error) {
    console.error('Unexpected error in Phase 2:', error.message);
  }
}

// Check if run directly
if (require.main === module) {
  runPhase2();
}

module.exports = { runPhase2 };
