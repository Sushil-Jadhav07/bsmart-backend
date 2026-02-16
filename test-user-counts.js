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
  console.log('--- User counts presence tests ---');
  const u1 = await register(`counts_${ts}@example.com`, `counts_${ts}`);
  const token = u1.token;
  const uid = u1.user?.id || u1.user?._id || u1._id;

  // Case 1: auth.me includes counts
  let res = await request('GET', '/auth/me', null, token);
  if (res.status !== 200 || res.data.followers_count === undefined || res.data.following_count === undefined) {
    throw new Error('Case1: counts missing in /auth/me');
  }

  // Create a post to appear in feed
  const postRes = await request('POST', '/posts', {
    caption: 'hello',
    media: [{ fileName: `c_${ts}.jpg`, type: 'image' }],
    type: 'post'
  }, token);
  if (postRes.status !== 201) throw new Error('Case1 setup: post create failed');

  // Case 2: feed user_id includes counts
  res = await request('GET', '/posts/feed', null, token);
  if (res.status !== 200 || !Array.isArray(res.data) || !res.data[0]?.user_id) throw new Error('Case2: feed missing');
  const feedUser = res.data[0].user_id;
  if (feedUser.followers_count === undefined || feedUser.following_count === undefined) {
    throw new Error('Case2: counts missing in feed user');
  }

  // Case 3: likes list includes counts
  const postId = postRes.data._id || postRes.data.post_id;
  await request('POST', `/posts/${postId}/like`, null, token);
  res = await request('GET', `/posts/${postId}/likes`, null, token);
  if (res.status !== 200 || !Array.isArray(res.data.users) || res.data.users.length < 1) throw new Error('Case3: likes missing');
  const likeUser = res.data.users[0];
  if (likeUser.followers_count === undefined || likeUser.following_count === undefined) {
    throw new Error('Case3: counts missing in likes user');
  }

  // Case 4: followers list includes counts
  const u2 = await register(`counts_b_${ts}@example.com`, `counts_b_${ts}`);
  await request('POST', '/follow', { followedUserId: u2.user?.id || u2.user?._id || u2._id }, token);
  res = await request('GET', `/users/${u2.user?.id || u2.user?._id || u2._id}/followers`);
  if (res.status !== 200 || !Array.isArray(res.data.users) || res.data.users.length < 1) throw new Error('Case4: followers missing');
  const followerUser = res.data.users[0];
  if (followerUser.followers_count === undefined || followerUser.following_count === undefined) {
    throw new Error('Case4: counts missing in follower user');
  }

  console.log('✅ User counts presence tests passed');
}

run().catch(err => {
  console.error('❌ User counts tests failed:', err.message);
  process.exit(1);
});
