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
  const full_name = username;
  let auth = await request('POST', '/auth/register', { email, password, username, full_name });
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email, password });
  }
  return auth.data;
}

async function run() {
  const ts = Date.now();
  const owner = await register(`mentions_owner_${ts}@example.com`, `mentions_owner_${ts}`);
  const userA = await register(`mentions_a_${ts}@example.com`, `mentions_a_${ts}`);
  const userB = await register(`mentions_b_${ts}@example.com`, `mentions_b_${ts}`);

  const create = await request('POST', '/stories', {
    items: [
      {
        media: { url: 'http://localhost:5000/uploads/photo.jpg', type: 'image' },
        mentions: [
          { user_id: userA.user.id || userA.user._id || userA.id, username: userA.user?.username || userA.username, x: 0.2, y: 0.3 },
          { user_id: userB.user.id || userB.user._id || userB.id, username: userB.user?.username || userB.username, x: 0.7, y: 0.6 }
        ]
      }
    ]
  }, owner.token);

  if (create.status !== 200) {
    console.error('❌ Story create failed', create);
    process.exit(1);
  }

  const storyId = create.data.story._id;
  const items = await request('GET', `/stories/${storyId}/items`, null, owner.token);
  if (items.status !== 200 || !Array.isArray(items.data) || items.data.length < 1) {
    console.error('❌ Items fetch failed', items);
    process.exit(1);
  }

  const item = items.data[0];
  if (!Array.isArray(item.mentions) || item.mentions.length !== 2) {
    console.error('❌ Mentions not stored correctly', item.mentions);
    process.exit(1);
  }

  console.log('✅ Story mentions test passed');
}

run();
