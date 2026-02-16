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

async function register(email, username, role = 'member') {
  const password = 'password123';
  let auth = await request('POST', '/auth/register', { email, password, username, full_name: username, role });
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email, password });
  }
  return auth.data;
}

async function run() {
  const ts = Date.now();
  console.log('--- Coin rewards tests ---');
  const owner = await register(`owner_${ts}@example.com`, `owner_${ts}`, 'member');
  const actor = await register(`actor_${ts}@example.com`, `actor_${ts}`, 'member');
  const ownerToken = owner.token;
  const actorToken = actor.token;
  const ownerId = owner.user?.id || owner.user?._id || owner._id;

  const postRes = await request('POST', '/posts', {
    caption: 'reward post',
    media: [{ fileName: `p_${ts}.jpg`, type: 'image' }],
    type: 'post'
  }, ownerToken);
  if (postRes.status !== 201) throw new Error('Post create failed');
  const postId = postRes.data._id || postRes.data.post_id;

  const ownerMe1 = await request('GET', '/auth/me', null, ownerToken);
  const actorMe1 = await request('GET', '/auth/me', null, actorToken);
  const ob1 = ownerMe1.data.wallet?.balance || 0;
  const ab1 = actorMe1.data.wallet?.balance || 0;

  // Like
  let res = await request('POST', `/posts/${postId}/like`, null, actorToken);
  if (res.status !== 200) throw new Error('Like failed');
  const ownerMe2 = await request('GET', '/auth/me', null, ownerToken);
  const actorMe2 = await request('GET', '/auth/me', null, actorToken);
  if ((actorMe2.data.wallet.balance - ab1) !== 10) throw new Error('Actor not rewarded for like');
  if ((ownerMe2.data.wallet.balance - ob1) !== -10) throw new Error('Owner not deducted for like');

  // Comment
  res = await request('POST', `/posts/${postId}/comments`, { text: 'Nice!' }, actorToken);
  if (res.status !== 201) throw new Error('Comment failed');
  const ownerMe3 = await request('GET', '/auth/me', null, ownerToken);
  const actorMe3 = await request('GET', '/auth/me', null, actorToken);
  if ((actorMe3.data.wallet.balance - actorMe2.data.wallet.balance) !== 10) throw new Error('Actor not rewarded for comment');
  if ((ownerMe3.data.wallet.balance - ownerMe2.data.wallet.balance) !== -10) throw new Error('Owner not deducted for comment');

  // Reply
  const parentId = res.data._id;
  const replyRes = await request('POST', `/posts/${postId}/comments`, { text: 'Thanks', parent_id: parentId }, ownerToken);
  if (replyRes.status !== 201) throw new Error('Reply failed');
  const ownerMe4 = await request('GET', '/auth/me', null, ownerToken);
  const actorMe4 = await request('GET', '/auth/me', null, actorToken);
  // Owner replied to own post; should not transfer coins (owner == actor)
  if ((ownerMe4.data.wallet.balance - ownerMe3.data.wallet.balance) !== 0) throw new Error('Owner should not self-transfer on reply');
  if ((actorMe4.data.wallet.balance - actorMe3.data.wallet.balance) !== 0) throw new Error('Actor wallet changed unexpectedly on owner reply');

  // Save
  res = await request('POST', `/posts/${postId}/save`, null, actorToken);
  if (res.status !== 200 || !res.data.saved) throw new Error('Save failed');
  const ownerMe5 = await request('GET', '/auth/me', null, ownerToken);
  const actorMe5 = await request('GET', '/auth/me', null, actorToken);
  if ((actorMe5.data.wallet.balance - actorMe4.data.wallet.balance) !== 10) throw new Error('Actor not rewarded for save');
  if ((ownerMe5.data.wallet.balance - ownerMe4.data.wallet.balance) !== -10) throw new Error('Owner not deducted for save');

  console.log('✅ Coin rewards tests passed');
}

run().catch(err => {
  console.error('❌ Coin rewards tests failed:', err.message);
  process.exit(1);
});
