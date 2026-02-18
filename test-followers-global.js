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
  console.log('--- Followers global test ---');
  const u1 = await register(`fg1_${ts}@example.com`, `fg1_${ts}`);
  const u2 = await register(`fg2_${ts}@example.com`, `fg2_${ts}`);
  const u3 = await register(`fg3_${ts}@example.com`, `fg3_${ts}`);
  const t1 = u1.token;
  const id2 = u2.user?.id || u2.user?._id || u2._id;
  const id3 = u3.user?.id || u3.user?._id || u3._id;

  await request('POST', '/follow', { followedUserId: id2 }, t1);
  await request('POST', '/follow', { followedUserId: id3 }, t1);

  const byId = await request('GET', `/users/${id2}/followers`);
  if (byId.status !== 200 || !Array.isArray(byId.data.users)) throw new Error('followers by id failed');

  const all = await request('GET', `/followers`);
  if (all.status !== 200 || !Array.isArray(all.data.relations)) throw new Error('global followers failed');
  const hasRel = all.data.relations.some(r => (r.follower?.username === u1.user.username) && (r.followed?.username === u2.user.username));
  if (!hasRel) throw new Error('expected relation missing');

  console.log('✅ Followers global test passed');
}

run().catch(err => {
  console.error('❌ Followers global test failed:', err.message);
  process.exit(1);
});
