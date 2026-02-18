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

async function register(email, username, password = 'password123') {
  let auth = await request('POST', '/auth/register', { email, password, username, full_name: username, role: 'member' });
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email, password });
  }
  return auth.data;
}

async function run() {
  const ts = Date.now();
  console.log('--- Following global test ---');
  const u1 = await register(`gl1_${ts}@example.com`, `gl1_${ts}`);
  const u2 = await register(`gl2_${ts}@example.com`, `gl2_${ts}`);
  const t1 = u1.token;
  const id2 = u2.user?.id || u2.user?._id || u2._id;

  await request('POST', '/follow', { followedUserId: id2 }, t1);

  const byId = await request('GET', `/users/${u1.user?.id || u1.user?._id || u1._id}/following`);
  if (byId.status !== 200 || !Array.isArray(byId.data.users)) throw new Error('following by id failed');

  const all = await request('GET', `/following`);
  if (all.status !== 200 || !Array.isArray(all.data.relations)) throw new Error('global following failed');
  const hasRel = all.data.relations.some(r => (r.follower?.username === u1.user.username) && (r.followed?.username === u2.user.username));
  if (!hasRel) throw new Error('expected relation missing');

  console.log('✅ Following global test passed');
}

run().catch(err => {
  console.error('❌ Following global test failed:', err.message);
  process.exit(1);
});
