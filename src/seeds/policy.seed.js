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
  <li>Or email our Trust & Safety team directly at <a href="mailto:info@ruvees.in">info@ruvees.in</a></li>
</ul>
<p>Reports are reviewed promptly and confidentially. If a child is in immediate danger, contact your local law enforcement or emergency services first.</p>

<h2>Point of contact</h2>
<p>Trust & Safety team — <a href="mailto:info@ruvees.in">info@ruvees.in</a></p>
`.trim();

const SUPPORT_CONTENT = `
<h1>Support</h1>
<p>Need help with your B-Smart account, a post, a payment, or anything else on the platform? We're here to help.</p>

<h2>Contact us</h2>
<p>Email our support team at <a href="mailto:info@ruvees.in">info@ruvees.in</a> and we'll get back to you as soon as possible.</p>

<h2>Common topics</h2>
<ul>
  <li>Account access and login issues</li>
  <li>Reporting a post, reel, message, or user</li>
  <li>Wallet, coins, and payment questions</li>
  <li>Vendor ads and promotions</li>
  <li>Data access, correction, or deletion requests</li>
</ul>
<p>You can also reach these tools directly from the app under Settings.</p>
`.trim();

const GUIDES_CONTENT = `
<h1>Guides</h1>
<p>New to B-Smart? Here's how to get the most out of the platform.</p>

<h2>Getting started</h2>
<ul>
  <li>Complete your profile so people and vendors can find you</li>
  <li>Follow vendors and creators you're interested in</li>
  <li>Share your first post, reel, or tweet</li>
</ul>

<h2>For members</h2>
<ul>
  <li>Use Search to discover new vendors and content</li>
  <li>Message sellers directly from their profile or a product</li>
  <li>Track your wallet and coins under Settings → Wallet</li>
</ul>

<h2>For vendors</h2>
<ul>
  <li>Set up your vendor profile and add your first ad</li>
  <li>Promote a post to reach more customers</li>
  <li>Check Analytics to see how your ads are performing</li>
</ul>

<p>Still stuck? Reach out at <a href="mailto:info@ruvees.in">info@ruvees.in</a>.</p>
`.trim();

const MARKETING_CONTENT = `
<h1>B-Smart | Connect & Grow</h1>
<p>B-Smart is a social commerce platform that brings members and vendors together in one place — connect, share, promote, and grow your business.</p>

<h2>What you can do on B-Smart</h2>
<ul>
  <li>Share posts, reels, and tweets with your community</li>
  <li>Discover and follow vendors and creators</li>
  <li>Promote products and ads to reach new customers</li>
  <li>Chat directly with buyers, sellers, and followers</li>
  <li>Manage your wallet, coins, and transactions in one place</li>
</ul>

<h2>Get in touch</h2>
<p>For partnerships or media inquiries, reach out at <a href="mailto:info@ruvees.in">info@ruvees.in</a>.</p>
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
  {
    type: 'support',
    title: 'Support',
    content: SUPPORT_CONTENT,
    status: 'published',
  },
  {
    type: 'marketing',
    title: 'B-Smart | Connect & Grow',
    content: MARKETING_CONTENT,
    status: 'published',
  },
  {
    type: 'guides',
    title: 'Guides',
    content: GUIDES_CONTENT,
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
