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

async function register(email, username, role = 'member', password = 'password123') {
  let auth = await request('POST', '/auth/register', { email, password, username, full_name: username, role });
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email, password });
  }
  return auth.data;
}

async function run() {
  const ts = Date.now();
  console.log('--- Extended coin rewards tests ---');
  const owner = await register(`ext_owner_${ts}@example.com`, `ext_owner_${ts}`);
  const actor = await register(`ext_actor_${ts}@example.com`, `ext_actor_${ts}`);
  const ownerToken = owner.token;
  const actorToken = actor.token;

  const postRes = await request('POST', '/posts', {
    caption: 'extended reward post',
    media: [{ fileName: `ext_${ts}.jpg`, type: 'image' }],
    type: 'post'
  }, ownerToken);
  if (postRes.status !== 201) throw new Error('Post create failed');
  const postId = postRes.data._id || postRes.data.post_id;

  const ownerMe1 = await request('GET', '/auth/me', null, ownerToken);
  const actorMe1 = await request('GET', '/auth/me', null, actorToken);
  const ob1 = ownerMe1.data.wallet?.balance || 0;
  const ab1 = actorMe1.data.wallet?.balance || 0;

  // Like once, then try like again (idempotent)
  let res = await request('POST', `/posts/${postId}/like`, null, actorToken);
  if (res.status !== 200) throw new Error('Like failed');
  const ownerMe2 = await request('GET', '/auth/me', null, ownerToken);
  const actorMe2 = await request('GET', '/auth/me', null, actorToken);
  if ((actorMe2.data.wallet.balance - ab1) !== 10) throw new Error('Actor like reward incorrect');
  if ((ownerMe2.data.wallet.balance - ob1) !== -10) throw new Error('Owner like deduction incorrect');
  const likeAgain = await request('POST', `/posts/${postId}/like`, null, actorToken);
  if (likeAgain.status !== 400) throw new Error('Second like should be rejected');
  const actorMe2b = await request('GET', '/auth/me', null, actorToken);
  if (actorMe2b.data.wallet.balance !== actorMe2.data.wallet.balance) throw new Error('Actor balance changed on duplicate like');

  // Comment twice; second should not change wallet
  const comment1 = await request('POST', `/posts/${postId}/comments`, { text: 'Great post!' }, actorToken);
  if (comment1.status !== 201) throw new Error('Comment1 failed');
  const actorMe3 = await request('GET', '/auth/me', null, actorToken);
  const ownerMe3 = await request('GET', '/auth/me', null, ownerToken);
  if ((actorMe3.data.wallet.balance - actorMe2b.data.wallet.balance) !== 10) throw new Error('Actor comment reward incorrect');
  if ((ownerMe3.data.wallet.balance - ownerMe2.data.wallet.balance) !== -10) throw new Error('Owner comment deduction incorrect');
  const comment2 = await request('POST', `/posts/${postId}/comments`, { text: 'Another thought' }, actorToken);
  if (comment2.status !== 201) throw new Error('Comment2 failed');
  const actorMe3b = await request('GET', '/auth/me', null, actorToken);
  if (actorMe3b.data.wallet.balance !== actorMe3.data.wallet.balance) throw new Error('Actor balance changed on duplicate comment');

  // Reply: actor replies to their own comment; should reward once
  const parentId = comment1.data._id;
  const reply1 = await request('POST', `/posts/${postId}/comments`, { text: 'Replying', parent_id: parentId }, actorToken);
  if (reply1.status !== 201) throw new Error('Reply1 failed');
  const actorMe4 = await request('GET', '/auth/me', null, actorToken);
  const ownerMe4 = await request('GET', '/auth/me', null, ownerToken);
  if ((actorMe4.data.wallet.balance - actorMe3b.data.wallet.balance) !== 10) throw new Error('Actor reply reward incorrect');
  if ((ownerMe4.data.wallet.balance - ownerMe3.data.wallet.balance) !== -10) throw new Error('Owner reply deduction incorrect');
  const reply2 = await request('POST', `/posts/${postId}/comments`, { text: 'Reply again', parent_id: parentId }, actorToken);
  if (reply2.status !== 201) throw new Error('Reply2 failed');
  const actorMe4b = await request('GET', '/auth/me', null, actorToken);
  if (actorMe4b.data.wallet.balance !== actorMe4.data.wallet.balance) throw new Error('Actor balance changed on duplicate reply');

  // Save twice; second should not change wallet
  const save1 = await request('POST', `/posts/${postId}/save`, null, actorToken);
  if (save1.status !== 200 || !save1.data.saved) throw new Error('Save1 failed');
  const actorMe5 = await request('GET', '/auth/me', null, actorToken);
  const ownerMe5 = await request('GET', '/auth/me', null, ownerToken);
  if ((actorMe5.data.wallet.balance - actorMe4b.data.wallet.balance) !== 10) throw new Error('Actor save reward incorrect');
  if ((ownerMe5.data.wallet.balance - ownerMe4.data.wallet.balance) !== -10) throw new Error('Owner save deduction incorrect');
  const save2 = await request('POST', `/posts/${postId}/save`, null, actorToken);
  if (save2.status !== 200 || !save2.data.alreadySaved) throw new Error('Save2 should indicate already saved');
  const actorMe5b = await request('GET', '/auth/me', null, actorToken);
  if (actorMe5b.data.wallet.balance !== actorMe5.data.wallet.balance) throw new Error('Actor balance changed on duplicate save');

  // Self-actions: owner likes own post (no transfer)
  const likeSelf = await request('POST', `/posts/${postId}/like`, null, ownerToken);
  if (likeSelf.status !== 200) throw new Error('Owner like failed');
  const ownerMe6 = await request('GET', '/auth/me', null, ownerToken);
  if (ownerMe6.data.wallet.balance !== ownerMe5.data.wallet.balance) throw new Error('Owner wallet changed on self-like');

  console.log('✅ Extended coin rewards tests passed');
}

run().catch(err => {
  console.error('❌ Extended coin rewards tests failed:', err.message);
  process.exit(1);
});
