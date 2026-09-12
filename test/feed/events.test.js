const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEvents, interactionWeight } = require('../../src/feed/events');
const { EVENT_WEIGHTS, decaySignals, addSignal, emptySignals, inferLanguages } = require('../../src/feed/profile');

const ID = '665f1c2e9b1e8a0012345678';

test('validateEvents normalises client events and explains rejections', () => {
  const { valid, rejected } = validateEvents([
    { item_id: ID, item_type: 'reel', event: 'dwell', surface: 'sparks', completion_pct: 140, position: '3', dwell_ms: -5 },
    { item_id: ID, item_type: 'post', event: 'impression', surface: 'somewhere' },
    { item_id: 'not-an-id', item_type: 'post', event: 'impression' },
    { item_id: '123456789012', item_type: 'post', event: 'impression' }, // 12-char strings are not ids
    { item_id: ID, item_type: 'story', event: 'impression' },
    { item_id: ID, item_type: 'post', event: 'teleport' },
    null,
    { item_id: ID, item_type: 'post', event: 'click' },
  ]);
  assert.equal(valid.length, 3);
  assert.deepEqual(valid[0], {
    item_id: ID, item_type: 'reel', event: 'dwell', surface: 'sparks',
    position: 3, dwell_ms: 0, watch_ms: null, completion_pct: 100,
  });
  assert.equal(valid[1].surface, 'other');
  assert.deepEqual(rejected.map((r) => r.index), [2, 3, 4, 5, 6]);
});

test('the app may not send events the server records itself', () => {
  const serverOnly = ['like', 'comment', 'save', 'repost', 'complete', 'view'];
  const { valid, rejected } = validateEvents([
    ...serverOnly.map((event) => ({ item_id: ID, item_type: 'post', event })),
    { item_id: ID, item_type: 'ad', event: 'click' },
  ]);
  assert.equal(valid.length, 0);
  assert.equal(rejected.length, serverOnly.length + 1);
  assert.match(rejected[0].reason, /recorded by the server/);
  assert.match(rejected.at(-1).reason, /api\/ads\/:id\/click/);

  const server = validateEvents(serverOnly.map((event) => ({ item_id: ID, item_type: 'post', event })), { source: 'server' });
  assert.equal(server.valid.length, serverOnly.length);
});

test('interactionWeight scales dwell and completion, and undo reverses it', () => {
  assert.equal(interactionWeight({ event: 'like' }), EVENT_WEIGHTS.like);
  assert.equal(interactionWeight({ event: 'like', undo: true }), -EVENT_WEIGHTS.like);
  assert.equal(interactionWeight({ event: 'repost' }), EVENT_WEIGHTS.repost);
  assert.ok(interactionWeight({ event: 'hide' }) < 0);
  assert.ok(interactionWeight({ event: 'dwell', dwell_ms: 20000 }) > interactionWeight({ event: 'dwell', dwell_ms: 2000 }));
  assert.equal(interactionWeight({ event: 'dwell', dwell_ms: 10 * 60 * 1000 }), EVENT_WEIGHTS.dwell * 3);
  assert.ok(interactionWeight({ event: 'dwell', dwell_ms: 8000, completion_pct: 95 })
    > interactionWeight({ event: 'dwell', dwell_ms: 8000, completion_pct: 10 }));
  assert.ok(interactionWeight({ event: 'view', completion_pct: 90 }) > interactionWeight({ event: 'view', completion_pct: 10 }));
  assert.equal(interactionWeight({ event: 'impression' }), 0);
});

test('addSignal: negative feedback lowers topics and authors but not language', () => {
  const signals = emptySignals();
  const item = { type: 'post', authorId: 'a1', topics: ['politics'], language: 'en' };
  addSignal(signals, item, 2);
  addSignal(signals, item, -5);
  assert.equal(signals.interests.politics, -3);
  assert.equal(signals.authors.a1, -3);
  assert.equal(signals.languages.en, 2);
});

test('decaySignals halves weights after one half-life and drops tiny ones', () => {
  const now = Date.parse('2026-09-10T00:00:00Z');
  const since = new Date(now - 14 * 864e5);
  const decayed = decaySignals({ interests: { cricket: 4, lint: 0.015 } }, since, now, 14);
  assert.equal(decayed.interests.cricket, 2);
  assert.equal('lint' in decayed.interests, false);
});

test('inferLanguages keeps languages with at least 20% of the signal', () => {
  assert.deepEqual(inferLanguages({ hi: 10, en: 6, ta: 1 }), ['hi', 'en']);
  assert.deepEqual(inferLanguages({}), []);
});
