const http = require('http');

function request(method, path, body = null, token = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
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

async function register(email, username, role) {
  const password = 'password123';
  let auth = await request('POST', '/auth/register', { email, password, username, full_name: username, role });
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email, password });
  }
  return auth.data;
}

async function run() {
  const ts = Date.now();
  console.log('--- E2E: member and vendor flows ---');

  // Register member and vendor (vendor via API)
  const member = await register(`member_${ts}@example.com`, `member_${ts}`, 'member');
  const vendorUser = await register(`vendor_${ts}@example.com`, `vendor_${ts}`, 'member');
  const memberToken = member.token;
  const vendorToken = vendorUser.token;

  // Create vendor profile
  let res = await request('POST', '/vendors', { business_name: `Biz ${ts}`, description: 'Desc' }, vendorToken);
  if (res.status !== 201) throw new Error('Vendor create failed');
  res = await request('GET', '/auth/me', null, vendorToken);
  if (res.status !== 200 || res.data.role !== 'vendor') throw new Error('Vendor role not set');

  // Create posts: member post + vendor reel
  const memberPost = await request('POST', '/posts', {
    caption: 'member post',
    media: [{ fileName: `m_${ts}.jpg`, type: 'image' }],
    type: 'post'
  }, memberToken);
  if (memberPost.status !== 201) throw new Error('Member post creation failed');
  const vendorReel = await request('POST', '/posts', {
    caption: 'vendor reel',
    media: [{ fileName: `v_${ts}.mp4`, type: 'video' }],
    type: 'reel'
  }, vendorToken);
  if (vendorReel.status !== 201) throw new Error('Vendor reel creation failed');
  const memberPostId = memberPost.data._id || memberPost.data.post_id;
  const vendorReelId = vendorReel.data._id || vendorReel.data.post_id;

  // Feed and single post
  res = await request('GET', '/posts/feed', null, memberToken);
  if (res.status !== 200 || !Array.isArray(res.data)) throw new Error('Feed failed');
  res = await request('GET', `/posts/${memberPostId}`, null, memberToken);
  if (res.status !== 200 || !res.data._id) throw new Error('Get post failed');

  // Like/unlike
  res = await request('POST', `/posts/${memberPostId}/like`, null, vendorToken);
  if (res.status !== 200 || !res.data.liked) throw new Error('Like failed');
  res = await request('GET', `/posts/${memberPostId}/likes`, null, memberToken);
  if (res.status !== 200 || res.data.total < 1) throw new Error('Likes listing failed');
  res = await request('POST', `/posts/${memberPostId}/unlike`, null, vendorToken);
  if (res.status !== 200 || res.data.liked !== false) throw new Error('Unlike failed');

  // Comments and nested reply rejection
  const c1 = await request('POST', `/posts/${memberPostId}/comments`, { text: 'nice one' }, vendorToken);
  if (c1.status !== 201) throw new Error('Add comment failed');
  const c2 = await request('POST', `/posts/${memberPostId}/comments`, { text: 'reply', parent_id: c1.data._id }, memberToken);
  if (c2.status !== 201) throw new Error('Add reply failed');
  const nested = await request('POST', `/posts/${memberPostId}/comments`, { text: 'nested', parent_id: c2.data._id }, vendorToken);
  if (nested.status !== 400) throw new Error('Nested reply should be rejected');

  // Views: add and complete on vendor reel
  res = await request('POST', '/views', { postId: vendorReelId }, memberToken);
  if (res.status !== 200 || res.data.views_count < 1) throw new Error('Add view failed');
  res = await request('POST', '/views/complete', { postId: vendorReelId, watchTimeMs: 12000 }, memberToken);
  if (res.status !== 200 || !res.data.completed) throw new Error('Complete view failed');

  // Follow: member follows vendor
  res = await request('POST', '/follow', { followedUserId: vendorUser.user?.id || vendorUser.user?._id || vendorUser._id }, memberToken);
  if (res.status !== 200 || !res.data.followed) throw new Error('Follow failed');
  res = await request('GET', `/users/${vendorUser.user?.id || vendorUser.user?._id || vendorUser._id}/followers`);
  if (res.status !== 200 || !res.data.users.some(u => u.username === `member_${ts}`)) throw new Error('Followers listing failed');
  res = await request('POST', '/unfollow', { followedUserId: vendorUser.user?.id || vendorUser.user?._id || vendorUser._id }, memberToken);
  if (res.status !== 200 || !res.data.unfollowed) throw new Error('Unfollow failed');

  // Save/unsave: member saves vendor reel
  res = await request('POST', `/posts/${vendorReelId}/save`, null, memberToken);
  if (res.status !== 200 || !res.data.saved) throw new Error('Save failed');
  res = await request('GET', `/users/${member.user?._id || member._id || member.userId}/saved`, null, memberToken);
  if (res.status !== 200 || !Array.isArray(res.data) || res.data.length < 1) throw new Error('Saved list failed');
  res = await request('POST', `/posts/${vendorReelId}/unsave`, null, memberToken);
  if (res.status !== 200 || !res.data.unsaved) throw new Error('Unsave failed');

  // Stories: create item and feed
  const storyMediaUrl = `http://localhost:5000/uploads/s_${ts}.jpg`;
  res = await request('POST', '/stories', {
    items: [{
      media: { url: storyMediaUrl, type: 'image' },
      transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
      texts: [{ content: 'hello', fontSize: 20 }],
      mentions: []
    }]
  }, memberToken);
  if (res.status !== 200 || !res.data.story || !Array.isArray(res.data.items)) throw new Error('Create story failed');
  const storyId = res.data.story._id;
  res = await request('GET', '/stories/feed', null, memberToken);
  if (res.status !== 200 || !Array.isArray(res.data)) throw new Error('Stories feed failed');
  res = await request('GET', `/stories/${storyId}/items`, null, memberToken);
  if (res.status !== 200 || !Array.isArray(res.data) || res.data.length < 1) throw new Error('Story items failed');
  const itemId = res.data[0]._id;
  res = await request('POST', `/stories/items/${itemId}/view`, null, vendorToken);
  if (res.status !== 200 || !res.data.success) throw new Error('Story item view failed');
  res = await request('GET', `/stories/${storyId}/views`, null, memberToken);
  if (res.status !== 200 || typeof res.data.total_views !== 'number') throw new Error('Story views list failed');

  // Users list aggregated
  res = await request('GET', '/users', null, memberToken);
  if (res.status !== 200 || !Array.isArray(res.data)) throw new Error('Users aggregated list failed');

  // Update own user
  res = await request('PUT', `/users/${member.user?.id || member.user?._id || member._id}`, { full_name: 'Member Updated' }, memberToken);
  if (res.status !== 200 || res.data.full_name !== 'Member Updated') throw new Error('Update user failed');

  console.log('✅ Full E2E (member + vendor) passed');
}

run().catch(err => {
  console.error('❌ E2E failed:', err.message);
  process.exit(1);
});
