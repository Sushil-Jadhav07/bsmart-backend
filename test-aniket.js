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

async function loginOrRegister(email, password, username, role = 'member') {
  let auth = await request('POST', '/auth/login', { email, password });
  if (auth.status !== 200 || !auth.data.token) {
    auth = await request('POST', '/auth/register', { email, password, username, full_name: username, role });
  }
  return auth.data;
}

async function run() {
  console.log('--- Running test for aniket@gamil.com ---');
  const email = 'aniket@gamil.com';
  const password = 'Aniket@123';
  const username = 'Aniket';
  const aniket = await loginOrRegister(email, password, username);
  const token = aniket.token;
  if (!token) throw new Error('Login/Register failed for Aniket');

  const me1 = await request('GET', '/auth/me', null, token);
  console.log('Profile:', {
    id: me1.data.id || me1.data._id,
    username: me1.data.username,
    wallet: me1.data.wallet
  });

  // Create a post as Aniket
  const ts = Date.now();
  const createPostRes = await request('POST', '/posts', {
    caption: 'Aniket test post',
    media: [{ fileName: `aniket_${ts}.jpg`, type: 'image' }],
    type: 'post'
  }, token);
  if (createPostRes.status !== 201) throw new Error('Post creation failed for Aniket');
  const postId = createPostRes.data._id || createPostRes.data.post_id;
  console.log('Created post:', postId);

  // Create a second user to provide an external post to interact with
  const other = await loginOrRegister(`other_${ts}@example.com`, 'password123', `other_${ts}`);
  const otherToken = other.token;
  const otherPostRes = await request('POST', '/posts', {
    caption: 'Other post to interact',
    media: [{ fileName: `other_${ts}.jpg`, type: 'image' }],
    type: 'post'
  }, otherToken);
  if (otherPostRes.status !== 201) throw new Error('Other post creation failed');
  const otherPostId = otherPostRes.data._id || otherPostRes.data.post_id;

  const meBefore = await request('GET', '/auth/me', null, token);
  const otherBefore = await request('GET', '/auth/me', null, otherToken);
  const aBal = meBefore.data.wallet?.balance || 0;
  const oBal = otherBefore.data.wallet?.balance || 0;

  // Interact as Aniket on other user's post: like, comment, save
  let res = await request('POST', `/posts/${otherPostId}/like`, null, token);
  if (res.status !== 200) throw new Error('Like failed');
  res = await request('POST', `/posts/${otherPostId}/comments`, { text: 'Nice!' }, token);
  if (res.status !== 201) throw new Error('Comment failed');
  res = await request('POST', `/posts/${otherPostId}/save`, null, token);
  if (res.status !== 200 || !res.data.saved) throw new Error('Save failed');

  const meAfter = await request('GET', '/auth/me', null, token);
  const otherAfter = await request('GET', '/auth/me', null, otherToken);
  const aDelta = (meAfter.data.wallet?.balance || 0) - aBal;
  const oDelta = (otherAfter.data.wallet?.balance || 0) - oBal;

  console.log('Wallet change for Aniket:', aDelta);
  console.log('Wallet change for Other:', oDelta);

  if (aDelta !== 30) throw new Error('Aniket should gain 30 coins (like+comment+save)');
  if (oDelta !== -30) throw new Error('Other should lose 30 coins (like+comment+save)');

  console.log('✅ Test completed successfully for Aniket');
}

run().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
