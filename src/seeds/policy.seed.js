'use strict';

const Policy = require('../models/Policy');

const CHILD_SAFETY_CONTENT = `
<h1>Child Safety Standards</h1>
<p class="SmallNote">Last updated: 2026</p>

<h2>Our commitment</h2>
<p>B-Smart has zero tolerance for child sexual abuse and exploitation (CSAE) — including child sexual abuse material (CSAM), grooming, sextortion, and any content or behavior that endangers minors. This applies to every part of the platform: posts, reels, tweets, ads, chat/messages, profiles, and comments.</p>

<h2>Prohibited content and conduct</h2>
<ul>
  <li>Uploading, sharing, or linking to CSAM in any form</li>
  <li>Sexualizing minors in images, video, text, or AI-generated content</li>
  <li>Grooming, soliciting, or attempting to arrange contact with a minor for sexual purposes</li>
  <li>Sextortion or threats involving a minor's images</li>
  <li>Facilitating or promoting any of the above, including via chat or promoted content</li>
</ul>

<h2>Detection and enforcement</h2>
<p>Reported content is reviewed by our moderation team. Accounts and content found to violate this policy are removed and the associated accounts are permanently banned. Where legally required, we cooperate with law enforcement and report confirmed CSAM to the relevant national authority (e.g. NCMEC) and applicable child-protection agencies.</p>

<h2>How to report</h2>
<p>If you encounter content or behavior that endangers a child on B-Smart:</p>
<ul>
  <li>Use the in-app "Report" option on the post, reel, tweet, message, or profile</li>
  <li>Or email our Trust & Safety team directly at <a href="mailto:safety@bebsmart.in">safety@bebsmart.in</a></li>
</ul>
<p>Reports are reviewed promptly and confidentially. If a child is in immediate danger, contact your local law enforcement or emergency services first.</p>

<h2>Point of contact</h2>
<p>Trust & Safety team — <a href="mailto:safety@bebsmart.in">safety@bebsmart.in</a></p>
`.trim();

// Baseline policy types every deployment ships with. Admins can add more
// via POST /api/policies — this list only guarantees these always exist.
const DEFAULTS = [
  { type: 'terms',   title: 'Terms & Conditions' },
  { type: 'privacy', title: 'Privacy Policy' },
  { type: 'refund',  title: 'Refund Policy' },
  {
    type: 'child-safety-standards',
    title: 'Child Safety Standards',
    content: CHILD_SAFETY_CONTENT,
    status: 'published',
  },
];

async function seedPolicies() {
  for (const p of DEFAULTS) {
    await Policy.findOneAndUpdate(
      { type: p.type },
      {
        $setOnInsert: {
          type: p.type,
          title: p.title,
          content: p.content ?? '',
          status: p.status ?? 'draft',
          version: 1,
        },
      },
      { upsert: true, new: true }
    );
  }
  console.log('[seed] Policies seeded');
}

module.exports = seedPolicies;
