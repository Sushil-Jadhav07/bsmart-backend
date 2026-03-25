# B-Smart Backend Documentation

## 1. Project Overview

`bsmart-backend` is an Express + MongoDB backend for the B-Smart platform. It supports:

- User authentication with email/password and Google login
- Role-based access for `member`, `vendor`, `admin`, and `sales`
- Social features: posts, reels, comments, replies, likes, saves, follows, stories
- Vendor profiles and vendor verification workflows
- Ads with engagement rewards and coin-budget accounting
- Wallets and wallet transaction history
- Vendor package purchase flows
- Notifications with Socket.IO real-time delivery
- Country/state/city/language endpoints and Google Places search
- Swagger/OpenAPI documentation

The application entry point is [`server.js`](c:/Asynk%20clients/B-smart/bsmart-backend/server.js).

## 2. Tech Stack

- Runtime: Node.js
- Framework: Express 4
- Database: MongoDB via Mongoose 8
- Auth: JWT + Passport Google OAuth 2.0
- Real-time: Socket.IO
- Uploads: Multer
- Media conversion: `fluent-ffmpeg` + `ffmpeg-static`
- API docs: `swagger-jsdoc` + `swagger-ui-express`
- Testing: Node test runner, Jest, Supertest

Package metadata is defined in [`package.json`](c:/Asynk%20clients/B-smart/bsmart-backend/package.json).

## 3. Run Commands

```bash
npm install
npm start
```

Available scripts:

- `npm start`: starts the API with `node server.js`
- `npm run dev`: starts the API in watch mode
- `npm test`: runs `./test/ad_wallet_transactions.test.js`

Default port:

- `PORT=5000` if not supplied

Base local URL:

- `http://localhost:5000`

Swagger UI:

- `http://localhost:5000/api-docs`

Health check:

- `GET /api/health`

## 4. Required Environment Variables

There is no committed `.env.example` in this folder, so the required values are inferred from code.

Core:

- `MONGO_URI`: required for MongoDB connection
- `JWT_SECRET`: required for JWT signing and verification
- `PORT`: optional, defaults to `5000`
- `CLIENT_URL`: optional, used by Google OAuth callback redirect, defaults to `http://localhost:5173`

Google auth:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`

Google Places:

- `GOOGLE_PLACES_API_KEY`

Optional rate-limit tuning:

- `FEED_RATE_LIMIT_MAX`
- `FEED_RATE_LIMIT_WINDOW_MS`
- Similar `*_MAX` and `*_WINDOW_MS` keys may be used where dynamic rate limit middleware is configured

Test support:

- `MONGO_URI_TEST`

## 5. High-Level Architecture

Request flow:

1. `server.js` boots Express, HTTP server, Socket.IO, Swagger, Passport, static uploads, and route registration.
2. `src/config/db.js` connects to MongoDB.
3. Request enters middleware such as JWT auth, role checks, rate limits, and Multer upload handling.
4. Route handlers call controllers or inline handlers.
5. Controllers interact with Mongoose models and occasionally `runMongoTransaction`.
6. Responses are returned as JSON.
7. If a notification is generated, it is stored in MongoDB and optionally emitted over Socket.IO to online users.

Important runtime behaviors:

- Global `uncaughtException` and `unhandledRejection` handlers are installed at process startup.
- Uploaded files are served from `/uploads`.
- CORS is configured with `origin: '*'`.
- JSON and URL-encoded bodies are limited to `10mb`.
- Socket user presence is maintained in memory through a `Map<userId, socketId>`.

## 6. Folder Structure

```text
bsmart-backend/
  server.js
  package.json
  uploads/
  scripts/
  test/
  schema_json/
  src/
    config/
    controllers/
    data/
    documentation/
    middleware/
    models/
    routes/
    utils/
```

Primary responsibilities:

- `src/config`: DB, Passport, Multer, Swagger setup
- `src/controllers`: business logic
- `src/middleware`: auth, role checks, admin checks, rate limiting
- `src/models`: Mongoose schemas
- `src/routes`: public API surface
- `src/utils`: transactions, notifications, HLS conversion
- `src/documentation`: route-specific markdown notes already present in repo
- `scripts`: support scripts, migrations, local test helpers

## 7. Application Bootstrap

Defined in [`server.js`](c:/Asynk%20clients/B-smart/bsmart-backend/server.js).

What it does:

- Loads `.env`
- Creates Express app and HTTP server
- Creates Socket.IO server with permissive CORS
- Tracks online users by `register` socket event
- Exposes `io` and `onlineUsers` through `app.set(...)`
- Initializes Passport
- Mounts Swagger UI at `/api-docs`
- Mounts all API routes
- Exposes `/api/health`
- Registers a global Express error handler
- Connects to MongoDB before listening

## 8. Middleware

### 8.1 Authentication

[`src/middleware/auth.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/middleware/auth.js)

- Reads `Authorization: Bearer <token>`
- Verifies JWT using `JWT_SECRET`
- Loads the user from MongoDB
- Attaches:
  - `req.user`
  - `req.userId`

### 8.2 Role Guard

[`src/middleware/requireRole.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/middleware/requireRole.js)

- Accepts one or more roles
- Returns `403 Forbidden` if `req.user.role` is not allowed

### 8.3 Admin Guard

`requireAdmin.js` is used where admin-only access is needed.

### 8.4 Rate Limiting

[`src/middleware/rateLimit.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/middleware/rateLimit.js)

Features:

- In-memory sliding-window limiter
- Background cleanup every 5 minutes
- Stale bucket removal after 1 hour to avoid memory leaks
- Static limiter and dynamic limiter variants
- Dynamic limiter can expose headers:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Window-Ms`
  - `X-RateLimit-Remaining`

Known tradeoff:

- Rate-limit state is process-local and not shared across multiple server instances.

## 9. Database Layer

MongoDB connection lives in [`src/config/db.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/config/db.js).

Configured behaviors:

- `maxPoolSize: 10`
- `minPoolSize: 2`
- Fast failure on server selection timeout
- `bufferCommands: false`
- Reconnect and error logging hooks

If DB connection fails during startup, the process exits.

## 10. Authentication and Identity

### 10.1 Roles

The `User` model allows these roles:

- `member`
- `vendor`
- `admin`
- `sales`

### 10.2 Local Registration

Implemented in [`src/controllers/auth.controller.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/controllers/auth.controller.js).

Registration behavior:

- Validates role
- Requires password length `>= 6`
- Rejects duplicate `email` or `username`
- Hashes password with `bcryptjs`
- Creates a `Wallet` for every user with `balance: 0`
- Creates a role-specific profile:
  - `Member` for members
  - `Vendor` for vendors
  - `Sales` for sales users

Vendor-specific registration rules:

- `company_details.company_name` is required
- Company details are normalized before save
- Vendor profile starts with:
  - `validated: false`
  - `profile_completion_percentage: 30`
  - `credits: 0`

Important implementation note:

- Vendors do not receive registration coins anymore. Coins are added later through package purchase or admin recharge.

### 10.3 Login

Login flow:

- Validates email/password
- Rejects inactive members
- Loads user wallet
- Sends `login_alert` notifications to admins
- Returns JWT plus user payload

### 10.4 Google Login

There are two supported flows:

- Token-based login: `POST /api/auth/google/token`
- Passport redirect flow:
  - `GET /api/auth/google`
  - `GET /api/auth/google/callback`

Behavior:

- New Google users become `member`
- Wallet and Member profile are auto-created
- Existing email matches are linked to Google in Passport strategy

### 10.5 Password Changes

`POST /api/auth/change-password`

- Requires current password
- Requires new password length `>= 6`

## 11. Core Data Models

### 11.1 User

[`src/models/User.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/models/User.js)

Key fields:

- `email`, `password`, `username`
- `googleId`, `provider`
- `full_name`, `bio`, `avatar_url`, `phone`
- `age`, `gender`, `location`
- `address`
- `company_details`
- `role`
- count snapshots: `posts_count`, `followers_count`, `following_count`
- soft-delete fields: `isDeleted`, `deletedBy`, `deletedAt`

### 11.2 Member

Minimal profile linked by `user_id`.

### 11.3 Vendor

[`src/models/Vendor.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/models/Vendor.js)

Contains:

- `business_name`
- `logo_url`
- `company_details`
- `business_details`
- `online_presence`
- `social_media_links`
- `company_description`
- `validated`
- `profile_completion_percentage`
- `credits`
- `credits_expires_at`
- `assigned_sales_officer`
- soft-delete fields

### 11.4 Sales

Sales profile model supports territory/target style metadata and is linked to `User`.

### 11.5 Post

[`src/models/Post.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/models/Post.js)

Supports:

- `type`: `post`, `reel`, `promote`, `advertise`
- media arrays with crop/filter/thumbnail metadata
- caption, location, tags, tagged people
- like/comment/view counters
- `latest_comments` snapshot
- soft delete

### 11.6 Comment / Follow / SavedPost / PostView

These models support post discussion, social graph, saved content, and view/reward tracking.

### 11.7 Story / StoryItem / StoryView

Story system stores:

- parent story document
- story items
- expiry/archive status
- viewer records

### 11.8 Ad

[`src/models/Ad.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/models/Ad.js)

Key fields:

- `vendor_id`, `user_id`
- media metadata for image/video ads
- targeting fields
- product metadata
- `coins_reward`
- `total_budget_coins`
- `total_coins_spent`
- `status`: `pending`, `active`, `paused`, `rejected`
- engagement counters and likes/dislikes
- soft delete

Text index exists on:

- `caption`
- `hashtags`
- `tags`
- `location`

### 11.9 Wallet

One wallet per user:

- `user_id` is unique
- `balance`
- `currency` defaults to `Coins`

### 11.10 WalletTransaction

[`src/models/WalletTransaction.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/models/WalletTransaction.js)

This is the main financial ledger in the app.

Transaction groups include:

- Vendor credits and deductions
- Member rewards
- Ad-specific budget deductions
- Admin adjustments
- Legacy post action records

Important protections:

- Partial unique indexes prevent duplicate one-time rewards/deductions for the same user/ad/post
- History queries are indexed by `user_id` and `ad_id`

### 11.11 VendorPackage / VendorPackagePurchase

Used for vendor plan catalog and purchase history.

Package tiers:

- `basic`
- `standard`
- `premium`
- `enterprise`

Purchase rules:

- A vendor can have only one active package at a time
- Existing active package becomes `superseded` on new purchase
- Purchase stores a snapshot of pricing and package limits

### 11.12 Notification

[`src/models/notification.model.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/models/notification.model.js)

Notification types include:

- social actions like `like`, `comment`, `follow`
- moderation states like `vendor_approved`, `ad_rejected`
- wallet events like `coins_credited`, `coins_debited`
- login alert and story view events

## 12. Real-Time Notifications

Socket.IO is configured in [`server.js`](c:/Asynk%20clients/B-smart/bsmart-backend/server.js).

Connection flow:

1. Client connects
2. Client emits `register` with `userId`
3. Server maps `userId -> socket.id`
4. `sendNotification` creates a DB record
5. If recipient is online, server emits `new_notification`

Utility:

- [`src/utils/sendNotification.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/utils/sendNotification.js)

Operational note:

- Online user tracking is in-memory only. Restarting the process clears presence state.

## 13. Upload and Media Handling

### 13.1 Multer Uploads

[`src/config/multer.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/config/multer.js)

Behavior:

- Ensures `uploads/` exists
- Stores files on disk
- Uses timestamp-randomized filenames
- Allows common image and video formats
- Max file size: `500 MB`

### 13.2 Static Serving

- Uploaded files are exposed under `/uploads`

### 13.3 HLS Conversion

[`src/utils/convertToHls.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/utils/convertToHls.js)

Converts videos into:

- `index.m3u8`
- `segment%03d.ts`

Uses FFmpeg with:

- H.264 video
- AAC audio
- 6-second HLS segments

## 14. Transactions and Consistency

`runMongoTransaction` lives in [`src/utils/runMongoTransaction.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/utils/runMongoTransaction.js).

Behavior:

- Starts a MongoDB session
- Uses `withTransaction`
- If MongoDB transactions are unsupported, falls back to a non-transactional path when one is provided

Why it exists:

- Local standalone MongoDB setups often do not support transactions
- Production code still gets a transaction-aware path without breaking local development

## 15. API Surface by Module

This section describes the route groups actually mounted in `server.js`.

### 15.1 Auth Routes

Mount path: `/api/auth`

Main endpoints:

- `POST /register`
- `POST /login`
- `POST /google/token`
- `GET /me`
- `POST /change-password`
- `GET /users`
- `GET /google`
- `GET /google/callback`

### 15.2 User Routes

Mount path: `/api/users`

Main endpoints:

- `GET /`
- `GET /:id`
- `GET /:id/posts`
- `GET /:id/followers`
- `GET /:id/following`
- `GET /:id/saved`
- `PUT /:id`
- `PATCH /:id/status`
- `DELETE /:id`

### 15.3 Vendor Routes

Mount path: `/api/vendors`

Main endpoints:

- `POST /`
- `GET /me`
- `GET /users/:id`
- `GET /`
- `GET /profile/:userId`
- `POST /profile/:userId`
- contact management routes
- admin vendor verification and delete routes
- vendor profile view reward route

### 15.4 Member Routes

Mount path: `/api/members`

Main endpoints:

- `GET /me`
- `GET /users/:id`

Additional v1 member routes:

Mount path: `/api/v1/member`

- `PATCH /profile`
- `PUT /profile`
- `GET /ads/:adId/transactions`
- `GET /transactions`

### 15.5 Sales Routes

Mount path: `/api/sales`

Main endpoints:

- `GET /me`
- `PUT /me`
- `GET /users/:id`
- `GET /officers`
- `POST /assign`
- `DELETE /assign/:vendor_user_id`
- `GET /my-officer`
- `GET /officers/:sales_user_id/vendors`

### 15.6 Post Routes

Mount path: `/api/posts`

Main endpoints:

- `POST /`
- `GET /feed`
- `POST /reels`
- `GET /reels`
- `GET /reels/:id`
- `GET /saved`
- `GET /:id/stats`
- `GET /:id`
- `DELETE /:id`
- `POST /:id/like`
- `POST /:id/unlike`
- `GET /:id/likes`
- `POST /:id/save`
- `POST /:id/unsave`

### 15.7 Comment Routes

Mounted under `/api`

Main endpoints:

- `POST /posts/:postId/comments`
- `GET /posts/:postId/comments`
- `DELETE /comments/:id`
- `POST /comments/:commentId/like`
- `POST /comments/:commentId/unlike`
- `GET /comments/:commentId/replies`

### 15.8 Follow Routes

Mounted under `/api`

Main endpoints:

- `POST /follow`
- `POST /unfollow`
- `GET /users/:id/followers`
- `GET /users/:id/following`
- `GET /followers`
- `GET /following`
- `POST /follows/:userId`

### 15.9 Story Routes

Mount path: `/api/stories`

Main endpoints:

- `POST /`
- `GET /feed`
- `GET /:storyId/items`
- `POST /items/:itemId/view`
- `GET /:storyId/views`
- `POST /upload`
- `GET /archive`
- `DELETE /:storyId`

### 15.10 Upload Routes

Mount path: `/api/upload`

Main endpoints:

- `POST /`
- `POST /thumbnail`
- `POST /avatar`

### 15.11 View Routes

Mount path: `/api/views`

Main endpoints:

- `POST /`
- `POST /complete`

These appear to support view-progress and completion tracking for rewarded viewing flows.

### 15.12 Ad Routes

Mount path: `/api/ads`

Main endpoints:

- `GET /categories`
- `POST /categories`
- `GET /feed`
- `GET /user/:userId`
- `GET /`
- `POST /`
- `GET /search`
- `GET /:id/stats`
- `GET /:id`
- `DELETE /:id`
- `POST /:id/view`
- engagement completion routes
- save/unsave routes
- ad comment and ad comment reply routes

Important note:

- `GET /api/ads` is admin-protected in route registration.

### 15.13 Admin Routes

Mount path: `/api/admin`

Main endpoints include admin moderation/deletion for:

- posts
- comments
- replies
- reels
- stories
- users
- vendors
- ads

### 15.14 Wallet Routes

Mount path: `/api/wallet`

Main endpoints:

- `GET /me`
- `GET /member/:userId/history`
- `GET /vendor/:userId/history`
- `POST /vendor/:userId/recharge`
- `GET /ads/:adId/history`
- `GET /`
- `POST /admin/adjust`

### 15.15 Vendor Package Routes

Mount path: `/api/vendor-packages`

Admin:

- `POST /admin`
- `GET /admin/purchases`
- `PUT /admin/:packageId`
- `DELETE /admin/:packageId`

Vendor:

- `GET /my/active`
- `POST /my/coin-preview`
- `GET /my/history`
- `GET /my/transactions`
- `POST /:packageId/buy`

General authenticated:

- `GET /`
- `GET /:packageId/preview`
- `GET /:packageId`

Route-order dependency:

- Static `/admin/*` and `/my/*` routes must stay above `/:packageId`.

### 15.16 Notification Routes

Mount path: `/api/notifications`

Endpoints:

- `GET /`
- `GET /unread-count`
- `PATCH /mark-all-read`
- `PATCH /:id/read`
- `DELETE /:id`

### 15.17 Country and Language Routes

Mounted as:

- `/api/countries`
- `/api/states`
- `/api/cities`
- `/api/languages`

Supported patterns:

- `GET /api/countries/all`
- `GET /api/countries/:country`
- `GET /api/countries/:country/states`
- `GET /api/countries/:country/states/:state/cities`
- `GET /api/countries/:country/languages`
- plus legacy flat endpoints

### 15.18 Location Search

Mount path: `/api/location`

Endpoint:

- `GET /search`

Behavior:

- JWT-protected
- Calls Google Places Autocomplete API
- Accepts `query`
- Accepts optional `sessionToken` for billing/session grouping

## 16. Wallet System

The wallet system is one of the most important parts of this backend.

### 16.1 Wallet Creation

Wallets are created automatically on:

- local registration
- Google login registration

### 16.2 Wallet Consumers

- Members receive rewards from ads, reels, and vendor profile view logic
- Vendors receive coins from package purchase or admin recharge
- Vendors spend coins on ad budgets and other engagement deductions
- Admins can adjust balances manually

### 16.3 Transaction Semantics

The code treats some transaction types as debits even if raw stored amount handling is inconsistent across flows. Response serializers normalize direction and sign for clients.

Examples of debit-classified types:

- `AD_VIEW_DEDUCTION`
- `AD_LIKE_DEDUCTION`
- `AD_COMMENT_DEDUCTION`
- `AD_REPLY_DEDUCTION`
- `AD_SAVE_DEDUCTION`
- `AD_BUDGET_DEDUCTION`
- `VENDOR_PROFILE_VIEW_DEDUCTION`

### 16.4 Wallet Reporting

Wallet APIs support:

- self wallet view
- member history with summary
- vendor history with summary
- per-ad budget and action history
- platform-wide admin wallet analytics

## 17. Vendor Package System

Implemented mainly in [`src/controllers/vendorPackage.controller.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/controllers/vendorPackage.controller.js).

### 17.1 Purpose

Vendor packages define:

- number of ads allowed
- pricing
- discount
- validity
- coins granted

### 17.2 Purchase Flow

When a vendor buys a package:

1. Package is validated
2. Vendor profile is validated for existence
3. Existing active package purchases are marked `superseded`
4. New purchase record is created
5. Vendor wallet is incremented
6. `VENDOR_PACKAGE_PURCHASE` transaction is logged
7. Vendor credit snapshot and expiry are updated

### 17.3 Coin Preview Logic

Budget conversion:

- Vendor coin base rate is `₹1 = 4 coins`
- `basic` and `standard`:
  - only base coins
- `premium` and `enterprise`:
  - base coins plus additional coins equal to budget amount

Example:

- `budget_inr = 10000`
- Premium:
  - base = `40000`
  - bonus = `10000`
  - total = `50000`

## 18. Notifications

Notification storage and retrieval are database-backed.

Supported features:

- recent notification fetch
- unread count
- mark one read
- mark all read
- delete notification
- real-time push if recipient is online

Notable producers in code:

- login alerts to admins
- wallet credit/debit events
- other social/ad flows through shared notification utility

## 19. Swagger Documentation

Swagger config is in [`src/config/swagger.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/config/swagger.js).

Configured servers:

- `http://localhost:5000`
- `https://api.bebsmart.in/`

Swagger source scanning:

- `./src/routes/*.js`

Important consequence:

- Only routes documented in route files appear in Swagger.
- Internal utilities, models, and some behavioral rules are not captured there, which is one reason this document is needed.

## 20. Existing Repo Documentation

The repository already contains these documentation artifacts:

- [`FULL_API_DOCUMENTATION.md`](c:/Asynk%20clients/B-smart/bsmart-backend/FULL_API_DOCUMENTATION.md)
- [`ADMIN_DASHBOARD_AD_ENGAGEMENT_DOCUMENTATION.md`](c:/Asynk%20clients/B-smart/bsmart-backend/ADMIN_DASHBOARD_AD_ENGAGEMENT_DOCUMENTATION.md)
- route-specific markdown files under [`src/documentation`](c:/Asynk%20clients/B-smart/bsmart-backend/src/documentation)

This new document is the broader system-level reference.

## 21. Scripts and Utilities

Interesting support files:

- `scripts/migrations/20260311_wallet_transactions_update.js`
- `scripts/remove-unique-index.js`
- `scripts/test-e2e-users.js`
- `scripts/test-notification-socket.js`
- `verify_db_persistence.js`
- `demo_usage.js`
- `demo_full_flow.js`
- `test/ad_wallet_transactions.test.js`

These indicate active work around:

- wallet transaction schema evolution
- notification socket validation
- ad reward flow testing

## 22. Operational Notes

### 22.1 Strengths

- Clear separation of routes/controllers/models
- Good support for wallet audit history
- Transaction fallback strategy helps local development
- Swagger coverage is fairly broad
- Notification system supports both persistence and realtime delivery

### 22.2 Important Caveats

- In-memory rate limiting is not horizontally shared
- Online user socket mapping is not persistent
- CORS is fully open
- There is no checked-in `.env.example`
- Some older documentation still mentions vendor registration credits, but current code sets vendor starting balance to `0`
- Several route files are large and contain both controller wiring and inline logic, which increases maintenance risk

### 22.3 Deployment Considerations

Recommended for production:

- Provide a strong `JWT_SECRET`
- Use replica-set MongoDB if you want full transaction support
- Put uploads on persistent storage
- Add reverse proxy limits and access logs
- Lock down CORS origins
- Monitor disk growth in `uploads/`

## 23. Recommended Onboarding Order

For a developer joining the project, read in this order:

1. [`package.json`](c:/Asynk%20clients/B-smart/bsmart-backend/package.json)
2. [`server.js`](c:/Asynk%20clients/B-smart/bsmart-backend/server.js)
3. [`src/config/db.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/config/db.js)
4. [`src/middleware/auth.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/middleware/auth.js)
5. [`src/controllers/auth.controller.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/controllers/auth.controller.js)
6. [`src/models/User.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/models/User.js)
7. [`src/models/Wallet.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/models/Wallet.js)
8. [`src/models/WalletTransaction.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/models/WalletTransaction.js)
9. [`src/controllers/wallet.controller.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/controllers/wallet.controller.js)
10. [`src/controllers/vendorPackage.controller.js`](c:/Asynk%20clients/B-smart/bsmart-backend/src/controllers/vendorPackage.controller.js)
11. [`src/routes`](c:/Asynk%20clients/B-smart/bsmart-backend/src/routes)

## 24. Summary

`bsmart-backend` is a multi-role social-commerce backend centered on:

- identity and role management
- social posting and engagement
- vendor monetization
- reward accounting through wallets
- admin moderation and reporting
- realtime notifications

The most business-critical modules are:

- authentication
- wallet transactions
- ad engagement flows
- vendor package purchase logic
- vendor profile and admin controls
