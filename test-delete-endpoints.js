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
  console.log('--- Delete Endpoints Test ---');
  // 1) Auth
  const creds = {
    email: 'delete_test@example.com',
    password: 'password123',
    username: 'delete_test_user',
    full_name: 'Delete Tester'
  };
  let auth = await request('POST', '/auth/register', creds);
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email: creds.email, password: creds.password });
  }
  if (!auth.data || !auth.data.token) {
    console.error('❌ Auth failed', auth);
    process.exit(1);
  }
  const token = auth.data.token;
  const userId = auth.data.user ? auth.data.user.id : null;
  console.log('Authenticated. User ID:', userId);

  // 2) Create a post
  const createPost = await request('POST', '/posts', {
    caption: 'Delete me',
    media: [{ fileName: 'delete-me.jpg', type: 'image' }]
  }, token);
  if (createPost.status !== 201) {
    console.error('❌ Failed to create post', createPost);
    process.exit(1);
  }
  const postId = createPost.data._id || createPost.data.post_id;
  console.log('Post created:', postId);

  // 3) Add a comment to the post
  const addComment = await request('POST', `/posts/${postId}/comments`, {
    text: 'Comment to delete'
  }, token);
  if (addComment.status !== 201) {
    console.error('❌ Failed to add comment', addComment);
    process.exit(1);
  }
  const commentId = addComment.data._id || addComment.data.comment_id;
  console.log('Comment added:', commentId);

  // 4) Delete the comment
  const delComment = await request('DELETE', `/comments/${commentId}`, null, token);
  if (delComment.status !== 200) {
    console.error('❌ Delete comment failed', delComment);
    process.exit(1);
  }
  console.log('✅ Comment deleted');

  // verify comment not found in list
  const comments = await request('GET', `/posts/${postId}/comments`, null, token);
  const found = Array.isArray(comments.data) && comments.data.some(c => (c._id || c.comment_id) === commentId);
  if (found) {
    console.error('❌ Comment still present after delete');
    process.exit(1);
  }
  console.log('✅ Comment absent in list');

  // 5) Delete the post
  const delPost = await request('DELETE', `/posts/${postId}`, null, token);
  if (delPost.status !== 200) {
    console.error('❌ Delete post failed', delPost);
    process.exit(1);
  }
  console.log('✅ Post deleted');

  // verify post 404
  const getPost = await request('GET', `/posts/${postId}`, null, token);
  if (getPost.status !== 404) {
    console.error('❌ Post still accessible after delete', getPost);
    process.exit(1);
  }
  console.log('✅ Post returns 404 after delete');

  // 6) Delete the user
  if (userId) {
    const delUser = await request('DELETE', `/users/${userId}`, null, token);
    if (delUser.status !== 200) {
      console.error('❌ Delete user failed', delUser);
      process.exit(1);
    }
    console.log('✅ User deleted');

    const getUser = await request('GET', `/users/${userId}`, null, token);
    if (getUser.status !== 404) {
      console.error('❌ User still accessible after delete', getUser);
      process.exit(1);
    }
    console.log('✅ User returns 404 after delete');
  }

  console.log('--- All delete endpoints passed ---');
}

run();
