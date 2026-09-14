const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { aiServiceConfigured, fetchSimilarItems, fetchSemanticScores, resetAiClient } = require('../../src/feed/aiClient');

// A stand-in AI service whose behaviour each test chooses.
const startService = async (handler) => {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => handler(req, res, body ? JSON.parse(body) : null));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
};

const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

test('without AI_SERVICE_URL nothing is called', async () => {
  delete process.env.AI_SERVICE_URL;
  resetAiClient();
  assert.equal(aiServiceConfigured(), false);
  assert.deepEqual(await fetchSimilarItems('u1', { k: 5, types: ['post'], sinceDays: 30, timeoutMs: 100 }), []);
  assert.equal(await fetchSemanticScores('u1', ['a'], 100), null);
});

test('sends the token and parses results', async (t) => {
  const seen = [];
  const { server, url } = await startService((req, res, body) => {
    seen.push({ path: req.url, token: req.headers['x-ai-token'], body });
    if (req.url === '/v1/candidates') return json(res, 200, { items: [{ item_id: 'p1', item_type: 'post', score: 0.9 }], has_profile: true });
    return json(res, 200, { scores: { p1: 0.9, p2: 0.2 }, has_profile: true });
  });
  t.after(() => server.close());
  process.env.AI_SERVICE_URL = `${url}/`;
  process.env.AI_SERVICE_TOKEN = 'secret';
  resetAiClient();

  const items = await fetchSimilarItems('u1', { k: 5, types: ['post'], excludeAuthorIds: ['a1'], sinceDays: 30, timeoutMs: 500 });
  assert.deepEqual(items, [{ item_id: 'p1', item_type: 'post', score: 0.9 }]);
  const scores = await fetchSemanticScores('u1', ['p1', 'p2'], 500);
  assert.equal(scores.get('p1'), 0.9);
  assert.deepEqual(seen[0], {
    path: '/v1/candidates',
    token: 'secret',
    body: { user_id: 'u1', k: 5, types: ['post'], exclude_author_ids: ['a1'], since_days: 30 },
  });
});

test('a user without history gives no scores', async (t) => {
  const { server, url } = await startService((req, res) => json(res, 200, { scores: {}, has_profile: false }));
  t.after(() => server.close());
  process.env.AI_SERVICE_URL = url;
  resetAiClient();
  assert.equal(await fetchSemanticScores('u1', ['p1'], 500), null);
});

test('slow or failing service: time out, then pause after repeated failures', async (t) => {
  let calls = 0;
  const { server, url } = await startService((req, res) => {
    calls += 1;
    if (calls === 1) return setTimeout(() => json(res, 200, { items: [] }), 300); // too slow
    return json(res, 500, { detail: 'boom' });
  });
  t.after(() => server.close());
  process.env.AI_SERVICE_URL = url;
  resetAiClient();
  const originalWarn = console.warn;
  console.warn = () => {};
  t.after(() => { console.warn = originalWarn; });

  const opts = { k: 5, types: ['post'], sinceDays: 30, timeoutMs: 50 };
  assert.deepEqual(await fetchSimilarItems('u1', opts), []); // timeout
  assert.deepEqual(await fetchSimilarItems('u1', opts), []); // 500
  assert.deepEqual(await fetchSimilarItems('u1', opts), []); // 500 → pause
  const before = calls;
  assert.deepEqual(await fetchSimilarItems('u1', opts), []);
  assert.equal(calls, before, 'no request while paused');
  resetAiClient();
  delete process.env.AI_SERVICE_URL;
});
