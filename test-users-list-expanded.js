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
  const u = await register(`exp_${ts}@example.com`, `exp_${ts}`);
  const token = u.token;
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

  const commentRes = await request('POST', `/posts/${postId}/comments`, { text: 'nice' }, token);
  if (commentRes.status !== 201) {
    console.error('❌ Comment add failed', commentRes);
    process.exit(1);
  }

  const likeRes = await request('POST', `/posts/${postId}/like`, null, token);
  if (likeRes.status !== 200) {
    console.error('❌ Like failed', likeRes);
    process.exit(1);
  }

  const reelRes = await request('POST', '/posts', {
    caption: 'reel',
    media: [{ fileName: `r_${ts}.mp4`, type: 'video' }],
    type: 'reel'
  }, token);
  const reelId = reelRes.data._id || reelRes.data.post_id;
  await request('POST', '/views', { postId: reelId }, token);
  await request('POST', '/views/complete', { postId: reelId, watchTimeMs: 12000 }, token);

  const list = await request('GET', '/users', null, token);
  if (list.status !== 200 || !Array.isArray(list.data)) {
    console.error('❌ Users list expanded failed', list);
    process.exit(1);
  }
  const me = list.data.find(item => item.user && item.user.username === `exp_${ts}`);
  if (!me) {
    console.error('❌ Missing user block', list.data.slice(0, 3));
    process.exit(1);
  }
  if (!Array.isArray(me.posts) || me.summary.posts_count < 2) {
    console.error('❌ Posts not aggregated', me);
    process.exit(1);
  }
  console.log('✅ Expanded users list returns posts/comments/likes/views/reels');
}

run();
