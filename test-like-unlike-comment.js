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
    email: 'like_unlike_comment@example.com',
    password: 'password123',
    username: 'like_unlike_comment_user',
    full_name: 'Like Unlike Comment'
  };
  let auth = await request('POST', '/auth/register', creds);
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email: creds.email, password: creds.password });
  }
  const token = auth.data.token;

  const createPost = await request('POST', '/posts', {
    caption: 'Post for comment like/unlike',
    type: 'post',
    media: [{ fileName: 'photo2.jpg', type: 'image' }]
  }, token);
  const postId = createPost.data._id || createPost.data.post_id;

  const addComment = await request('POST', `/posts/${postId}/comments`, { text: 'Nice!' }, token);
  const commentId = addComment.data._id || addComment.data.comment_id;

  const like = await request('POST', `/comments/${commentId}/like`, null, token);
  console.log('Comment Like:', like.data);
  if (like.data.likes_count !== 1) {
    console.error('❌ Comment like count should be 1');
    process.exit(1);
  }

  const unlike = await request('POST', `/comments/${commentId}/unlike`, null, token);
  console.log('Comment Unlike:', unlike.data);
  if (unlike.data.likes_count !== 0) {
    console.error('❌ Comment unlike did not decrement to 0');
    process.exit(1);
  }

  console.log('✅ Comment like/unlike counts correct');
}

run();
