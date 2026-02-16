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
  let auth = await request('POST', '/auth/register', { email, password, username, full_name: username, role: 'member' });
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email, password });
  }
  return auth.data;
}

async function run() {
  const ts = Date.now();
  const u = await register(`member_${ts}@example.com`, `member_${ts}`);
  const token = u.token;
  const myMember = await request('GET', '/members/me', null, token);
  if (myMember.status !== 200 || !myMember.data || !myMember.data.user_id) {
    console.error('❌ Member profile not found', myMember);
    process.exit(1);
  }
  const byUser = await request('GET', `/members/users/${u.user?.id || u.user?._id || u._id}`);
  if (byUser.status !== 200 || !byUser.data || !byUser.data.user_id) {
    console.error('❌ Member profile by user not found', byUser);
    process.exit(1);
  }
  console.log('✅ Member collection verified');
}

run();
