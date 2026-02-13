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

async function run() {
  const creds = {
    email: `story_user_${Date.now()}@example.com`,
    password: 'password123',
    username: `story_user_${Date.now()}`,
    full_name: 'Story User'
  };
  let auth = await request('POST', '/auth/register', creds);
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email: creds.email, password: creds.password });
  }
  const token = auth.data.token;

  const create = await request('POST', '/stories', {
    items: [
      { media: { url: 'http://localhost:5000/uploads/photo.jpg', type: 'image' }, transform: { x: 0.3 }, texts: [{ content: 'Hello', fontSize: 20 }] },
      { media: { url: 'http://localhost:5000/uploads/reel.mp4', type: 'reel', durationSec: 30 }, transform: { scale: 1.2 } }
    ]
  }, token);
  if (create.status !== 200) {
    console.error('❌ Story create failed', create);
    process.exit(1);
  }
  const storyId = create.data.story._id;

  const feed = await request('GET', '/stories/feed', null, token);
  if (feed.status !== 200) {
    console.error('❌ Feed failed', feed);
    process.exit(1);
  }
  const items = await request('GET', `/stories/${storyId}/items`, null, token);
  if (items.status !== 200 || !Array.isArray(items.data) || items.data.length < 2) {
    console.error('❌ Items fetch failed', items);
    process.exit(1);
  }

  const itemId = items.data[0]._id;
  const view = await request('POST', `/stories/items/${itemId}/view`, null, token);
  if (view.status !== 200) {
    console.error('❌ View failed', view);
    process.exit(1);
  }

  const views = await request('GET', `/stories/${storyId}/views`, null, token);
  if (views.status !== 200) {
    console.error('❌ Views list failed', views);
    process.exit(1);
  }

  console.log('✅ Stories basic test passed');
}

run();
