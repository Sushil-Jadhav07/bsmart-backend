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
  const u1 = await register(`list1_${ts}@example.com`, `list1_${ts}`);
  const u2 = await register(`list2_${ts}@example.com`, `list2_${ts}`);
  const u3 = await register(`list3_${ts}@example.com`, `list3_${ts}`);

  const res = await request('GET', '/users', null, u1.token);
  console.log('Status:', res.status, 'Count:', Array.isArray(res.data) ? res.data.length : 'n/a');
  if (res.status !== 200 || !Array.isArray(res.data) || res.data.length < 3) {
    console.error('❌ Users list failed or insufficient results', res);
    process.exit(1);
  }
  const user = res.data.find(x => x.username === u1.user?.username || x.username === `list1_${ts}`);
  if (!user) {
    console.error('❌ Missing registered user in list', res.data.slice(0, 5));
    process.exit(1);
  }
  console.log('✅ Users profile list endpoint works');
}

run();
