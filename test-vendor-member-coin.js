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
  console.log('--- Vendor/Member coin reward dummy test ---');

  // Create vendor (should start with 5000 coins)
  const vendor = await register(`vendor_${ts}@example.com`, `vendor_${ts}`, 'vendor', 'Vendor@123');
  const vendorToken = vendor.token;
  const vendorMe = await request('GET', '/auth/me', null, vendorToken);
  const vendorStart = vendorMe.data.wallet?.balance || 0;
  console.log('Vendor start balance:', vendorStart);
  if (vendorStart < 5000) {
    throw new Error('Vendor initial balance should be 5000');
  }

  // Create member (starts at 0)
  const member = await register(`member_${ts}@example.com`, `member_${ts}`, 'member', 'Member@123');
  const memberToken = member.token;
  const memberMe = await request('GET', '/auth/me', null, memberToken);
  const memberStart = memberMe.data.wallet?.balance || 0;
  console.log('Member start balance:', memberStart);

  // Vendor creates a normal post
  const postRes = await request('POST', '/posts', {
    caption: 'Vendor post',
    media: [{ fileName: `vpost_${ts}.jpg`, type: 'image' }],
    type: 'post'
  }, vendorToken);
  if (postRes.status !== 201) throw new Error('Vendor post creation failed');
  const postId = postRes.data._id || postRes.data.post_id;

  // Vendor creates a reel
  const reelRes = await request('POST', '/posts', {
    caption: 'Vendor reel',
    media: [{ fileName: `vreel_${ts}.mp4`, type: 'video' }],
    type: 'reel'
  }, vendorToken);
  if (reelRes.status !== 201) throw new Error('Vendor reel creation failed');
  const reelId = reelRes.data._id || reelRes.data.post_id;

  // Member likes and comments on both
  let res = await request('POST', `/posts/${postId}/like`, null, memberToken);
  if (res.status !== 200) throw new Error('Member like on post failed');
  res = await request('POST', `/posts/${postId}/comments`, { text: 'Nice post!' }, memberToken);
  if (res.status !== 201) throw new Error('Member comment on post failed');
  res = await request('POST', `/posts/${reelId}/like`, null, memberToken);
  if (res.status !== 200) throw new Error('Member like on reel failed');
  res = await request('POST', `/posts/${reelId}/comments`, { text: 'Cool reel!' }, memberToken);
  if (res.status !== 201) throw new Error('Member comment on reel failed');

  // Verify wallet changes
  const vendorAfter = await request('GET', '/auth/me', null, vendorToken);
  const memberAfter = await request('GET', '/auth/me', null, memberToken);
  const vendorDelta = (vendorAfter.data.wallet?.balance || 0) - vendorStart;
  const memberDelta = (memberAfter.data.wallet?.balance || 0) - memberStart;
  console.log('Vendor delta:', vendorDelta, 'Member delta:', memberDelta);
  if (memberDelta !== 40) throw new Error('Member should gain 40 coins (2 likes + 2 comments)');
  if (vendorDelta !== -40) throw new Error('Vendor should lose 40 coins (2 likes + 2 comments)');

  // Validate counts
  const postLikes = await request('GET', `/posts/${postId}/likes`, null, memberToken);
  const reelLikes = await request('GET', `/posts/${reelId}/likes`, null, memberToken);
  if (postLikes.data.total < 1 || reelLikes.data.total < 1) throw new Error('Likes count not updated');

  console.log('✅ Vendor/Member coin reward dummy test passed');
}

run().catch(err => {
  console.error('❌ Dummy test failed:', err.message);
  process.exit(1);
});
