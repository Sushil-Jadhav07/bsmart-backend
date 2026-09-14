# bSmart AI service

A small internal Python service next to the Node API. It understands what
content is about — from its caption **and** its image — and uses that to
personalise the feed:

1. **Embeddings.** Every post, reel, tweet, ad and promote reel gets a 512-number
   vector. Captions and images share one space (CLIP ViT-B/32 + its multilingual
   text encoder), so a cricket photo and the caption "कल का मैच" land close
   together. The text encoder was trained on about 50 languages, including
   Hindi, Marathi, Gujarati and Urdu. Telugu, Tamil, Bengali, Kannada, Malayalam
   and Punjabi captions still work, but less well; images are unaffected.
2. **Auto-tags.** Each item is compared with an interest list
   (`app/taxonomy.json`) and tagged, e.g. `food 0.82`. Posts without hashtags,
   or with no caption at all, still get topics.
3. **Taste vectors.** Each user gets a recency-weighted average of what they
   liked, saved, watched and commented on (from `feedevents` and older likes,
   saves and reel views). Hides and "not interested" push it away.
4. **Retrieval.** "Items closest to this user's taste" and "more like this item".

The Node feed calls it with a 250 ms timeout and carries on without it if it is
slow or down. Nothing in the app talks to it directly.

```
 Node API ──(X-AI-Token, localhost)──► AI service ──► MongoDB (same database)
                                           │            reads: posts, tweets, ads, promotereels,
                                           │                   feedevents, savedposts, postviews, tweetlikes
                                           │            writes: feeditemvectors, feeduservectors, aiservicestate
                                           └──► images/thumbnails via the public CloudFront URLs
```

## How content gets indexed

No changes to the Node API are needed:

* A background worker checks every 15 s for documents whose `_id` is newer than
  its checkpoint (the `_id` index makes this cheap) and indexes them. On first
  start the checkpoint begins `AI_INDEX_DAYS` (90) days ago, which backfills
  recent content.
* Every night (~02:30 IST) it compares indexed items with their source
  documents: edited ones are re-indexed, deleted ones removed.
* Search runs in memory over the last 90 days of vectors, loaded from MongoDB at
  start-up — search works even while the models are still loading.

## API (internal only)

Every `/v1` call needs `X-AI-Token: <AI_SERVICE_TOKEN>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | status, vectors in memory, model state |
| POST | `/v1/candidates` | `{user_id, k, types, exclude_author_ids, since_days}` → items closest to the user's taste |
| POST | `/v1/score` | `{user_id, item_ids}` → similarity of each item to the user's taste |
| GET | `/v1/items/{id}/similar?k=20&types=post,reel` | "more like this" |
| POST | `/v1/users/{id}/refresh` | rebuild one user's taste vector now |
| GET | `/v1/taxonomy` | the interest labels |

Interactive docs: `http://127.0.0.1:8001/docs` while it runs.

## Run it

Needs Python 3.10–3.12, ~3 GB RAM and ~2.5 GB disk (PyTorch + models). No GPU.

```bash
cd ai-service
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt -r requirements-ml.txt
cp .env.example .env                                    # fill in MONGO_URI, AI_SERVICE_TOKEN, CLOUDFRONT_BASE_URL
set -a && source .env && set +a
python -m app.backfill                                  # optional: index existing content now
uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8001
```

The first start downloads the two models (~1.1 GB) into the HuggingFace cache.

**With PM2** (same as the Node API):

```bash
pm2 start ".venv/bin/uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8001" --name bsmart-ai
```

**With Docker** (models are baked into the image):

```bash
docker build -t bsmart-ai ./ai-service
docker run -d --name bsmart-ai --env-file ai-service/.env -p 127.0.0.1:8001:8001 bsmart-ai
```

Keep it on `127.0.0.1` or a private network. Run a single worker process — the
index lives in memory.

**Connect the Node API** — add to its `.env` and restart:

```
AI_SERVICE_URL=http://127.0.0.1:8001
AI_SERVICE_TOKEN=<same value as in ai-service/.env>
```

Admins can switch the AI features off without a deploy:
`PUT /api/feed/admin/config` with `{"overrides": {"ai": {"enabled": false}}}`.

## Configuration

See `.env.example`. The important ones:

| Variable | Default | |
|---|---|---|
| `MONGO_URI` | — | the same database as the Node API |
| `AI_SERVICE_TOKEN` | — | required; without it every `/v1` call is refused |
| `PUBLIC_BASE_URL`, `CLOUDFRONT_BASE_URL` | | how media URLs are built (same as the Node API) |
| `AI_INDEX_DAYS` | 90 | content kept in the search index |
| `AI_TAG_MIN_PROB` | 0.2 | raise to tag fewer, surer labels |
| `AI_RECONCILE_HOUR_UTC` | 21 | nightly clean-up hour |

## Capacity

* CPU only: ~20–50 ms per caption and ~50–150 ms per image, so thousands of new
  posts a day take minutes of CPU.
* Memory: ~2 GB for the models plus ~2 KB per indexed item (200k items ≈ 400 MB).
  Beyond a few hundred thousand items in the window, swap `app/index.py` for
  FAISS/HNSW or a vector database behind the same methods.

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

The tests use a small fake encoder (no model download) and a real throwaway
`mongod`: the binary the Node feed tests download, or set `MONGOD_BINARY`.

## Known limits

* The tagging thresholds and the interest list need checking on real bSmart
  content — adjust `app/taxonomy.json` and `AI_TAG_MIN_PROB`.
* Hinglish is understood less precisely than Hindi or English.
* Reels are understood from their thumbnail (or a few frames via ffmpeg), not
  from speech or on-screen text.
* Items with no caption whose images cannot be downloaded are skipped.
