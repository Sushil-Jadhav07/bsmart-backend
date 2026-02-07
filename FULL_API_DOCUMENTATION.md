# B-Smart Backend API Documentation (Full Guide)

This documentation provides a complete guide to the B-Smart Backend features, including Authentication, Roles, Wallet System, and Social Interactions (Posts, Comments, Replies, Likes).

---

## 1. Overview & Features

-   **Tech Stack:** Node.js, Express, MongoDB (Mongoose), JWT Auth.
-   **Authentication:** 
    -   JWT-based (Access Tokens).
    -   Roles: `member` (Default), `vendor`, `admin`.
    -   Google OAuth support.
-   **Wallet System:**
    -   **Separate Collection:** Wallets are stored in a dedicated `wallets` collection.
    -   **Auto-Creation:** Wallets are created automatically on registration.
    -   **Initial Balance:** `vendor` = 5000 Coins, `member` = 0 Coins.
-   **Social Features:**
    -   **Posts:** Create, Read, Delete (with media support).
    -   **Comments:** Top-level comments on posts.
    -   **Replies:** Instagram-style one-level threading (replies to replies become siblings). *Note: The Post object includes `latest_comments` array which contains nested `replies` for efficient feed preview.*
    -   **Likes:** Like/Unlike comments and replies.

---

## 2. Getting Started

### Prerequisites
-   Node.js & npm installed.
-   MongoDB running locally (`mongodb://127.0.0.1:27017/b_smart`).

### Running the Server
```bash
npm install
npm start
```
*Server runs on `http://localhost:5000`.*

### API Documentation (Swagger)
Visit: `http://localhost:5000/api-docs`

---

## 3. Detailed Feature Walkthrough (Step-by-Step)

This section mirrors the flow of our automated test script (`demo_full_flow.js`).

### Step 1: User Registration (Roles & Wallet)

You can register as a **Member** or a **Vendor**. The system assigns an initial wallet balance based on the role.

**Endpoint:** `POST /api/auth/register`

**Scenario A: Vendor Registration**
```json
{
  "username": "vendor_user",
  "email": "vendor@test.com",
  "password": "password123",
  "role": "vendor"
}
```
**Result:**
-   User created with role `vendor`.
-   Wallet created with balance **5000**.

**Scenario B: Member Registration**
```json
{
  "username": "member_user",
  "email": "member@test.com",
  "password": "password123",
  "role": "member"
}
```
**Result:**
-   User created with role `member`.
-   Wallet created with balance **0**.

### Step 2: Login & Data Persistence

When you login, the backend fetches your wallet data from the `wallets` collection and merges it into the user object.

**Endpoint:** `POST /api/auth/login`

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1Ni...",
  "user": {
    "id": "...",
    "username": "vendor_user",
    "role": "vendor",
    "wallet": {
      "balance": 5000,
      "currency": "Coins"
    }
  }
}
```

### Step 3: Creating a Post

Only authenticated users can create posts.

**Endpoint:** `POST /api/posts`
**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "caption": "Check out my new product!",
  "media": [{ "fileName": "image.jpg", "type": "image", "ratio": 1 }]
}
```

### Step 4: Commenting (Top-Level)

Users can comment on posts.

**Endpoint:** `POST /api/posts/:postId/comments`
**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "text": "How much is this?"
}
```

### Step 5: Replying (One-Level Threading)

Users can reply to a comment. **Note:** If you try to reply to a reply, the system will flatten it (Instagram style) or reject it depending on configuration. Currently, we support one level of nesting (Comment -> Reply).

**Endpoint:** `POST /api/posts/:postId/comments`
**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "text": "It costs 50 coins.",
  "parent_id": "ID_OF_THE_PARENT_COMMENT"
}
```

### Step 6: Liking a Comment/Reply

Users can like comments or replies.

**Endpoint:** `POST /api/comments/:commentId/like`
**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "message": "Comment liked",
  "likes_count": 1
}
```

### Step 7: Fetching Replies

To see the conversation thread.

**Endpoint:** `GET /api/comments/:commentId/replies`
**Query Params:** `?page=1&limit=10`

**Response:**
```json
{
  "replies": [
    {
      "_id": "...",
      "text": "It costs 50 coins.",
      "user": { "username": "vendor_user", ... },
      "createdAt": "..."
    }
  ],
  "pagination": { ... }
}
```

---

## 4. Automated Testing

We have created a comprehensive test script that runs through this entire flow automatically to verify system health.

### Running the Full Test
```bash
node demo_full_flow.js
```

**What it does:**
1.  Registers a **Vendor** (Verifies 5000 balance).
2.  Registers a **Member** (Verifies 0 balance).
3.  **Vendor** creates a Post.
4.  **Member** comments on the Post.
5.  **Vendor** replies to the Member.
6.  **Member** likes the Reply.
7.  Fetches replies to verify the thread.

**Expected Output:**
```text
=== B-Smart Full Feature End-to-End Test ===
[STEP] Registering a VENDOR user...
  ✓ Vendor registered: vendor_1770...
  ✓ Vendor Wallet Balance verified: 5000 Coins
...
=== ALL TESTS PASSED SUCCESSFULLY ===
```

---

## 5. Troubleshooting Common Issues

1.  **"Wallet not found" in DB:**
    -   Ensure you are using the latest `auth.controller.js`. The wallet is now in a separate `wallets` collection, linked by `user_id`.
    
2.  **Login returns no wallet:**
    -   The `login` controller automatically performs a lookup in the `wallets` collection. If missing, check if the user was created before the wallet logic was added.

3.  **Cannot reply to a reply:**
    -   This is by design (One-level threading). The `parent_id` must always point to a top-level comment.

4.  **Swagger "Unauthorized":**
    -   Click the "Authorize" button in Swagger UI.
    -   Paste the token **without** the "Bearer " prefix (Swagger adds it automatically).
