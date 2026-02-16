const http = require('http');

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function register(email, username, role = 'member', password = 'password123') {
  let auth = await request('POST', '/auth/register', { email, password, username, full_name: username, role });
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email, password });
  }
  return auth.data;
}

async function run() {
  const ts = Date.now();
  console.log('--- Vendor wallet display test ---');

  // Start as member
  const member = await register(`vw_${ts}@example.com`, `vw_${ts}`);
  console.log('Member auth:', member);
  const token = member.token;
  const me1 = await request('GET', '/auth/me', null, token);
  console.log('/auth/me status:', me1.status, 'data:', me1.data);
  const startBal = me1.data.wallet?.balance || 0;
  console.log('Start balance:', startBal);

  // Upgrade to vendor
  const createVendorRes = await request('POST', '/vendors', {
    business_name: `Biz ${ts}`,
    description: 'Desc',
    category: 'general',
    phone: '123456789',
    address: 'Somewhere'
  }, token);
  console.log('Create vendor status:', createVendorRes.status, 'data:', createVendorRes.data);
  if (createVendorRes.status !== 201) throw new Error('Vendor creation failed');
  const fromCreate = createVendorRes.data.wallet?.balance;
  if (typeof fromCreate !== 'number') throw new Error('Wallet missing in vendor creation response');

  // Fetch /vendors/me and verify wallet present
  const myVendor = await request('GET', '/vendors/me', null, token);
  if (myVendor.status !== 200) throw new Error('/vendors/me failed');
  const vendorBal = myVendor.data.wallet?.balance;
  console.log('/vendors/me status:', myVendor.status, 'data:', myVendor.data);
  if (typeof vendorBal !== 'number') throw new Error('Wallet missing in /vendors/me');

  // Verify +5000 credit on upgrade
  if ((vendorBal - startBal) < 5000) throw new Error('Vendor upgrade should credit at least +5000');

  console.log('✅ Vendor wallet display test passed');
}

run().catch(err => {
  console.error('❌ Vendor wallet display test failed:', err.message);
  process.exit(1);
});
