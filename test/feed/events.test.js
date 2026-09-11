const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEvents, interactionWeight } = require('../../src/feed/events');
const { EVENT_WEIGHTS, decaySignals, addSignal, emptySignals, inferLanguages } = require('../../src/feed/profile');

const ID = '665f1c2e9b1e8a0012345678';

test('validateEvents normalises good events and explains bad ones', () => {
  const { valid, rejected } = validateEvents([
    { item_id: ID, item_type: 'reel', event: 'view', surface: 'sparks', completion_pct: 140, position: '3', watch_ms: -5 },
    { item_id: ID, item_type: 'post', event: 'impression', surface: 'somewhere' },
    { item_id: 'not-an-id', item_type: 'post', event: 'like' },
    { item_id: '123456789012', item_type: 'post', event: 'like' }, // 12-char strings are not ids
    { item_id: ID, item_type: 'story', event: 'like' },
    { item_id: ID, item_type: 'post', event: 'teleport' },
    null,
  ]);
  assert.equal(valid.length, 2);
  assert.deepEqual(valid[0], {
    item_id: ID, item_type: 'reel', event: 'view', surface: 'sparks',
    position: 3, dwell_ms: null, watch_ms: 0, completion_pct: 100,
  });
  assert.equal(valid[1].surface, 'other');
  assert.deepEqual(rejected.map((r) => r.index), [2, 3, 4, 5, 6]);
});

test('interactionWeight scales dwell and view completion', () => {
  assert.equal(interactionWeight({ event: 'like' }), EVENT_WEIGHTS.like);
  assert.ok(interactionWeight({ event: 'hide' }) < 0);
  assert.ok(interactionWeight({ event: 'dwell', dwell_ms: 20000 }) > interactionWeight({ event: 'dwell', dwell_ms: 2000 }));
  assert.equal(interactionWeight({ event: 'dwell', dwell_ms: 10 * 60 * 1000 }), EVENT_WEIGHTS.dwell * 3);
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
