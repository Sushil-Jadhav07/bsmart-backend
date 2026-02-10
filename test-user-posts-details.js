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
  const userId = auth.data.user ? auth.data.user.id : null;

  if (!userId) {
    console.error('No user id available');
    process.exit(1);
  }

  const resp = await request('GET', `/users/${userId}/posts`, null, token);
  console.log('Status:', resp.status);
  if (!Array.isArray(resp.data)) {
    console.error('Expected array of posts');
    process.exit(1);
  }
  console.log('Posts count:', resp.data.length);
  if (resp.data[0]) {
    console.log('First post comments:', resp.data[0].comments ? resp.data[0].comments.length : 0);
    console.log('First post likes_count:', resp.data[0].likes_count);
  }
}

run();
