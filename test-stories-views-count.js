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
  const owner = await register(`views_owner_${ts}@example.com`, `views_owner_${ts}`);
  const userA = await register(`views_a_${ts}@example.com`, `views_a_${ts}`);
  const userB = await register(`views_b_${ts}@example.com`, `views_b_${ts}`);
  const userC = await register(`views_c_${ts}@example.com`, `views_c_${ts}`);

  const create = await request('POST', '/stories', {
    items: [
      { media: { url: 'http://localhost:5000/uploads/photo.jpg', type: 'image' } }
    ]
  }, owner.token);
  if (create.status !== 200) {
    console.error('❌ Story create failed', create);
    process.exit(1);
  }
  const storyId = create.data.story._id;

  const items = await request('GET', `/stories/${storyId}/items`, null, owner.token);
  const itemId = items.data[0]._id;

  // Each viewer views once; duplicate view from userA should not increment
  await request('POST', `/stories/items/${itemId}/view`, null, userA.token);
  await request('POST', `/stories/items/${itemId}/view`, null, userB.token);
  await request('POST', `/stories/items/${itemId}/view`, null, userC.token);
  await request('POST', `/stories/items/${itemId}/view`, null, userA.token); // duplicate

  const feed = await request('GET', '/stories/feed', null, owner.token);
  const storyFeedItem = (feed.data || []).find(s => s._id === storyId);
  if (!storyFeedItem) {
    console.error('❌ Story not in feed', feed.data);
    process.exit(1);
  }

  console.log('Feed views_count:', storyFeedItem.views_count);
  if (storyFeedItem.views_count < 3) {
    console.error('❌ views_count should be >= 3', storyFeedItem.views_count);
    process.exit(1);
  }

  const views = await request('GET', `/stories/${storyId}/views`, null, owner.token);
  console.log('Views:', views.data.total_views, 'Unique:', views.data.unique_viewers);
  if (views.status !== 200 || views.data.unique_viewers !== 3) {
    console.error('❌ Unique viewers should be 3', views);
    process.exit(1);
  }
  if (views.data.total_views < 3) {
    console.error('❌ Total views should be >= 3', views);
    process.exit(1);
  }

  console.log('✅ Story views count test passed');
}

run();
