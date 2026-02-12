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
    email: 'vendor_views@example.com',
    password: 'password123',
    username: 'vendor_views_user',
    full_name: 'Vendor Views',
    role: 'vendor'
  };
  let auth = await request('POST', '/auth/register', creds);
  if (!auth.data || !auth.data.token) {
    auth = await request('POST', '/auth/login', { email: creds.email, password: creds.password });
  }
  const token = auth.data.token;

  const meBefore = await request('GET', '/auth/me', null, token);
  const beforeBalance = (meBefore.data.wallet && meBefore.data.wallet.balance) ? meBefore.data.wallet.balance : 0;
  console.log('Vendor wallet before:', beforeBalance);

  const createPost = await request('POST', '/posts', {
    caption: 'Vendor Reel',
    type: 'reel',
    media: [{ fileName: 'vendor-reel.mp4', type: 'video' }]
  }, token);
  if (createPost.status !== 201) {
    console.error('❌ Failed to create reel', createPost);
    process.exit(1);
  }
  const postId = createPost.data._id || createPost.data.post_id;

  const startView = await request('POST', '/views', { postId }, token);
  if (startView.status !== 200) {
    console.error('❌ Failed to start view', startView);
    process.exit(1);
  }
  console.log('Start view:', startView.data);

  const completeView = await request('POST', '/views/complete', { postId, watchTimeMs: 30000 }, token);
  if (completeView.status !== 200) {
    console.error('❌ Failed to complete view', completeView);
    process.exit(1);
  }
  console.log('Complete view:', completeView.data);

  const afterBalance = completeView.data.walletBalance ?? null;
  if (afterBalance === null) {
    console.error('❌ No walletBalance returned');
    process.exit(1);
  }
  if (afterBalance < beforeBalance + 20) {
    console.error('❌ Wallet did not increase by +20', { beforeBalance, afterBalance });
    process.exit(1);
  }
  console.log('✅ Vendor wallet increased by +20:', { beforeBalance, afterBalance });
}

run();
