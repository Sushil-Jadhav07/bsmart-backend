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

async function createPost(token) {
  const payload = {
    caption: 'hello',
    media: [{ fileName: `img_${Date.now()}.jpg`, type: 'image' }]
  };
  const res = await request('POST', '/posts', payload, token);
  if (res.status !== 201 || !res.data || !res.data._id) throw new Error('Post create failed');
  return res.data;
}

async function run() {
  const ts = Date.now();
  console.log('--- Saved posts tests ---');
  const owner = await register(`owner_${ts}@example.com`, `owner_${ts}`);
  const actor = await register(`actor_${ts}@example.com`, `actor_${ts}`);
  const ownerToken = owner.token;
  const actorToken = actor.token;

  const post = await createPost(ownerToken);
  const postId = post._id || post.post_id;

  let res = await request('POST', `/posts/${postId}/save`, null, actorToken);
  if (res.status !== 200 || !res.data.success || res.data.saved !== true) throw new Error('Save failed');

  res = await request('POST', `/posts/${postId}/save`, null, actorToken);
  if (res.status !== 409) throw new Error('Duplicate save should be 409');

  const list = await request('GET', `/posts/saved`, null, actorToken);
  console.log('Saved list resp:', list.data);
  if (list.status !== 200 || !list.data.success || !Array.isArray(list.data.posts) || list.data.posts.length < 1) {
    throw new Error('Saved list failed');
  }

  res = await request('POST', `/posts/${postId}/unsave`, null, actorToken);
  if (res.status !== 200 || !res.data.success || res.data.saved !== false) throw new Error('Unsave failed');

  res = await request('POST', `/posts/${postId}/unsave`, null, actorToken);
  if (res.status !== 400) throw new Error('Unsave when not saved should be 400');

  console.log('✅ Saved posts tests passed');
}

run().catch(err => {
  console.error('❌ Saved posts tests failed:', err.message);
  process.exit(1);
});
