# Personalized Feed (`/api/feed`)

Per-user ranked feeds for bSmart. Instead of every user getting the same
reverse-chronological list, each request ranks content for that viewer using
**location, language, interests, following, watch behaviour, engagement,
freshness and trending** signals.

Existing endpoints (`/api/posts/feed`, `/api/posts/reels/mixed`, `/api/tweets/feed`,
`/api/ads/feed`) are unchanged. Clients can move to the new feed one surface at a time.

---

## 1. Surfaces

Named as in the app:

| Surface      | App page     | Content                                    | Ranking emphasis                        | Mixed-in promotions    |
|--------------|--------------|--------------------------------------------|-----------------------------------------|------------------------|
| `home`       | Home         | posts, reels, tweets                       | following, interests, freshness         | 1 every 5 (after 3rd)  |
| `moments`    | Moments      | photo posts                                | following, interests, freshness         | 1 every 5 (after 3rd)  |
| `bsparks`    | bSparks      | reels (short video) — `sparks` also accepted | watch completion, interests, engagement | video only, 1 every 4  |
| `buzz`       | Buzz         | tweet-style posts                          | freshness, following                    | none                   |
| `spotlights` | Spotlights   | vendor ads; `?category=` for one tab       | targeting fit, interests, locale        | —                      |
| `campaigns`  | Campaigns    | promote reels with products                | targeting fit, interests, locale        | —                      |
| `explore`    | (not in the app yet) | posts, reels, tweets from **unfollowed** creators | engagement / trending, interests | none          |
| `promotions` | —            | ads + promote reels (what is mixed into the organic feeds) | targeting fit, interests, locale | —         |

Which content each surface lists is configuration —
`surfaces.<name>.sources` in `src/feed/config.js`, or the admin config API.

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
* `feed_meta.reasons`: `yours`, `following`, `interests`, `for_you` (similar to
  the viewer's taste — AI service), `nearby`, `language`, `trending`, `fresh`,
  `new_for_you` (exploration slot), `sponsored`, `targeted`, `recommended`.
  Useful for "Why am I seeing this?".
* `?debug=true` adds `score`, `terms` and `penalty` to `feed_meta` — **admins only**.

### Where feed signals come from

The feed learns from two sources. Both land in the `feedevents` collection
(field `source`: `server` or `client`), which is also the training log for
future ranking models.

**Recorded automatically by the backend** — the existing APIs log these the
moment they are called, so the app does **not** send them:

| Existing API                                              | Feed event          |
|-----------------------------------------------------------|---------------------|
| `POST /api/posts/:id/like`, `/unlike`                     | `like` / undo       |
| `POST /api/posts/:postId/comments`                        | `comment`           |
| save / unsave of posts, promote reels, ads (all routes)   | `save` / undo       |
| `POST /api/views`, `POST /api/views/complete` (reels)     | `view`, `complete` (with watch time) |
| `POST /api/tweets/:tweetId/like`, `/unlike`               | `like` / undo       |
| `POST /api/tweets/repost`, reposts and quotes via `POST /api/tweets` | `repost` / undo |
| replies via `POST /api/tweets`, `POST /api/tweets/:tweetId/comments` | `comment`   |
| `POST /api/promote-reels/:id/like`, `/unlike`, `/:id/comments` | `like` / undo, `comment` |
| `POST /api/ads/:id/view`, `/:id/click`, `/:id/comments`   | `view`, `click`, `comment` |
| ad like / like reversal (`likeAd` / `dislikeAd`)          | `like` / undo       |

These are queued in memory and written once a second per user, so they never
slow the API down. Admins can switch them off with `events.serverTracking`.

### `POST /api/feed/events` — what the app sends

Only what the backend cannot see. Batch up to 100 events per request (every few
seconds while scrolling, and on app background):

```json
{ "events": [
  { "item_id": "…", "item_type": "reel", "event": "impression", "surface": "sparks", "position": 3 },
  { "item_id": "…", "item_type": "reel", "event": "dwell", "surface": "sparks", "dwell_ms": 8200, "completion_pct": 75 },
  { "item_id": "…", "item_type": "post", "event": "hide", "surface": "home" }
] }
```

| Event            | When to send                                                    |
|------------------|-----------------------------------------------------------------|
| `impression`     | item ≥ 50% visible for the first time in a session              |
| `dwell`          | item leaves the screen, with `dwell_ms`; for videos also `completion_pct` |
| `skip`           | scrolled past in under ~1 second                                |
| `hide` / `not_interested` | user feedback; the item disappears on the next request |
| `share`          | shared outside the app (system share sheet)                     |
| `click`          | opened a post/reel/tweet detail (ad clicks go to `POST /api/ads/:id/click`) |

Response `202 { accepted, rejected, errors }`. Events the backend records itself
(`like`, `comment`, `save`, `repost`, `view`, `complete`, ad `click`) are rejected
with a reason, so nothing is counted twice. Events for unknown items are ignored.
**Impressions matter most:** without them engagement can only be measured as raw
counts, not rates, and the "seen" penalty cannot work.

### `GET / PUT /api/feed/preferences`

```json
{ "preferred_languages": ["hi", "en"], "interests": ["cricket", "travel"] }
```

For onboarding and settings. Languages accept codes (`hi`, `en`, `mr`, `ta`,
`hi-Latn` for Hinglish) or names (`Hindi`). Explicit languages override inference;
send `[]` to go back to inferred. `GET` also returns what the feed has inferred.

### `GET / PUT /api/feed/admin/config` (admin only)

Tune weights, half-lives, caps, surface mappings and server tracking **without a deploy**:

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
`scheduling.delivery_time_slots` (IST by default). Ads mixed into Home, Moments
and bSparks are capped at 3 impressions per viewer per day; the Spotlights and
Campaigns pages are not capped, because people browse them on purpose.
Exhausted budgets are down-ranked, or removed when the vendor set
`auto_stop_on_budget_exhausted`. Language targeting is a soft boost.

---

## 4. Where the signals come from

| Signal            | Source                                                                               |
|-------------------|--------------------------------------------------------------------------------------|
| Following         | `Follow`                                                                             |
| Location          | `User.address` (city/state/country), `User.location` (lat/lng, name), `Post.location` |
| Language          | detected from captions/tweets (see below); viewer languages from preferences, else inferred from engagement, else `Accept-Language` |
| Interests         | hashtags and `tags` on content; `User.ad_interests`; declared interests              |
| Watch behaviour   | reel views/completions (`/api/views`), `PostView` history, and app `dwell` events    |
| Engagement        | likes, comments, saves, reposts (server events), counters on the content             |
| Negative feedback | `hide`/`not_interested`/`skip` events, `ContentReport`, `Block`, `Mute`              |

New users are personalised from their first request: the profile is bootstrapped
from existing likes, saves, reel watches, tweet likes/reposts and their own posts
(last 90 days), and rebuilt daily. Anything already logged as a server event is
skipped by the rebuild, so it is never counted twice. Events are folded in as they
arrive and decay with a 14-day half-life; unlike/unsave/un-repost reverse them.

### Language detection (`src/feed/text.js`)

1. **Script** — Tamil, Telugu, Bengali, Gujarati, Punjabi, Kannada, Malayalam,
   Odia and Urdu are identified by their script alone.
2. **Devanagari** — Google's CLD3 model (`cld3-asm`, WebAssembly) decides Hindi,
   Marathi or Nepali.
3. **Latin script** — Hinglish (`hi-Latn`) when the text has enough common Hindi
   function words or CLD3 says so; otherwise English.

Results are memoised (~3 µs per repeated caption, ~0.3 ms for a new one). If the
model fails to load, Devanagari falls back to Hindi and the feed keeps working.

Measured on short, hand-written social captions (hard cases only: Hindi, Marathi,
Nepali, English, Hinglish):

| Detector                    | Tuning set (76) | Held-out set (40) |
|-----------------------------|-----------------|-------------------|
| Script-only (previous)      | 49%             | 55%               |
| **Hybrid (current)**        | **97%**         | **85%**           |

Held-out detail: English 12/12, Hinglish 10/12, Hindi 7/8, Marathi 5/8. Very
short Marathi captions are the weak spot. These sentences were written for the
test, not taken from bSmart — measure again on real captions.

---

### AI service (optional, `ai-service/`)

A separate Python service turns every post, reel, tweet and ad into an
embedding from its caption **and** image, auto-tags it with interests, and keeps
a "taste vector" per user. When the Node API's `.env` has `AI_SERVICE_URL` and
`AI_SERVICE_TOKEN`, the feed also:

* retrieves items similar to the viewer's taste (source `similar`, reason
  `for_you`) — these still go through every privacy, block and deletion filter;
* adds a `semantic` term: each candidate's similarity to the viewer's taste,
  rescaled to 0–1 within the request;
* merges the topics the service detected into each item's topics, for ranking
  and for learning — a food photo with no hashtags still counts as "food".

Calls time out after 250 ms and stop for 30 s after three failures, so the feed
never waits on it. Without it the `semantic` term is 0 for every item and
ranking is unchanged. Admins can switch it off with `ai.enabled`. Setup and
operation: `ai-service/README.md`.

---

## 5. New collections, config and dependency

| Collection      | Purpose                                                     |
|-----------------|-------------------------------------------------------------|
| `feedevents`    | server + client events (`source`, `undo`); TTL index, 90 days (`FEED_EVENT_RETENTION_DAYS`) |
| `feeditemstats` | per-item counters (impressions, saves, completions, hides …) |
| `feedprofiles`  | per-user history + learned signals, preferences             |
| `feedsettings`  | admin overrides for the ranking config                      |
| `feeditemvectors`, `feeduservectors`, `aiservicestate` | written by the AI service: item embeddings + auto-topics, user taste vectors, sync checkpoints |

Indexes on these are created automatically. **No existing schema was changed.**
The existing controllers only gained one-line `trackFeedEvent(...)` calls.

New dependency: `cld3-asm` (MIT, WebAssembly build of Google's CLD3, no native build step).

Environment variables (all optional): `FEED_EVENT_RETENTION_DAYS`,
`PERSONALIZED_FEED_RATE_LIMIT_MAX` / `_WINDOW_MS` (default 90/min per user),
`FEED_EVENTS_RATE_LIMIT_MAX` / `_WINDOW_MS` (default 120/min per user).

---

## 6. Known limitations and next steps

* **Not yet wired to content moderation.** The feed filters `isDeleted`, reports,
  blocks and mutes, but there is no moderation status on posts yet. When the
  moderation service lands, add its "approved" condition to `baseFilter` in
  `candidates.js` and to `hydrate.js`.
* **Caches and the server-event queue are per process** (viewer context, ranked
  sessions, settings, events waiting to be written — at most ~1 second of events
  is lost on a restart). Fine for a single PM2 process; move to Redis before
  running several API instances.
* **Recommended indexes** on existing collections (not added automatically,
  to avoid index builds on large production collections during deploy):
  `posts {type:1, isDeleted:1, createdAt:-1}`, `posts {likes:1}`,
  `tweets {parentTweet:1, isDeleted:1, createdAt:-1}`, `blocks {blocked_id:1}`,
  `users {"address.city":1}`.
* Language detection is weakest on very short Marathi captions, and only knows
  Hinglish as romanised Hindi (not romanised Marathi, Tamil …).
* Ad `device_types` targeting is not applied (the API does not know the device).
* Next AI/ML steps: content embeddings (text + image) for topic understanding
  beyond hashtags, collaborative filtering, A/B testing, and a learned ranking
  model (LightGBM) trained on `feedevents` once a few weeks of data exist.

---

## 7. Tests

```bash
npm run test:feed
```

Unit tests cover scoring, text/language, geo, diversity, targeting, config
validation and event handling. `test/feed/feed.integration.test.js` runs the whole
API against an in-memory MongoDB — including the real like, save, tweet and reel
view APIs for server tracking; it is skipped unless the tooling is installed:

```bash
npm install --no-save mongodb-memory-server supertest
```
