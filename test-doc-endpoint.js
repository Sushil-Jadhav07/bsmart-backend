const http = require('http');

function request(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path,
      method: 'GET'
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  const res = await request('/api/docs/full');
  if (res.status !== 200 || !res.data.includes('B-Smart Backend API Documentation')) {
    console.error('❌ Docs endpoint failed', res.status);
    process.exit(1);
  }
  console.log('✅ Docs endpoint serves FULL_API_DOCUMENTATION.md');
}

run();
