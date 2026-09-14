const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_CONFIG, sanitizeOverrides, mergeConfig } = require('../../src/feed/config');

test('sanitizeOverrides keeps valid values', () => {
  const { clean, errors } = sanitizeOverrides(DEFAULT_CONFIG, {
    surfaces: { home: { weights: { affinity: 0.4 }, sources: ['post', 'reel'] } },
    exploration: { rate: 0.1 },
    promotions: { timezoneOffsetMinutes: -300 },
  });
  assert.deepEqual(errors, []);
  assert.equal(clean.surfaces.home.weights.affinity, 0.4);
  assert.deepEqual(clean.surfaces.home.sources, ['post', 'reel']);
  assert.equal(clean.promotions.timezoneOffsetMinutes, -300);
});

test('sanitizeOverrides reports every invalid key', () => {
  const { clean, errors } = sanitizeOverrides(DEFAULT_CONFIG, {
    surfaces: {
      home: { weights: { affinity: -1 }, sources: ['ad'] },
      promotions: { sources: ['post'] },
      nope: {},
    },
    exploration: { rate: 2 },
    typo: 1,
    diversity: 'wide',
  });
  assert.deepEqual(clean, {});
  const joined = errors.join('\n');
  for (const fragment of [
    'surfaces.home.weights.affinity', 'surfaces.home.sources', 'surfaces.promotions.sources',
    'surfaces.nope', 'exploration.rate', 'typo', 'diversity',
  ]) {
    assert.ok(joined.includes(fragment), `missing error for ${fragment}`);
  }
});

test('mergeConfig deep-merges without mutating the defaults', () => {
  const merged = mergeConfig(DEFAULT_CONFIG, { surfaces: { buzz: { halfLifeHours: 6 } } });
  assert.equal(merged.surfaces.buzz.halfLifeHours, 6);
  assert.equal(merged.surfaces.buzz.weights.freshness, DEFAULT_CONFIG.surfaces.buzz.weights.freshness);
  assert.equal(DEFAULT_CONFIG.surfaces.buzz.halfLifeHours, 12);
});

test('every surface weight set is complete', () => {
  const terms = ['affinity', 'interest', 'freshness', 'engagement', 'quality', 'locale', 'semantic'];
  for (const [name, surface] of Object.entries(DEFAULT_CONFIG.surfaces)) {
    assert.deepEqual(Object.keys(surface.weights).sort(), terms.slice().sort(), name);
  }
});
