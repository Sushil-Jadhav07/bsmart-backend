const test = require('node:test');
const assert = require('node:assert/strict');
const { diversify, injectExploration, interleave } = require('../../src/feed/rerank');

const item = (key, authorId, type = 'post', topic = key) => ({ key, authorId, type, topics: [topic] });
const keys = (list) => list.map((i) => i.key);

test('diversify defers a third item from the same author', () => {
  const ranked = [item('a1', 'a'), item('a2', 'a'), item('a3', 'a'), item('b1', 'b')];
  assert.deepEqual(keys(diversify(ranked, { window: 10, maxPerAuthor: 2 })), ['a1', 'a2', 'b1', 'a3']);
});

test('diversify never drops items, even when nothing fits', () => {
  const ranked = [item('a1', 'a'), item('a2', 'a'), item('a3', 'a')];
  assert.deepEqual(keys(diversify(ranked, { maxPerAuthor: 1 })), ['a1', 'a2', 'a3']);
});

test('diversify limits consecutive items of the same format', () => {
  const ranked = [
    item('r1', 'a', 'reel'), item('r2', 'b', 'reel'), item('r3', 'c', 'reel'),
    item('r4', 'd', 'reel'), item('t1', 'e', 'tweet'),
  ];
  const out = keys(diversify(ranked, { maxPerAuthor: 5, maxConsecutiveType: 3 }));
  assert.deepEqual(out, ['r1', 'r2', 'r3', 't1', 'r4']);
});

test('diversify limits a repeated topic inside the window', () => {
  const ranked = [
    item('c1', 'a', 'post', 'cricket'), item('c2', 'b', 'post', 'cricket'),
    item('c3', 'c', 'post', 'cricket'), item('f1', 'd', 'post', 'food'),
  ];
  assert.deepEqual(keys(diversify(ranked, { maxPerAuthor: 5, maxPerTopic: 2 })), ['c1', 'c2', 'f1', 'c3']);
});

test('injectExploration fills every Nth slot from the pool without duplicates', () => {
  const ranked = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((k) => item(k, k));
  const pool = [item('e1', 'x'), item('r2', 'r2'), item('e2', 'y')];
  const out = injectExploration(ranked, pool, 0.25);
  assert.deepEqual(keys(out), ['r1', 'r2', 'r3', 'e1', 'r4', 'r5', 'r6', 'e2']);
  assert.equal(new Set(keys(out)).size, out.length);
  assert.equal(out[3].exploration, true);
});

test('injectExploration is a no-op with rate 0 or an empty pool', () => {
  const ranked = [item('r1', 'a'), item('r2', 'b')];
  assert.deepEqual(keys(injectExploration(ranked, [item('e1', 'x')], 0)), ['r1', 'r2']);
  assert.deepEqual(keys(injectExploration(ranked, [], 0.2)), ['r1', 'r2']);
});

test('interleave places the first promotion after firstSlot, then every N', () => {
  const organic = Array.from({ length: 12 }, (_, i) => item(`o${i + 1}`, `a${i}`));
  const promos = [item('p1', 'v1', 'ad'), item('p2', 'v2', 'ad'), item('p3', 'v3', 'ad')];
  const out = keys(interleave(organic, promos, { every: 5, firstSlot: 3 }));
  // After organic items 3 and 8; the next slot (13) is past the end of the list.
  assert.equal(out.indexOf('p1'), 3);
  assert.equal(out.indexOf('p2'), 9);
  assert.equal(out.length, 14);
  assert.deepEqual(keys(interleave(organic, [], { every: 5, firstSlot: 3 })), keys(organic));
});
