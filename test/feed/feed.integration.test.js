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

  // tweet.routes loads the S3 upload config, which needs a bucket name at require time.
  process.env.S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'feed-test-bucket';
  const { flushFeedTracking } = require('../../src/feed/track');
  const { rebuildHistory } = require('../../src/feed/profile');
  const { DEFAULT_CONFIG } = require('../../src/feed/config');

  const app = express();
  app.use(express.json());
  app.use('/api/feed', require('../../src/routes/feed.routes'));
  app.use('/api/posts', require('../../src/routes/post.routes'));
  app.use('/api/tweets', require('../../src/routes/tweet.routes'));
  app.use('/api/views', require('../../src/routes/view.routes'));

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
    assert.equal((await get('/api/feed/stories')).status, 400);
    assert.equal((await get('/api/feed/spotlight')).status, 400, 'the old discovery name is retired');
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

  await t.test('bsparks is reels only, and the old name "sparks" still works', async () => {
    const res = await get('/api/feed/bsparks?limit=50');
    assert.equal(res.status, 200);
    for (const item of res.body.data) {
      assert.ok(item.item_type === 'reel' || item.feed_meta.reasons.includes('sponsored'), item.item_type);
    }
    const shown = ids(res);
    assert.ok(shown.includes(id(r.friend)) && shown.includes(id(r.far)));
    assert.ok(!shown.includes(id(r.blocked)));

    const alias = await get('/api/feed/sparks?limit=5');
    assert.equal(alias.status, 200);
    assert.equal(alias.body.surface, 'bsparks');
  });

  await t.test('moments is photo posts only', async () => {
    const res = await get('/api/feed/moments?limit=50');
    assert.equal(res.status, 200);
    const organic = res.body.data.filter((item) => !item.feed_meta.reasons.includes('sponsored'));
    assert.ok(organic.length > 0);
    assert.ok(organic.every((item) => item.item_type === 'post'));
    assert.ok(ids(res).includes(id(p.friend)));
  });

  await t.test('spotlights is ads only, and filters by category', async () => {
    const all = await get('/api/feed/spotlights?limit=50');
    assert.equal(all.status, 200);
    assert.ok(all.body.data.every((item) => item.item_type === 'ad'));
    const shown = ids(all);
    assert.ok(shown.includes(id(a.pune)) && shown.includes(id(a.general)));
    for (const doc of [a.delhi, a.female, a.young, a.paused, a.expired, a.blocked]) {
      assert.ok(!shown.includes(id(doc)), `ineligible ad ${id(doc)} shown`);
    }

    const kitchen = await get(`/api/feed/spotlights?limit=50&category=${encodeURIComponent('Home & Kitchen')}`);
    assert.deepEqual(ids(kitchen), [id(a.general)]);
    assert.equal(kitchen.body.category, 'Home & Kitchen');
    assert.deepEqual(ids(await get('/api/feed/spotlights?category=Books')), []);
    assert.equal(ids(await get('/api/feed/spotlights?limit=50&category=All')).length, shown.length);
  });

  await t.test('campaigns is promote reels only', async () => {
    const res = await get('/api/feed/campaigns?limit=50');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((item) => item.item_type), ['promote_reel']);
    assert.equal(String(res.body.data[0].promote_reel_id), id(promo));
  });

  await t.test('the daily ad cap applies to ads mixed into feeds, not to browsing Spotlights', async () => {
    const capped = await ad(u.vendor2, { ad_title: 'Cap test', category: 'Books' });
    await send('post', '/api/feed/events', {
      events: [1, 2, 3].map(() => ({ item_id: id(capped), item_type: 'ad', event: 'impression', surface: 'home' })),
    });
    assert.ok(ids(await get('/api/feed/spotlights?limit=50&category=Books')).includes(id(capped)));
    assert.ok(!ids(await get('/api/feed/promotions?limit=50')).includes(id(capped)));
  });

  await t.test('explore only shows creators the viewer does not follow', async () => {
    const res = await get('/api/feed/explore?limit=50');
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

  const learnedProfile = async () => (await FeedProfile.findOne({ user_id: u.viewer._id }).lean())?.learned || {};
  const waitFor = async (check) => {
    for (let i = 0; i < 100; i++) {
      const value = await check();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('timed out waiting for background work');
  };

  await t.test('client events are stored, counted, learned from, and hides apply immediately', async () => {
    const res = await send('post', '/api/feed/events', {
      events: [
        { item_id: id(p.far), item_type: 'post', event: 'hide', surface: 'home' },
        { item_id: id(p.friend), item_type: 'post', event: 'impression', surface: 'home', position: 1 },
        // client says post, it is a reel
        { item_id: id(r.far), item_type: 'post', event: 'dwell', surface: 'sparks', dwell_ms: 20000, completion_pct: 100 },
        { item_id: 'bad', item_type: 'post', event: 'impression' },
        { item_id: id(r.far), item_type: 'reel', event: 'like' }, // likes come from the like API, not the app
      ],
    });
    assert.equal(res.status, 202);
    assert.deepEqual({ accepted: res.body.accepted, rejected: res.body.rejected }, { accepted: 3, rejected: 2 });
    assert.match(res.body.errors.find((e) => e.index === 4).reason, /recorded by the server/);

    const stored = await FeedEvent.findOne({ item_id: r.far._id }).lean();
    assert.equal(stored.item_type, 'reel');
    assert.equal(stored.source, 'client');
    assert.equal(String(stored.author_id), id(u.far));
    const stats = await FeedItemStats.findOne({ item_id: p.friend._id }).lean();
    assert.equal(stats.impressions, 1);

    const learned = await waitFor(async () => {
      const value = await learnedProfile();
      return value.interests?.food ? value : null;
    });
    assert.ok(learned.interests.food > 1.5, 'watching a #food reel to the end teaches "food"');
    assert.ok(learned.authors[id(u.far)] < 0, 'hide outweighs the watch for that author');

    const again = await get('/api/feed/home?limit=50');
    assert.ok(!ids(again).includes(id(p.far)), 'hidden post is gone');
  });

  await t.test('existing APIs record server events the feed learns from, and undo reverses them', async () => {
    assert.equal((await send('post', `/api/posts/${id(p.cricket)}/like`, {})).status, 200);
    assert.equal((await send('post', `/api/posts/${id(p.local)}/save`, {})).status, 200);
    assert.equal((await send('post', `/api/tweets/${id(tw.en)}/like`, {})).status, 200);
    assert.equal((await send('post', '/api/views', { postId: id(r.friend) })).status, 200);
    assert.equal((await send('post', '/api/views/complete', { postId: id(r.friend), watchTimeMs: 9000 })).status, 200);
    await flushFeedTracking();

    const server = await FeedEvent.find({ user_id: u.viewer._id, source: 'server' }).lean();
    assert.deepEqual(
      server.map((e) => `${e.event}:${e.item_type}`).sort(),
      ['complete:reel', 'like:post', 'like:tweet', 'save:post', 'view:reel']
    );
    assert.equal(server.find((e) => e.event === 'complete').watch_ms, 9000);
    assert.equal((await FeedItemStats.findOne({ item_id: p.local._id }).lean()).saves, 1);
    assert.ok((await learnedProfile()).interests.cricket > 1.9, 'the like API taught "cricket"');

    assert.equal((await send('post', `/api/posts/${id(p.cricket)}/unlike`, {})).status, 200);
    assert.equal((await send('post', `/api/posts/${id(p.local)}/unsave`, {})).status, 200);
    await flushFeedTracking();

    assert.ok(Math.abs((await learnedProfile()).interests.cricket || 0) < 0.1, 'unlike reverses the like');
    assert.equal((await FeedItemStats.findOne({ item_id: p.local._id }).lean()).saves, 0);
    assert.ok(await FeedEvent.exists({ source: 'server', event: 'save', undo: true }));
  });

  await t.test('profile history skips interactions already learned from server events', async () => {
    // r.far is now liked in Post.likes *and* logged as a server event.
    assert.equal((await send('post', `/api/posts/${id(r.far)}/like`, {})).status, 200);
    await flushFeedTracking();

    const history = await rebuildHistory(u.viewer, DEFAULT_CONFIG);
    assert.equal(history.interests.food, undefined, 'the tracked like and reel views are not counted again');
    assert.ok(history.interests.cricket > 0, 'likes from before tracking still count');
  });

  await t.test('AI service: taste-similar candidates, semantic scores and auto-detected topics', async (tt) => {
    const http = require('node:http');
    const FeedItemVector = require('../../src/models/FeedItemVector');
    const { resetAiClient } = require('../../src/feed/aiClient');

    const calls = [];
    const aiService = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        calls.push({ path: req.url, token: req.headers['x-ai-token'], body: JSON.parse(body || '{}') });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (req.url === '/v1/candidates') {
          return res.end(JSON.stringify({ has_profile: true, items: [
            { item_id: id(p.filler3), item_type: 'post', score: 0.9 },
            { item_id: id(p.blocked), item_type: 'post', score: 0.99 }, // must still be filtered out
          ] }));
        }
        return res.end(JSON.stringify({ has_profile: true, scores: { [id(p.filler3)]: 0.92, [id(p.filler6)]: 0.1 } }));
      });
    });
    await new Promise((resolve) => aiService.listen(0, '127.0.0.1', resolve));
    process.env.AI_SERVICE_URL = `http://127.0.0.1:${aiService.address().port}`;
    process.env.AI_SERVICE_TOKEN = 'ai-secret';
    resetAiClient();
    tt.after(() => {
      aiService.close();
      delete process.env.AI_SERVICE_URL;
      delete process.env.AI_SERVICE_TOKEN;
      resetAiClient();
    });

    // What the AI service would have written after looking at the images.
    await FeedItemVector.create({ item_id: p.filler4._id, item_type: 'post', topics: ['cricket'] });
    await FeedItemVector.create({ item_id: p.filler5._id, item_type: 'post', topics: ['gardening'] });

    const res = await get('/api/feed/home?limit=50');
    assert.equal(res.status, 200);
    const byId = new Map(res.body.data.map((item) => [String(item._id), item]));
    assert.ok(byId.get(id(p.filler3)).feed_meta.sources.includes('similar'));
    assert.ok(byId.get(id(p.filler3)).feed_meta.reasons.includes('for_you'));
    assert.ok(!byId.has(id(p.blocked)), 'AI suggestions still go through the privacy and block filters');
    assert.ok(byId.get(id(p.filler4)).feed_meta.reasons.includes('interests'), 'auto-detected "cricket" matches the viewer');

    const candidateCall = calls.find((c) => c.path === '/v1/candidates');
    assert.equal(candidateCall.token, 'ai-secret');
    assert.ok(candidateCall.body.exclude_author_ids.includes(id(u.blocked)));
    assert.ok(calls.some((c) => c.path === '/v1/score' && c.body.item_ids.includes(id(p.filler3))));

    // Learning uses the auto-detected topics too.
    await send('post', '/api/feed/events', { events: [{ item_id: id(p.filler5), item_type: 'post', event: 'dwell', dwell_ms: 20000 }] });
    const learned = await waitFor(async () => {
      const value = await learnedProfile();
      return value.interests?.gardening ? value : null;
    });
    assert.ok(learned.interests.gardening > 0);
  });

  await t.test('the feed keeps working when the AI service is down', async () => {
    const { resetAiClient } = require('../../src/feed/aiClient');
    process.env.AI_SERVICE_URL = 'http://127.0.0.1:9'; // nothing listens there
    resetAiClient();
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const res = await get('/api/feed/home?limit=10');
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 10);
    } finally {
      console.warn = originalWarn;
      delete process.env.AI_SERVICE_URL;
      resetAiClient();
    }
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
