const http = require('http');

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method: method,
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
    email: 'test_new@example.com',
    password: 'password123',
    username: 'testuser_new_features',
    full_name: 'Test User New'
  };
  let auth = await request('POST', '/auth/register', creds);
  if (auth.status !== 201 || !auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email: creds.email, password: creds.password });
  }
  const token = auth.data.token;

  const usersResp = await request('GET', '/auth/users', null, token);
  console.log('Users status:', usersResp.status);
  if (!Array.isArray(usersResp.data)) {
    console.error('❌ Expected array of users');
    process.exit(1);
  }
  const first = usersResp.data[0];
  console.log('First user has posts count:', first.posts ? first.posts.length : 0);
  if (first.posts && first.posts.length > 0) {
    const p = first.posts[0];
    console.log('Post likes_count:', p.likes_count, 'comments:', p.comments ? p.comments.length : 0);
    if (p.media && p.media[0] && p.media[0].filter) {
      console.log('Media filter css:', p.media[0].filter.css || '');
    }
  }
}

run();
