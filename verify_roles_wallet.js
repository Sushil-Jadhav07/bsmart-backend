const API_URL = 'http://localhost:5000/api';

async function test() {
  const timestamp = Date.now();
  
  // 1. Test Register Member
  console.log('\n--- 1. Register Member ---');
  const memberRes = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `member_${timestamp}`,
      email: `member_${timestamp}@test.com`,
      password: 'password123',
      role: 'member'
    })
  });
  const memberData = await memberRes.json();
  if (memberRes.ok) {
    console.log('✅ Member Registered:', memberData.user.role);
    console.log('   Wallet Balance:', memberData.user.wallet.balance);
    if (memberData.user.wallet.balance === 0) console.log('   ✅ Balance Correct (0)');
    else console.log('   ❌ Balance Incorrect');
  } else {
    console.log('❌ Register Failed:', memberData);
  }

  // 2. Test Register Vendor
  console.log('\n--- 2. Register Vendor ---');
  const vendorRes = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `vendor_${timestamp}`,
      email: `vendor_${timestamp}@test.com`,
      password: 'password123',
      role: 'vendor'
    })
  });
  const vendorData = await vendorRes.json();
  if (vendorRes.ok) {
    console.log('✅ Vendor Registered:', vendorData.user.role);
    console.log('   Wallet Balance:', vendorData.user.wallet.balance);
    if (vendorData.user.wallet.balance === 5000) console.log('   ✅ Balance Correct (5000)');
    else console.log('   ❌ Balance Incorrect');
  } else {
    console.log('❌ Register Failed:', vendorData);
  }

  // 3. Test Register Admin (Should Fail)
  console.log('\n--- 3. Register Admin (Should Fail) ---');
  const adminRes = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `admin_${timestamp}`,
      email: `admin_${timestamp}@test.com`,
      password: 'password123',
      role: 'admin'
    })
  });
  const adminData = await adminRes.json();
  if (!adminRes.ok && adminRes.status === 400) {
    console.log('✅ Admin Registration Blocked:', adminData.message);
  } else {
    console.log('❌ Admin Registration NOT Blocked (Unexpected):', adminRes.status, adminData);
  }

  // 4. Test Login (Check Response)
  console.log('\n--- 4. Test Login (Vendor) ---');
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `vendor_${timestamp}@test.com`,
      password: 'password123'
    })
  });
  const loginData = await loginRes.json();
  if (loginRes.ok) {
    console.log('✅ Login Successful');
    console.log('   Role in Response:', loginData.user.role);
    console.log('   Wallet in Response:', loginData.user.wallet);
  } else {
    console.log('❌ Login Failed:', loginData);
  }
}

test();
