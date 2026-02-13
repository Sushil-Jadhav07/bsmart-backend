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
  const owner = await register(`multi_owner_${ts}@example.com`, `multi_owner_${ts}`);
  const viewerA = await register(`multi_a_${ts}@example.com`, `multi_a_${ts}`);
  const viewerB = await register(`multi_b_${ts}@example.com`, `multi_b_${ts}`);

  // Create first story (A)
  const createA = await request('POST', '/stories', {
    items: [
      { media: { url: 'http://localhost:5000/uploads/a1.jpg', type: 'image' } }
    ]
  }, owner.token);
  if (createA.status !== 200) {
    console.error('❌ Create story A failed', createA);
    process.exit(1);
  }
  const storyIdA = createA.data.story._id;

  // Try to create another story while A is active -> should append to same story
  const append = await request('POST', '/stories', {
    items: [
      { media: { url: 'http://localhost:5000/uploads/a2.jpg', type: 'image' } }
    ]
  }, owner.token);
  if (append.status !== 200 || append.data.story._id !== storyIdA) {
    console.error('❌ Append did not reuse active story', append.data.story?._id, storyIdA);
    process.exit(1);
  }
  if (append.data.story.items_count < 2) {
    console.error('❌ items_count should reflect appended item', append.data.story.items_count);
    process.exit(1);
  }

  // Get items for story A
  const itemsA = await request('GET', `/stories/${storyIdA}/items`, null, owner.token);
  const itemIdA = itemsA.data[0]._id;

  // Views to story A
  await request('POST', `/stories/items/${itemIdA}/view`, null, viewerA.token);
  await request('POST', `/stories/items/${itemIdA}/view`, null, viewerB.token);

  // Feed shows views_count >= 2
  const feedA = await request('GET', '/stories/feed', null, owner.token);
  const feedItemA = (feedA.data || []).find(s => s._id === storyIdA);
  if (!feedItemA || feedItemA.views_count < 2) {
    console.error('❌ Feed views_count for A should be >= 2', feedItemA);
    process.exit(1);
  }

  // Delete story A
  const delA = await request('DELETE', `/stories/${storyIdA}`, null, owner.token);
  if (delA.status !== 200) {
    console.error('❌ Delete story A failed', delA);
    process.exit(1);
  }

  // Create new story (B) after deletion
  const createB = await request('POST', '/stories', {
    items: [
      { media: { url: 'http://localhost:5000/uploads/b1.jpg', type: 'image' } }
    ]
  }, owner.token);
  if (createB.status !== 200) {
    console.error('❌ Create story B failed', createB);
    process.exit(1);
  }
  const storyIdB = createB.data.story._id;
  if (storyIdB === storyIdA) {
    console.error('❌ Story B should be a new story after deletion');
    process.exit(1);
  }

  // View story B with viewerA only
  const itemsB = await request('GET', `/stories/${storyIdB}/items`, null, owner.token);
  const itemIdB = itemsB.data[0]._id;
  await request('POST', `/stories/items/${itemIdB}/view`, null, viewerA.token);

  // Check views counts for B
  const feedB = await request('GET', '/stories/feed', null, owner.token);
  const feedItemB = (feedB.data || []).find(s => s._id === storyIdB);
  if (!feedItemB || feedItemB.views_count < 1) {
    console.error('❌ Feed views_count for B should be >= 1', feedItemB);
    process.exit(1);
  }
  const viewsB = await request('GET', `/stories/${storyIdB}/views`, null, owner.token);
  if (viewsB.status !== 200 || viewsB.data.unique_viewers < 1) {
    console.error('❌ Unique viewers for B should be >= 1', viewsB);
    process.exit(1);
  }

  // Delete story B
  const delB = await request('DELETE', `/stories/${storyIdB}`, null, owner.token);
  if (delB.status !== 200) {
    console.error('❌ Delete story B failed', delB);
    process.exit(1);
  }

  console.log('✅ Multiple stories per user verified: append on active; new after delete; views counted; deletion works');
}

run();
