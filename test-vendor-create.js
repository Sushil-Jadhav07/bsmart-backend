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
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function register(email, username) {
  const password = 'password123';
  let auth = await request('POST', '/auth/register', { email, password, username, full_name: username });
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email, password });
  }
  return auth.data;
}

async function run() {
  const ts = Date.now();
  const u = await register(`vendor_${ts}@example.com`, `vendor_${ts}`);
  const token = u.token;

  const createRes = await request('POST', '/vendors', {
    business_name: `Biz ${ts}`,
    description: 'Test vendor',
    category: 'general',
    phone: '123456789',
    address: 'Somewhere'
  }, token);
  if (createRes.status !== 201) {
    console.error('❌ Vendor create failed', createRes);
    process.exit(1);
  }

  const meRes = await request('GET', '/auth/me', null, token);
  if (meRes.status !== 200 || meRes.data.role !== 'vendor' || !meRes.data.wallet || meRes.data.wallet.balance < 5000) {
    console.error('❌ User role not updated to vendor', meRes);
    process.exit(1);
  }

  const myVendor = await request('GET', '/vendors/me', null, token);
  if (myVendor.status !== 200 || myVendor.data.business_name !== `Biz ${ts}`) {
    console.error('❌ Vendor retrieval failed', myVendor);
    process.exit(1);
  }

  console.log('✅ Vendor creation API works');
}

run();
