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

async function getUser(id) {
  const res = await request('GET', `/users/${id}`);
  return res.data;
}

async function run() {
  const ts = Date.now();
  console.log('--- Follow/Followers tests ---');
  const alice = await register(`alice_${ts}@example.com`, `alice_${ts}`);
  const bob = await register(`bob_${ts}@example.com`, `bob_${ts}`);
  const aliceId = alice.user?.id || alice.user?._id || alice._id;
  const bobId = bob.user?.id || bob.user?._id || bob._id;
  const aliceToken = alice.token;
  const bobToken = bob.token;

  // Test 1: Alice follows Bob
  let res = await request('POST', '/follow', { followedUserId: bobId }, aliceToken);
  if (res.status !== 200 || !res.data.followed) throw new Error('T1 follow failed');
  // Verify counts and lists
  const bobFollowers = await request('GET', `/users/${bobId}/followers`);
  const aliceFollowing = await request('GET', `/users/${aliceId}/following`);
  const aliceUser = await getUser(aliceId);
  const bobUser = await getUser(bobId);
  if (bobFollowers.data.total !== 1) throw new Error('T1 followers total mismatch');
  if (!bobFollowers.data.users.some(u => u.username === `alice_${ts}`)) throw new Error('T1 followers list missing Alice');
  if (aliceFollowing.data.total !== 1) throw new Error('T1 following total mismatch');
  if (!aliceFollowing.data.users.some(u => u.username === `bob_${ts}`)) throw new Error('T1 following list missing Bob');
  if ((aliceUser.following_count || 0) !== 1) throw new Error('T1 following_count mismatch');
  if ((bobUser.followers_count || 0) !== 1) throw new Error('T1 followers_count mismatch');

  // Test 2: Alice follows Bob again (idempotent)
  res = await request('POST', '/follow', { followedUserId: bobId }, aliceToken);
  if (res.status !== 200 || !res.data.alreadyFollowing) throw new Error('T2 should be alreadyFollowing');
  const bobFollowers2 = await request('GET', `/users/${bobId}/followers`);
  if (bobFollowers2.data.total !== 1) throw new Error('T2 followers total changed unexpectedly');

  // Test 3: Alice unfollows Bob
  res = await request('POST', '/unfollow', { followedUserId: bobId }, aliceToken);
  if (res.status !== 200 || !res.data.unfollowed) throw new Error('T3 unfollow failed');
  const bobFollowers3 = await request('GET', `/users/${bobId}/followers`);
  if (bobFollowers3.data.total !== 0) throw new Error('T3 followers total not decreased');
  const aliceFollowing3 = await request('GET', `/users/${aliceId}/following`);
  if (aliceFollowing3.data.total !== 0) throw new Error('T3 following total not decreased');
  const aliceUser3 = await getUser(aliceId);
  const bobUser3 = await getUser(bobId);
  if ((aliceUser3.following_count || 0) !== 0) throw new Error('T3 following_count not decreased');
  if ((bobUser3.followers_count || 0) !== 0) throw new Error('T3 followers_count not decreased');

  // Test 4: Alice unfollows Bob again (idempotent)
  res = await request('POST', '/unfollow', { followedUserId: bobId }, aliceToken);
  if (res.status !== 200 || !res.data.alreadyNotFollowing) throw new Error('T4 should be alreadyNotFollowing');

  // Test 5: Self-follow prevented
  res = await request('POST', '/follow', { followedUserId: aliceId }, aliceToken);
  if (res.status !== 400) throw new Error('T5 self-follow should be 400');

  console.log('✅ Follow/Followers test cases passed');
}

run().catch(err => {
  console.error('❌ Follow tests failed:', err.message);
  process.exit(1);
});
