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

async function registerOrLogin(email, username) {
  const password = 'password123';
  const full_name = 'Multi Likes User';
  let auth = await request('POST', '/auth/register', { email, password, username, full_name });
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email, password });
  }
  return auth.data.token;
}

async function run() {
  const suffix = Date.now();
  const emails = [
    `ml1_${suffix}@example.com`,
    `ml2_${suffix}@example.com`,
    `ml3_${suffix}@example.com`,
    `ml4_${suffix}@example.com`
  ];
  const usernames = [
    `ml1_${suffix}`,
    `ml2_${suffix}`,
    `ml3_${suffix}`,
    `ml4_${suffix}`
  ];

  const tokens = [];
  for (let i = 0; i < 4; i++) {
    const t = await registerOrLogin(emails[i], usernames[i]);
    tokens.push(t);
  }

  const createPost = await request('POST', '/posts', {
    caption: 'Multi likes post',
    type: 'post',
    media: [{ fileName: 'multi.jpg', type: 'image' }]
  }, tokens[0]);
  if (createPost.status !== 201) {
    console.error('❌ Failed to create post', createPost);
    process.exit(1);
  }
  const postId = createPost.data._id || createPost.data.post_id;

  for (let i = 0; i < 4; i++) {
    const likeRes = await request('POST', `/posts/${postId}/like`, null, tokens[i]);
    console.log(`Like ${i + 1}:`, likeRes.data);
    if (likeRes.status !== 200 || likeRes.data.likes_count !== i + 1) {
      console.error('❌ Like count mismatch after like', { expected: i + 1, got: likeRes.data.likes_count });
      process.exit(1);
    }
  }

  const unlikeRes = await request('POST', `/posts/${postId}/unlike`, null, tokens[2]);
  console.log('Unlike by user 3:', unlikeRes.data);
  if (unlikeRes.status !== 200 || unlikeRes.data.likes_count !== 3) {
    console.error('❌ Unlike did not produce count 3', unlikeRes);
    process.exit(1);
  }

  const likesList = await request('GET', `/posts/${postId}/likes`, null, tokens[0]);
  console.log('Likes list total:', likesList.data.total);
  if (likesList.status !== 200 || likesList.data.total !== 3) {
    console.error('❌ Likes total not 3 after unlike', likesList);
    process.exit(1);
  }

  console.log('✅ Multi-likes test passed: total likes is 3 after one unlike');
}

run();
