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
  const a = await register(`save_${ts}@example.com`, `save_${ts}`);
  const token = a.token;
  const postRes = await request('POST', '/posts', {
    caption: 'hello',
    media: [{ fileName: `f_${ts}.jpg`, type: 'image' }],
    type: 'post'
  }, token);
  if (postRes.status !== 201) {
    console.error('❌ Post create failed', postRes);
    process.exit(1);
  }
  const postId = postRes.data._id || postRes.data.post_id;

  const saveRes = await request('POST', `/posts/${postId}/save`, null, token);
  if (saveRes.status !== 200 || !saveRes.data.saved) {
    console.error('❌ Save failed', saveRes);
    process.exit(1);
  }

  const listRes = await request('GET', `/users/${a.user?._id || a._id || a.userId}/saved`, null, token);
  if (listRes.status !== 200 || !Array.isArray(listRes.data) || listRes.data.length < 1) {
    console.error('❌ Saved list failed', listRes);
    process.exit(1);
  }

  const unsaveRes = await request('POST', `/posts/${postId}/unsave`, null, token);
  if (unsaveRes.status !== 200 || !unsaveRes.data.unsaved) {
    console.error('❌ Unsave failed', unsaveRes);
    process.exit(1);
  }

  const listRes2 = await request('GET', `/users/${a.user?._id || a._id || a.userId}/saved`, null, token);
  if (!Array.isArray(listRes2.data) || listRes2.data.some(p => (p._id || p.post_id) === postId)) {
    console.error('❌ Unsave not reflected', listRes2.data);
    process.exit(1);
  }
  console.log('✅ Save Post API works');
}

run();
