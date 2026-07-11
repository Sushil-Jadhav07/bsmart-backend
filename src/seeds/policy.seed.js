'use strict';

const Policy = require('../models/Policy');

// Baseline policy types every deployment ships with. Admins can add more
// via POST /api/policies — this list only guarantees these 3 always exist.
const DEFAULTS = [
  { type: 'terms',   title: 'Terms & Conditions' },
  { type: 'privacy', title: 'Privacy Policy' },
  { type: 'refund',  title: 'Refund Policy' },
];

async function seedPolicies() {
  for (const p of DEFAULTS) {
    await Policy.findOneAndUpdate(
      { type: p.type },
      { $setOnInsert: { ...p, content: '', status: 'draft', version: 1 } },
      { upsert: true, new: true }
    );
  }
  console.log('[seed] Policies seeded');
}

module.exports = seedPolicies;
