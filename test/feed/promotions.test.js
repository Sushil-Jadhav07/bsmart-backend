const test = require('node:test');
const assert = require('node:assert/strict');
const {
  matchGeoTargeting, matchAge, matchGender, languageFit, inDeliveryWindow, budgetFactor,
} = require('../../src/feed/promotions');
const { DEFAULT_CONFIG } = require('../../src/feed/config');

const PUNE_VIEWER = { city: 'pune', state: 'maharashtra', country: 'india' };

test('matchGeoTargeting', () => {
  assert.equal(matchGeoTargeting({ targeting: {} }, PUNE_VIEWER), null);
  assert.equal(matchGeoTargeting({ targeting: { cities: ['Pune'] } }, PUNE_VIEWER), true);
  assert.equal(matchGeoTargeting({ targeting: { states: ['Maharashtra'] } }, PUNE_VIEWER), true);
  assert.equal(matchGeoTargeting({ targeting: { cities: ['Delhi'] } }, PUNE_VIEWER), false);
  assert.equal(matchGeoTargeting({ target_location: ['India'] }, PUNE_VIEWER), true);
  // Unknown viewer location never excludes.
  assert.equal(matchGeoTargeting({ targeting: { cities: ['Delhi'] } }, { lat: 1, lng: 2 }), null);
});

test('matchAge treats the schema default 13–65 as untargeted', () => {
  assert.equal(matchAge({ targeting: { age_min: 13, age_max: 65 } }, 70), true);
  assert.equal(matchAge({ targeting: { age_min: 18, age_max: 24 } }, 30), false);
  assert.equal(matchAge({ targeting: { age_min: 18, age_max: 24 } }, 20), true);
  assert.equal(matchAge({ targeting: { age_min: 18, age_max: 24 } }, null), true);
});

test('matchGender', () => {
  assert.equal(matchGender({ targeting: { gender: 'all' } }, 'male'), true);
  assert.equal(matchGender({ targeting: { gender: 'female' } }, 'Male'), false);
  assert.equal(matchGender({ targeting: { gender: 'female' } }, 'female'), true);
  assert.equal(matchGender({ targeting: { gender: 'female' } }, ''), true);
});

test('languageFit is soft', () => {
  assert.equal(languageFit({ target_language: [] }, ['hi']), 1);
  assert.equal(languageFit({ target_language: ['Hindi'] }, ['hi']), 1);
  assert.equal(languageFit({ target_language: ['hi'] }, ['hi-Latn']), 1);
  assert.equal(languageFit({ target_language: ['ta'] }, ['hi']), 0.5);
  assert.equal(languageFit({ target_language: ['ta'] }, []), 1);
});

test('inDeliveryWindow respects day and time in the configured timezone', () => {
  // 2026-09-10 is a Thursday. 06:00 UTC = 11:30 IST.
  const now = Date.parse('2026-09-10T06:00:00Z');
  const ist = 330;
  const slot = (day, start, end) => ({ scheduling: { delivery_time_slots: [{ day_of_week: day, start_time: start, end_time: end }] } });
  assert.equal(inDeliveryWindow({ scheduling: { delivery_time_slots: [] } }, now, ist), true);
  assert.equal(inDeliveryWindow(slot('thursday', '09:00', '13:00'), now, ist), true);
  assert.equal(inDeliveryWindow(slot('thursday', '14:00', '18:00'), now, ist), false);
  assert.equal(inDeliveryWindow(slot('friday', '09:00', '13:00'), now, ist), false);
  assert.equal(inDeliveryWindow(slot('thursday', '22:00', '12:00'), now, ist), true); // overnight slot
});

test('budgetFactor', () => {
  const cfg = DEFAULT_CONFIG.promotions;
  assert.equal(budgetFactor({ total_budget_coins: 100, total_coins_spent: 20 }, cfg), 1);
  assert.equal(budgetFactor({ total_budget_coins: 0, total_coins_spent: 0 }, cfg), 1);
  assert.equal(budgetFactor({ total_budget_coins: 100, total_coins_spent: 100 }, cfg), cfg.exhaustedBudgetFactor);
  assert.equal(budgetFactor({ total_budget_coins: 100, total_coins_spent: 100, budget: { auto_stop_on_budget_exhausted: true } }, cfg), 0);
});
