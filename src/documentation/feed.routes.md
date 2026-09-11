# Personalized Feed (`/api/feed`)

Per-user ranked feeds for bSmart. Instead of every user getting the same
reverse-chronological list, each request ranks content for that viewer using
**location, language, interests, following, watch behaviour, engagement,
freshness and trending** signals.

Existing endpoints (`/api/posts/feed`, `/api/posts/reels/mixed`, `/api/tweets/feed`,
`/api/ads/feed`) are unchanged. Clients can move to the new feed one surface at a time.

---

## 1. Surfaces

| Surface      | Content                                   | Ranking emphasis                        | Promotions             |
|--------------|-------------------------------------------|-----------------------------------------|------------------------|
| `home`       | posts, reels, tweets                      | following, interests, freshness         | 1 every 5 (after 3rd)  |
| `sparks`     | reels (short video)                       | watch completion, interests, engagement | video only, 1 every 4  |
| `buzz`       | tweet-style posts                         | freshness, following                    | none                   |
| `spotlight`  | posts, reels, tweets from **unfollowed** creators | engagement / trending, interests  | none                   |
| `promotions` | ads + promote reels                       | targeting fit, interests, locale        | —                      |

> **Assumption to confirm with product:** the scope named Sparks, Buzz, Spotlight
> and Promotions without defining them. The mapping above is a best guess and is
> pure configuration — `surfaces.<name>.sources` in `src/feed/config.js` (or the
> admin config API) changes it without code changes.

---

## 2. Endpoints

All require `Authorization: Bearer <token>`. Full schemas are in Swagger under
**Personalized Feed**.

### `GET /api/feed/:surface`

Query: `limit` (page size, ≤ 50, default 20), `page`, `cursor`, `lang`, `debug` (admins).

```json
{
  "surface": "home",
  "page": 1,
  "limit": 20,
  "session_id": "9f2c…",
  "next_cursor": "eyJzIjoi…",
  "has_more": true,
  "languages": ["hi", "en"],
  "data": [
    { "item_type": "post", "...": "same shape as /api/posts/feed",
      "feed_meta": { "surface": "home", "rank": 1, "reasons": ["following", "fresh"], "sources": ["following", "recent"] } }
  ]
}
```

* Items keep the exact shapes of the existing feeds (`post`, `reel`, `tweet`, `ad`,
  `promote_reel`) plus a `feed_meta` object, so existing renderers work.
  Ads and promote reels additionally carry `is_saved_by_me`.
* **Pagination.** Page 1 (or any request without `cursor`) ranks afresh —
  pull-to-refresh. Later pages (`cursor`, or `page=2,3…`) read from the same
  ranked list, cached for ~10 minutes, so pages never overlap. If a cursor has
  expired the response has `session_restarted: true` and starts from the top.
* `feed_meta.reasons`: `yours`, `following`, `interests`, `nearby`, `language`,
  `trending`, `fresh`, `new_for_you` (exploration slot), `sponsored`, `targeted`,
  `recommended`. Useful for "Why am I seeing this?".
* `?debug=true` adds `score`, `terms` and `penalty` to `feed_meta` — **admins only**.

### `POST /api/feed/events` — clients must send these

The ranker learns from what people actually do in the feed. Batch up to 100
events per request (every few seconds while scrolling, and on app background).

```json
{ "events": [
  { "item_id": "…", "item_type": "reel", "event": "impression", "surface": "sparks", "position": 3 },
  { "item_id": "…", "item_type": "reel", "event": "view", "surface": "sparks", "watch_ms": 8200, "completion_pct": 75 },
  { "item_id": "…", "item_type": "post", "event": "dwell", "surface": "home", "dwell_ms": 4200 },
  { "item_id": "…", "item_type": "post", "event": "hide", "surface": "home" }
] }
```

| Event            | When to send                                                    |
|------------------|-----------------------------------------------------------------|
| `impression`     | item ≥ 50% visible for the first time in a session              |
| `dwell`          | item leaves the screen, with `dwell_ms`                         |
| `view`           | video stopped, with `watch_ms` and `completion_pct`             |
| `complete`       | video watched to the end                                        |
| `like` `comment` `share` `save` `click` `follow` | the action, from the feed               |
| `skip`           | scrolled past in under ~1 second                                |
| `hide` / `not_interested` | user feedback; the item disappears on the next request |

Response `202 { accepted, rejected, errors }`. Events for unknown items are ignored.
**Impressions matter most:** without them engagement can only be measured as raw
counts, not rates, and the "seen" penalty cannot work.

### `GET / PUT /api/feed/preferences`

```json
{ "preferred_languages": ["hi", "en"], "interests": ["cricket", "travel"] }
```

For onboarding and settings. Languages accept codes (`hi`, `en`, `ta`, `hi-Latn`
for Hinglish) or names (`Hindi`). Explicit languages override inference; send `[]`
to go back to inferred. `GET` also returns what the feed has inferred.

### `GET / PUT /api/feed/admin/config` (admin only)

Tune weights, half-lives, caps and surface mappings **without a deploy**:

```json
{ "overrides": { "surfaces": { "home": { "weights": { "affinity": 0.35 } } }, "exploration": { "rate": 0.1 } } }
```

Overrides are deep-merged onto the defaults in `src/feed/config.js`, validated
key by key (any invalid key rejects the whole update), and take effect within a
minute. `{ "overrides": {} }` resets.

---

## 3. How ranking works

```
viewer context → candidate retrieval → filtering → scoring → diversity
              → exploration slots → promotions interleaved → cached session → page
```

**Viewer context** (`src/feed/profile.js`, cached 60 s): follows, blocks (both
directions), mutes, private accounts not followed, hidden/reported items,
recently seen items, location (`User.address`, `User.location`), age, gender,
languages and interest/author weights.

**Candidate retrieval** (`src/feed/candidates.js`): a few hundred items from
five strategies per content type — `following`, `interests` (hashtags/tags),
`local` (creators in the viewer's city), `trending` (engagement in the last 72 h),
`recent` (backfill). Content older than 30 days is not retrieved.

**Scoring** (`src/feed/scoring.js`, pure functions, unit-tested):

```
score = Σ weight × term − penalties
```

| Term         | Meaning                                                                      |
|--------------|------------------------------------------------------------------------------|
| `affinity`   | follows the author (0.8–1.0), or has interacted with them (up to 0.6)        |
| `interest`   | overlap of the item's topics with the viewer's interest weights              |
| `freshness`  | exponential decay with a per-surface half-life                               |
| `engagement` | smoothed engagement **rate** + trending velocity, normalised by author reach |
| `quality`    | video completion rate                                                        |
| `locale`     | language match + geographic closeness                                        |
| penalties    | already seen recently; high hide/skip rate                                   |

**Diversity**: at most 2 items per author and 3 per topic in any 10, and no more
than 3 of the same format in a row — soft caps, so a small platform never runs dry.
**Exploration**: ~15% of slots go to new, under-exposed content from creators
the viewer does not follow, so new posts get measured at all.

**Promotions** (`src/feed/promotions.js`): only `active` ads inside their
`budget.start_date`/`end_date`, matching `targeting` (geo, age, gender) and
`scheduling.delivery_time_slots` (IST by default), capped at 3 impressions per
viewer per day. Exhausted budgets are down-ranked, or removed when the vendor set
`auto_stop_on_budget_exhausted`. Language targeting is a soft boost.

---

## 4. Where the signals come from

| Signal            | Source                                                                               |
|-------------------|--------------------------------------------------------------------------------------|
| Following         | `Follow`                                                                             |
| Location          | `User.address` (city/state/country), `User.location` (lat/lng, name), `Post.location` |
| Language          | detected from captions/tweets by script (Devanagari, Tamil, Bengali … and Hinglish); viewer languages from preferences, else inferred from engagement, else `Accept-Language` |
| Interests         | hashtags and `tags` on content; `User.ad_interests`; declared interests              |
| Watch behaviour   | `PostView` (completion, watch time, rewatches) and feed `view`/`dwell` events        |
| Engagement        | likes/comments/reposts counters, `SavedPost`, `TweetLike`, `TweetRepost`, feed events |
| Negative feedback | `hide`/`not_interested`/`skip` events, `ContentReport`, `Block`, `Mute`              |

New users are personalised from their first request: the profile is bootstrapped
from existing likes, saves, reel watches, tweet likes/reposts and their own posts
(last 90 days), and rebuilt daily. Feed events are folded in continuously and decay
with a 14-day half-life.

---

## 5. New collections

| Collection      | Purpose                                                     |
|-----------------|-------------------------------------------------------------|
| `feedevents`    | raw client events; TTL index, 90 days (`FEED_EVENT_RETENTION_DAYS`) |
| `feeditemstats` | per-item counters (impressions, completions, hides …)       |
| `feedprofiles`  | per-user history + learned signals, preferences             |
| `feedsettings`  | admin overrides for the ranking config                      |

Indexes on these are created automatically. **No existing schema was changed.**

Environment variables (all optional): `FEED_EVENT_RETENTION_DAYS`,
`PERSONALIZED_FEED_RATE_LIMIT_MAX` / `_WINDOW_MS` (default 90/min per user),
`FEED_EVENTS_RATE_LIMIT_MAX` / `_WINDOW_MS` (default 120/min per user).

---

## 6. Known limitations and next steps

* **Not yet wired to content moderation.** The feed filters `isDeleted`, reports,
  blocks and mutes, but there is no moderation status on posts yet. When the
  moderation service lands, add its "approved" condition to `baseFilter` in
  `candidates.js` and to `hydrate.js`.
* **Caches are per process** (viewer context, ranked sessions, settings) — same
  trade-off as `middleware/rateLimit.js`. Fine for a single PM2 process; move to
  Redis before running several API instances.
* **Recommended indexes** on existing collections (not added automatically,
  to avoid index builds on large production collections during deploy):
  `posts {type:1, isDeleted:1, createdAt:-1}`, `posts {likes:1}`,
  `tweets {parentTweet:1, isDeleted:1, createdAt:-1}`, `blocks {blocked_id:1}`,
  `users {"address.city":1}`.
* Language detection is script-based: it cannot tell Hindi from Marathi (both
  Devanagari) or English from other Latin-script languages.
* Ad `device_types` targeting is not applied (the API does not know the device).
* Phase 2 ideas: collaborative filtering ("people like you watched"), learned
  ranking model (LightGBM) trained on `feedevents`, A/B testing of configs.

---

## 7. Tests

```bash
npm run test:feed
```

Unit tests cover scoring, text/language, geo, diversity, targeting, config
validation and event handling. `test/feed/feed.integration.test.js` runs the whole
API against an in-memory MongoDB; it is skipped unless the tooling is installed:

```bash
npm install --no-save mongodb-memory-server supertest
```
