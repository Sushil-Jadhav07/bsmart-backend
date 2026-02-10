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
  const feed = await request('GET', '/posts/feed', null, token);
  console.log('Feed status:', feed.status);
  if (Array.isArray(feed.data)) {
    console.log('✅ Feed returns array without pagination keys. Count:', feed.data.length);
  } else {
    console.error('❌ Feed returned non-array payload:', feed.data);
    process.exit(1);
  }
}

run();
