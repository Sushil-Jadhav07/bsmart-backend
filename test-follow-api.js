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
  const a = await register(`a_${ts}@example.com`, `a_${ts}`);
  const b = await register(`b_${ts}@example.com`, `b_${ts}`);

  let res = await request('POST', '/follow', { followedUserId: b.user?._id || b.userId || b.id || b.user_id || b._id }, a.token);
  if (res.status !== 200 || !res.data.followed) {
    console.error('❌ Follow failed', res);
    process.exit(1);
  }
  const followers = await request('GET', `/users/${b.user?._id || b.userId || b.id || b.user_id || b._id}/followers`);
  const following = await request('GET', `/users/${a.user?._id || a.userId || a.id || a.user_id || a._id}/following`);
  if (followers.status !== 200 || following.status !== 200) {
    console.error('❌ List endpoints failed', followers, following);
    process.exit(1);
  }
  const followerUsernames = followers.data.users.map(u => u.username);
  const followingUsernames = following.data.users.map(u => u.username);
  if (!followerUsernames.includes(`a_${ts}`) || !followingUsernames.includes(`b_${ts}`)) {
    console.error('❌ Relationship missing', followers.data, following.data);
    process.exit(1);
  }

  res = await request('POST', '/unfollow', { followedUserId: b.user?._id || b._id }, a.token);
  if (res.status !== 200 || !res.data.unfollowed) {
    console.error('❌ Unfollow failed', res);
    process.exit(1);
  }
  const followers2 = await request('GET', `/users/${b.user?._id || b._id}/followers`);
  if (followers2.data.users.some(u => u.username === `a_${ts}`)) {
    console.error('❌ Unfollow did not remove follower', followers2.data);
    process.exit(1);
  }
  console.log('✅ Follow API works');
}

run();
