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
    email: `story_del_${Date.now()}@example.com`,
    password: 'password123',
    username: `story_del_${Date.now()}`,
    full_name: 'Story Delete'
  };
  let auth = await request('POST', '/auth/register', creds);
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email: creds.email, password: creds.password });
  }
  const token = auth.data.token;

  const create = await request('POST', '/stories', {
    items: [
      { media: { url: 'http://localhost:5000/uploads/photo.jpg', type: 'image' } }
    ]
  }, token);
  if (create.status !== 200) {
    console.error('❌ Story create failed', create);
    process.exit(1);
  }
  const storyId = create.data.story._id;

  const del = await request('DELETE', `/stories/${storyId}`, null, token);
  console.log('Delete:', del.status, del.data);
  if (del.status !== 200) {
    console.error('❌ Delete failed', del);
    process.exit(1);
  }

  const items = await request('GET', `/stories/${storyId}/items`, null, token);
  if (items.status !== 404) {
    console.error('❌ Items should 404 after delete', items.status, items.data);
    process.exit(1);
  }
  console.log('✅ Story delete test passed');
}

run();
