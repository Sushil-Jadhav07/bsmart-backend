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
    email: 'views_idem@example.com',
    password: 'password123',
    username: 'views_idem_user',
    full_name: 'Views Idem'
  };
  let auth = await request('POST', '/auth/register', creds);
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email: creds.email, password: creds.password });
  }
  const token = auth.data.token;

  // Create reel
  const createPost = await request('POST', '/posts', {
    caption: 'Idempotency Reel',
    type: 'reel',
    media: [{ fileName: 'idem-reel.mp4', type: 'video' }]
  }, token);
  const postId = createPost.data._id || createPost.data.post_id;

  // Start view
  await request('POST', '/views', { postId }, token);

  // Complete first time
  const first = await request('POST', '/views/complete', { postId, watchTimeMs: 30000 }, token);
  console.log('First complete:', first.data);
  const balance1 = first.data.walletBalance || 0;

  // Complete second time (should not add reward)
  const second = await request('POST', '/views/complete', { postId, watchTimeMs: 35000 }, token);
  console.log('Second complete:', second.data);
  const balance2 = second.data.walletBalance || 0;

  if (balance2 !== balance1) {
    console.error('❌ Idempotency failed: wallet increased on second completion', { balance1, balance2 });
    process.exit(1);
  } else {
    console.log('✅ Idempotency OK: wallet did not increase on second completion');
  }
}

run();
