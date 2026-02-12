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
    email: 'views_test@example.com',
    password: 'password123',
    username: 'views_test_user',
    full_name: 'Views Tester'
  };
  let auth = await request('POST', '/auth/register', creds);
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email: creds.email, password: creds.password });
  }
  const token = auth.data.token;

  const createPost = await request('POST', '/posts', {
    caption: 'Reel to view',
    type: 'reel',
    media: [{ fileName: 'reel-video.mp4', type: 'video' }]
  }, token);
  console.log('Create status:', createPost.status);
  const postId = createPost.data._id || createPost.data.post_id;

  const v1 = await request('POST', '/views', { postId }, token);
  console.log('Views after start:', v1.data);

  const v2 = await request('POST', '/views/complete', { postId, watchTimeMs: 30000 }, token);
  console.log('Complete response:', v2.data);
}

run();
