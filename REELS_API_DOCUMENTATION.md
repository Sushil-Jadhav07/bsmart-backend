# Reels API Documentation

## Overview
- Reels are posts with type = "reel" that support view tracking and rewards.
- The system records views and completion per user per reel, updates post counters, and credits the viewer’s wallet once per completed view.
- All endpoints require Authorization: Bearer <JWT>.

## Lifecycle
1. User opens a reel → addView increments views_count (and unique_views_count if first view by user).
2. User completes viewing → completeView marks the view as completed, increments completed_views_count, and credits wallet (idempotent).

## Models
- Post (subset):
  - fields: views_count, unique_views_count, completed_views_count, type ("reel" for eligibility)
  - [Post.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/models/Post.js)
- PostView:
  - post_id, user_id, type="reel", view_count, completed, completed_at, rewarded, rewarded_at, watchTimeMs
  - unique index: (post_id, user_id)
  - [PostView.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/models/PostView.js)
- WalletTransaction:
  - user_id, post_id, type="REEL_VIEW_REWARD", amount=20, status="SUCCESS"
  - unique index: (user_id, post_id, type)
  - [WalletTransaction.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/models/WalletTransaction.js)

## Endpoints

### Add View
- POST /api/views
- Auth: required
- Body:
```json
{ "postId": "POST_ID" }
```
- Responses:
```json
{ "success": true, "views_count": 12, "unique_views_count": 5 }
```
- Behavior:
  - Validates post exists and type === "reel"
  - Creates PostView on first view (increments unique_views_count and views_count)
  - Subsequent views by same user increment views_count only
- Controller: [addView](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/controllers/view.controller.js#L7-L35)
- Swagger: [view.routes.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/routes/view.routes.js#L6-L45)

### Complete View (Reward)
- POST /api/views/complete
- Auth: required
- Body:
```json
{ "postId": "POST_ID", "watchTimeMs": 18000 }
```
- Responses:
```json
{ "success": true, "completed": true, "rewarded": true, "walletBalance": 5020, "message": "View completed and processed" }
```
- Behavior:
  - Validates post exists and type === "reel"
  - Creates PostView if missing (first-time completion path)
  - Sets completed=true once; increments completed_views_count once
  - Rewards viewer once (Wallet + WalletTransaction upsert ensures idempotency)
- Controller: [completeView](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/controllers/view.controller.js#L37-L94)
- Swagger: [view.routes.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/routes/view.routes.js#L46-L89)

## Counters & Idempotency
- views_count: increments on every addView for a user
- unique_views_count: increments only when creating the first PostView for that user
- completed_views_count: increments once when a view is first marked completed
- Reward idempotency:
  - WalletTransaction unique index guarantees one reward per (user, post, type)
  - PostView.rewarded flag prevents duplicate credits

## Rules
- Only posts with type === "reel" are eligible
- Requires JWT; body must include postId
- Wallet credit default: 20 units
- Non-replica-set safe: operations are performed sequentially with upserts

## Curl Examples
```bash
# Add a view
curl -X POST http://localhost:5000/api/views \
  -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \
  -d '{"postId":"POST_ID"}'

# Complete a view (reward)
curl -X POST http://localhost:5000/api/views/complete \
  -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \
  -d '{"postId":"POST_ID","watchTimeMs":18000}'
```

## Testing
- Basic views: [test-reel-views.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/test-reel-views.js)
- Idempotency: [test-reel-views-idempotent.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/test-reel-views-idempotent.js)
- Vendor wallet reward: [test-reel-views-vendor.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/test-reel-views-vendor.js)
