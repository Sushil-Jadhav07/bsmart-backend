const test = require('node:test');
const assert = require('node:assert/strict');
const { haversineKm, placeFromUser, geoScore, containsPlace } = require('../../src/feed/geo');

const MUMBAI = { lat: 19.076, lng: 72.8777 };
const PUNE = { lat: 18.5204, lng: 73.8567 };

test('haversineKm: Mumbai to Pune is ~120 km', () => {
  const km = haversineKm(MUMBAI, PUNE);
  assert.ok(km > 110 && km < 130, `got ${km}`);
});

test('placeFromUser reads address, and falls back to the free-text location name', () => {
  assert.deepEqual(
    placeFromUser({ address: { city: 'Pune', state: 'Maharashtra', country: 'India' }, location: {} }),
    { lat: NaN, lng: NaN, city: 'pune', state: 'maharashtra', country: 'india' }
  );
  const fromName = placeFromUser({ address: {}, location: { name: 'Pune, Maharashtra, India', lat: 18.5, lng: 73.8 } });
  assert.equal(fromName.city, 'pune');
  assert.equal(fromName.state, 'maharashtra');
  assert.equal(fromName.country, 'india');
  assert.equal(fromName.lat, 18.5);
});

test('containsPlace matches whole words only', () => {
  assert.equal(containsPlace('Sunset at Goa beach', 'goa'), true);
  assert.equal(containsPlace('New goals for 2026', 'goa'), false);
});

test('geoScore ranks city > state > country > far, neutral when unknown', () => {
  const viewer = { city: 'pune', state: 'maharashtra', country: 'india' };
  assert.equal(geoScore(viewer, { city: 'pune', state: 'maharashtra', country: 'india' }), 1);
  assert.equal(geoScore(viewer, { city: 'mumbai', state: 'maharashtra', country: 'india' }), 0.7);
  assert.equal(geoScore(viewer, { city: 'delhi', state: 'delhi', country: 'india' }), 0.4);
  assert.equal(geoScore(viewer, { city: 'london', state: 'england', country: 'uk' }), 0.1);
  assert.equal(geoScore({}, { city: 'pune' }), 0.5);
  assert.equal(geoScore(viewer, null), 0.5);
  // A post tagged with the viewer's city counts as local even if the author lives elsewhere.
  assert.equal(geoScore(viewer, { city: 'delhi' }, 'Koregaon Park, Pune'), 1);
});

test('geoScore uses coordinates when both sides have them', () => {
  assert.equal(geoScore({ ...PUNE }, { lat: 18.53, lng: 73.85 }), 1);
  assert.equal(geoScore({ ...PUNE }, { ...MUMBAI }), 0.5);
});
