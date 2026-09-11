// End-to-end tests for /api/feed against an in-memory MongoDB.
// Needs two tools that are not project dependencies:
//   npm install --no-save mongodb-memory-server supertest
// Without them this file is skipped.

const test = require('node:test');
const assert = require('node:assert/strict');

let MongoMemoryServer;
let request;
try {
  ({ MongoMemoryServer } = require('mongodb-memory-server'));
  request = require('supertest');
} catch (_) {
  // optional test tooling not installed
}

const skip = MongoMemoryServer && request
  ? false
  : 'run `npm install --no-save mongodb-memory-server supertest` to enable';

test('personalized feed API', { skip, timeout: 120000 }, async (t) => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'feed-integration-secret';

  const mongoose = require('mongoose');
  const jwt = require('jsonwebtoken');
  const express = require('express');
  const User = require('../../src/models/User');
  const Post = require('../../src/models/Post');
  const Tweet = require('../../src/models/tweet.model');
  const Ad = require('../../src/models/Ad');
  const PromoteReel = require('../../src/models/PromoteReel');
  const Follow = require('../../src/models/Follow');
  const Block = require('../../src/models/Block');
  const Mute = require('../../src/models/Mute');
  const FeedEvent = require('../../src/models/FeedEvent');
  const FeedItemStats = require('../../src/models/FeedItemStats');
  const FeedProfile = require('../../src/models/FeedProfile');

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  t.after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  const app = express();
  app.use(express.json());
  app.use('/api/feed', require('../../src/routes/feed.routes'));
  app.use('/api/posts', require('../../src/routes/post.routes'));

  // ─── Seed ────────────────────────────────────────────────────────────────
  const now = Date.now();
  const ago = (hours) => new Date(now - hours * 3.6e6);
  const make = async (Model, data, createdAt) => {
    const doc = await Model.create(data);
    if (createdAt) await Model.collection.updateOne({ _id: doc._id }, { $set: { createdAt, updatedAt: createdAt } });
    return doc;
  };
  const address = (city, state) => ({ city, state, country: 'India' });

  const u = {};
  const user = async (username, extra = {}) => {
    u[username] = await User.create({ email: `${username}@test.dev`, username, ...extra });
  };
  await user('viewer', { gender: 'male', age: 28, address: address('Pune', 'Maharashtra'), ad_interests: ['Sports & Fitness'] });
  await user('admin', { role: 'admin', address: address('Pune', 'Maharashtra') });
  await user('friend', { address: address('Mumbai', 'Maharashtra'), followers_count: 50 });
  await user('local', { address: address('Pune', 'Maharashtra') });
  await user('far', { address: address('Delhi', 'Delhi') });
  await user('blocked', { address: address('Pune', 'Maharashtra') });
  await user('blocker', { address: address('Pune', 'Maharashtra') });
  await user('muted', { address: address('Pune', 'Maharashtra') });
  await user('private', { isPrivate: true, address: address('Pune', 'Maharashtra') });
  await user('banned', { is_active: false, address: address('Pune', 'Maharashtra') });
  await user('hindi', { address: address('Delhi', 'Delhi') });
  await user('english', { address: address('Delhi', 'Delhi') });
  await user('vendor', { role: 'vendor', address: address('Mumbai', 'Maharashtra') });
  await user('vendor2', { role: 'vendor' });
  for (let i = 1; i <= 6; i++) await user(`filler${i}`, { address: address('Chennai', 'Tamil Nadu') });

  await Follow.create({ follower_id: u.viewer._id, followed_id: u.friend._id });
  await Block.create({ blocker_id: u.viewer._id, blocked_id: u.blocked._id });
  await Block.create({ blocker_id: u.blocker._id, blocked_id: u.viewer._id });
  await Mute.create({ muter_id: u.viewer._id, muted_id: u.muted._id });

  const image = [{ fileName: 'photo.jpg', type: 'image' }];
  const video = [{ fileName: 'clip.mp4', type: 'video' }];
  const post = (author, caption, hours, extra = {}) =>
    make(Post, { user_id: author._id, caption, media: image, type: 'post', ...extra }, ago(hours));
  const reel = (author, caption, hours, extra = {}) =>
    make(Post, { user_id: author._id, caption, media: video, type: 'reel', ...extra }, ago(hours));
  const tweet = (author, content, hours, extra = {}) =>
    make(Tweet, { author: author._id, content, ...extra }, ago(hours));

  const p = {};
  p.friend = await post(u.friend, 'Weekend getaway #travel', 2);
  p.far = await post(u.far, 'Weekend getaway #travel', 2);
  p.local = await post(u.local, 'Monsoon evening', 3, { location: 'Koregaon Park, Pune' });
  p.cricket = await post(u.far, 'What a finish #cricket', 5);
  p.likedOld = await post(u.far, 'Classic innings #cricket', 24 * 10, { likes: [u.viewer._id], likes_count: 1 });
  p.own = await post(u.viewer, 'My day', 4);
  p.deleted = await post(u.local, 'Removed', 1, { isDeleted: true });
  for (const name of ['blocked', 'blocker', 'muted', 'private', 'banned']) {
    p[name] = await post(u[name], 'Hot take', 1, { likes_count: 500 });
  }
  for (let i = 1; i <= 6; i++) p[`filler${i}`] = await post(u[`filler${i}`], `Filler post ${i}`, 6 + i);

  const r = {};
  r.friend = await reel(u.friend, 'Street food #food', 3);
  r.far = await reel(u.far, 'Momos tour #food', 3);
  r.blocked = await reel(u.blocked, 'Blocked reel', 1, { likes_count: 500 });

  const tw = {};
  tw.hi = await tweet(u.hindi, 'आज का मैच बहुत शानदार था', 1);
  tw.en = await tweet(u.english, 'Today the match was really amazing', 1);
  tw.friend = await tweet(u.friend, 'Hello from Mumbai', 2);
  tw.followersOnly = await tweet(u.friend, 'Only for my followers', 2, { audience: 'followers' });
  tw.strangerFollowersOnly = await tweet(u.far, 'Followers only', 2, { audience: 'followers' });
  tw.blocked = await tweet(u.blocked, 'Blocked tweet', 1);
  tw.reply = await tweet(u.far, 'A reply', 1, { parentTweet: tw.friend._id, rootTweet: tw.friend._id });

  const ad = (owner, extra = {}) => make(Ad, {
    vendor_id: new mongoose.Types.ObjectId(),
    user_id: owner._id,
    ad_type: 'general',
    category: 'Sports & Fitness',
    media: [{ fileName: 'ad.mp4', media_type: 'video' }],
    status: 'active',
    ...extra,
  });
  const a = {};
  a.pune = await ad(u.vendor, { ad_title: 'Pune marathon gear', targeting: { cities: ['Pune'] } });
  a.general = await ad(u.vendor2, { ad_title: 'Home decor sale', category: 'Home & Kitchen' });
  a.delhi = await ad(u.vendor, { ad_title: 'Delhi only', targeting: { cities: ['Delhi'] } });
  a.female = await ad(u.vendor2, { ad_title: 'For women', targeting: { gender: 'female' } });
  a.young = await ad(u.vendor2, { ad_title: 'Students', targeting: { age_min: 18, age_max: 24 } });
  a.paused = await ad(u.vendor, { status: 'paused' });
  a.expired = await ad(u.vendor2, { budget: { end_date: ago(48) } });
  a.blocked = await ad(u.blocked);
  const promo = await make(PromoteReel, { user_id: u.vendor2._id, caption: 'New sneakers #running', media: [{ fileName: 'promo.mp4', type: 'video' }] });

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const token = (who) => `Bearer ${jwt.sign({ id: String(who._id) }, process.env.JWT_SECRET)}`;
  const get = (path, who = u.viewer) => request(app).get(path).set('Authorization', token(who));
  const send = (method, path, body, who = u.viewer) => request(app)[method](path).set('Authorization', token(who)).send(body);
  const ids = (res) => res.body.data.map((item) => String(item._id));
  const authorOf = (item) => String(item.user_id?._id || item.author?._id || '');
  const id = (doc) => String(doc._id);

  // ─── Tests ───────────────────────────────────────────────────────────────
  await t.test('rejects an unknown surface and an invalid cursor', async () => {
    assert.equal((await get('/api/feed/explore')).status, 400);
    assert.equal((await get('/api/feed/home?cursor=nonsense')).status, 400);
  });

  let home;
  await t.test('home feed excludes blocked, muted, private, banned, deleted and ineligible content', async () => {
    home = await get('/api/feed/home?limit=50');
    assert.equal(home.status, 200, JSON.stringify(home.body));
    const forbiddenAuthors = ['blocked', 'blocker', 'muted', 'private', 'banned'].map((n) => id(u[n]));
    for (const item of home.body.data) assert.ok(!forbiddenAuthors.includes(authorOf(item)), `leaked ${authorOf(item)}`);

    const shown = ids(home);
    const forbiddenItems = [p.deleted, tw.reply, tw.strangerFollowersOnly, a.delhi, a.female, a.young, a.paused, a.expired, a.blocked];
    for (const doc of forbiddenItems) assert.ok(!shown.includes(id(doc)), `should not show ${id(doc)}`);
    for (const doc of [tw.followersOnly, p.local, p.own, a.pune]) assert.ok(shown.includes(id(doc)), `should show ${id(doc)}`);
  });

  await t.test('home feed ranks followed and relevant content, with reasons', async () => {
    const shown = ids(home);
    assert.ok(shown.indexOf(id(p.friend)) < shown.indexOf(id(p.far)), 'followed author ranks above an identical post');

    const byId = new Map(home.body.data.map((item) => [String(item._id), item]));
    assert.ok(byId.get(id(p.friend)).feed_meta.reasons.includes('following'));
    assert.ok(byId.get(id(p.cricket)).feed_meta.reasons.includes('interests'), 'history (liked #cricket) became an interest');
    assert.ok(byId.get(id(p.local)).feed_meta.reasons.includes('nearby'));
    assert.ok(byId.get(id(p.own)).feed_meta.reasons.includes('yours'));

    for (const [i, item] of home.body.data.entries()) {
      assert.equal(item.feed_meta.rank, i + 1);
      assert.equal(item.feed_meta.score, undefined, 'scores are admin-only');
    }
  });

  await t.test('home feed interleaves promotions after the configured slot', async () => {
    const data = home.body.data;
    assert.ok(data[3].feed_meta.reasons.includes('sponsored'), `slot 4 is ${data[3].item_type}`);
    assert.ok(['ad', 'promote_reel'].includes(data[3].item_type));
    assert.ok(!data.slice(0, 3).some((item) => item.feed_meta.reasons.includes('sponsored')));
  });

  await t.test('item shapes are a superset of the existing /api/posts/feed shapes', async () => {
    const existing = await get('/api/posts/feed?limit=50');
    assert.equal(existing.status, 200);
    for (const type of ['post', 'tweet', 'ad']) {
      const theirs = existing.body.data.find((item) => item.item_type === type);
      const ours = home.body.data.find((item) => item.item_type === type);
      assert.ok(theirs && ours, `both feeds contain a ${type}`);
      const missing = Object.keys(theirs).filter((key) => !(key in ours));
      assert.deepEqual(missing, [], `${type} is missing keys`);
    }
  });

  await t.test('admins can see score breakdowns with ?debug=true; others cannot', async () => {
    const adminRes = await get('/api/feed/home?limit=5&debug=true', u.admin);
    assert.equal(typeof adminRes.body.data[0].feed_meta.score, 'number');
    assert.ok(adminRes.body.data[0].feed_meta.terms);
    const viewerRes = await get('/api/feed/home?limit=5&debug=true');
    assert.equal(viewerRes.body.data[0].feed_meta.score, undefined);
  });

  await t.test('sparks is reels only', async () => {
    const res = await get('/api/feed/sparks?limit=50');
    assert.equal(res.status, 200);
    for (const item of res.body.data) {
      assert.ok(item.item_type === 'reel' || item.feed_meta.reasons.includes('sponsored'), item.item_type);
    }
    const shown = ids(res);
    assert.ok(shown.includes(id(r.friend)) && shown.includes(id(r.far)));
    assert.ok(!shown.includes(id(r.blocked)));
  });

  await t.test('spotlight only shows creators the viewer does not follow', async () => {
    const res = await get('/api/feed/spotlight?limit=50');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length > 0);
    for (const item of res.body.data) {
      assert.ok(![id(u.friend), id(u.viewer)].includes(authorOf(item)));
    }
  });

  await t.test('buzz is tweets only and follows the viewer\'s languages', async () => {
    const before = await get('/api/feed/buzz?limit=50');
    assert.equal(before.status, 200);
    assert.ok(before.body.data.every((item) => item.item_type === 'tweet'));
    assert.deepEqual(before.body.languages, ['en'], 'inferred from what the viewer liked and posted');
    let shown = ids(before);
    assert.ok(shown.indexOf(id(tw.en)) < shown.indexOf(id(tw.hi)));

    const saved = await send('put', '/api/feed/preferences', { preferred_languages: ['Hindi'] });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.preferred_languages, ['hi']);

    const after = await get('/api/feed/buzz?limit=50');
    assert.deepEqual(after.body.languages, ['hi']);
    shown = ids(after);
    assert.ok(shown.indexOf(id(tw.hi)) < shown.indexOf(id(tw.en)));
  });

  await t.test('promotions respect targeting and rank the relevant ad first', async () => {
    const res = await get('/api/feed/promotions?limit=50');
    assert.equal(res.status, 200);
    const shown = ids(res);
    assert.equal(shown[0], id(a.pune));
    assert.ok(res.body.data[0].feed_meta.reasons.includes('targeted'));
    assert.ok(shown.includes(id(a.general)) && shown.includes(id(promo)));
    for (const doc of [a.delhi, a.female, a.young, a.paused, a.expired, a.blocked]) {
      assert.ok(!shown.includes(id(doc)), `ineligible ad ${id(doc)} shown`);
    }
    const shapedPromo = res.body.data.find((item) => item.item_type === 'promote_reel');
    assert.equal(String(shapedPromo.promote_reel_id), id(promo));
    assert.equal(shapedPromo.media[0].media_type, 'video');
  });

  await t.test('pagination by cursor and by page never overlaps', async () => {
    const first = await get('/api/feed/home?limit=5');
    assert.equal(first.body.data.length, 5);
    assert.ok(first.body.next_cursor);
    const second = await get(`/api/feed/home?limit=5&cursor=${first.body.next_cursor}`);
    const third = await get('/api/feed/home?limit=5&page=3');
    assert.equal(second.body.session_id, first.body.session_id);
    assert.equal(third.body.session_id, first.body.session_id);
    const all = [...ids(first), ...ids(second), ...ids(third)];
    assert.equal(new Set(all).size, all.length);
  });

  await t.test('events are stored, counted, learned from, and hides apply immediately', async () => {
    const res = await send('post', '/api/feed/events', {
      events: [
        { item_id: id(p.far), item_type: 'post', event: 'hide', surface: 'home' },
        { item_id: id(p.friend), item_type: 'post', event: 'impression', surface: 'home', position: 1 },
        { item_id: id(r.far), item_type: 'post', event: 'like', surface: 'sparks' }, // client says post, it is a reel
        { item_id: 'bad', item_type: 'post', event: 'like' },
      ],
    });
    assert.equal(res.status, 202);
    assert.deepEqual({ accepted: res.body.accepted, rejected: res.body.rejected }, { accepted: 3, rejected: 1 });

    const stored = await FeedEvent.findOne({ item_id: r.far._id }).lean();
    assert.equal(stored.item_type, 'reel');
    assert.equal(String(stored.author_id), id(u.far));
    const stats = await FeedItemStats.findOne({ item_id: p.friend._id }).lean();
    assert.equal(stats.impressions, 1);

    let learned;
    for (let i = 0; i < 50 && !learned?.interests?.food; i++) {
      learned = (await FeedProfile.findOne({ user_id: u.viewer._id }).lean())?.learned;
      if (!learned?.interests?.food) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(learned.interests.food > 1.9, 'liking a #food reel teaches "food"');
    assert.ok(learned.authors[id(u.far)] < 0, 'hide outweighs like for that author');

    const again = await get('/api/feed/home?limit=50');
    assert.ok(!ids(again).includes(id(p.far)), 'hidden post is gone');
  });

  await t.test('events endpoint validates the batch', async () => {
    assert.equal((await send('post', '/api/feed/events', {})).status, 400);
    const tooMany = Array.from({ length: 101 }, () => ({ item_id: id(p.friend), item_type: 'post', event: 'impression' }));
    assert.equal((await send('post', '/api/feed/events', { events: tooMany })).status, 400);
  });

  await t.test('preferences validate input and report inferred interests', async () => {
    assert.equal((await send('put', '/api/feed/preferences', { preferred_languages: ['klingon!!'] })).status, 400);
    assert.equal((await send('put', '/api/feed/preferences', { interests: 'cricket' })).status, 400);
    assert.equal((await send('put', '/api/feed/preferences', {})).status, 400);

    const saved = await send('put', '/api/feed/preferences', { interests: ['Cricket', '#Travel'] });
    assert.deepEqual(saved.body.interests, ['cricket', 'travel']);

    const res = await get('/api/feed/preferences');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.preferred_languages, ['hi']);
    assert.ok(res.body.inferred.top_interests.some((entry) => entry.term === 'cricket'));
  });

  await t.test('admin config: admin only, validated, applied, resettable', async () => {
    assert.equal((await get('/api/feed/admin/config')).status, 403);

    const bad = await send('put', '/api/feed/admin/config', { overrides: { bogus: 1 } }, u.admin);
    assert.equal(bad.status, 400);
    assert.ok(bad.body.errors[0].includes('bogus'));
    assert.equal((await send('put', '/api/feed/admin/config', {}, u.admin)).status, 400);

    const ok = await send('put', '/api/feed/admin/config', { overrides: { surfaces: { home: { weights: { affinity: 0.5 } } } } }, u.admin);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.effective.surfaces.home.weights.affinity, 0.5);
    assert.equal(ok.body.effective.surfaces.home.weights.interest, 0.25);

    const read = await get('/api/feed/admin/config', u.admin);
    assert.deepEqual(read.body.overrides, { surfaces: { home: { weights: { affinity: 0.5 } } } });

    const reset = await send('put', '/api/feed/admin/config', { overrides: {} }, u.admin);
    assert.equal(reset.body.effective.surfaces.home.weights.affinity, 0.3);
  });
});
