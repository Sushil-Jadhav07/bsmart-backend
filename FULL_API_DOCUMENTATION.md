# B-Smart Backend API Documentation (Full Guide)

This documentation provides a complete guide to the B-Smart Backend features, including Authentication, User Management, Social Interactions (Posts, Comments, Stories), and Media Handling.

---

## Table of Contents

1.  [Overview & Features](#1-overview--features)
2.  [Getting Started](#2-getting-started)
3.  [Authentication & Users](#3-authentication--users)
    *   [Auth Routes](#auth-routes)
    *   [User Routes](#user-routes)
    *   [Vendor Routes](#vendor-routes)
    *   [Member Routes](#member-routes)
4.  [Social Core](#4-social-core)
    *   [Post Routes](#post-routes)
    *   [Comment Routes](#comment-routes)
    *   [Follow Routes](#follow-routes)
5.  [Media & Engagement](#5-media--engagement)
    *   [Story Routes](#story-routes)
    *   [Upload Routes](#upload-routes)
    *   [View Routes](#view-routes)
6.  [Troubleshooting](#6-troubleshooting)

---

## 1. Overview & Features

-   **Base URL:** `http://localhost:5000/api`
-   **Authentication:** JWT Bearer Token (`Authorization: Bearer <TOKEN>`)
-   **Roles:** `member` (Default), `vendor`, `admin`.
-   **Wallet System:** Auto-created on registration. Vendors start with 5000 Coins.

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

## 3. Authentication & Users

### Auth Routes
**Base URL:** `/api/auth`

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/register` | Register new user (member/vendor/admin) | Public |
| `POST` | `/login` | Login and receive JWT | Public |
| `GET` | `/me` | Get current user profile | Bearer |
| `GET` | `/users` | List users with stats | Bearer |
| `GET` | `/google` | Google OAuth login | Public |

#### Register Example
`POST /api/auth/register`
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "securepassword",
  "role": "vendor",
  "company_details": { "company_name": "Acme Inc" }
}
```

#### Login Response Example
```json
{
  "token": "eyJhbGciOiJIUzI1Ni...",
  "user": {
    "id": "64f8c...",
    "username": "johndoe",
    "role": "vendor",
    "wallet": { "balance": 5000, "currency": "Coins" }
  }
}
```

### User Routes
**Base URL:** `/api/users`

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | List user profiles with stats | Bearer |
| `GET` | `/{id}` | Get user details | Public |
| `GET` | `/{id}/posts` | Get user's posts | Public |
| `GET` | `/{id}/saved` | Get user's saved posts | Bearer |
| `PUT` | `/{id}` | Update user profile | Bearer |
| `DELETE` | `/{id}` | Delete user account | Bearer |

### Vendor Routes
**Base URL:** `/api/vendors`

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | Create vendor profile | Bearer |
| `GET` | `/me` | Get my vendor profile | Bearer |
| `GET` | `/users/{id}` | Get vendor by user ID | Public |
| `GET` | `/validate` | List validated vendors | Bearer (admin) |
| `GET` | `/invalidate` | List invalidated vendors | Bearer (admin) |

### Member Routes
**Base URL:** `/api/members`

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/me` | Get my member profile | Bearer |
| `GET` | `/users/{id}` | Get member by user ID | Public |

---

## 4. Social Core

### Post Routes
**Base URL:** `/api/posts`

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | Create a new post | Bearer |
| `GET` | `/feed` | Get main feed | Bearer |
| `GET` | `/saved` | Get all saved posts | Bearer |
| `GET` | `/{id}` | Get single post | Bearer |
| `DELETE` | `/{id}` | Delete a post | Bearer |
| `POST` | `/{id}/like` | Like a post | Bearer |
| `POST` | `/{id}/unlike` | Unlike a post | Bearer |
| `POST` | `/{id}/save` | Save a post | Bearer |
| `POST` | `/{id}/unsave` | Unsave a post | Bearer |

#### Create Post Example
`POST /api/posts`
```json
{
  "caption": "My new product!",
  "media": [{ "fileName": "img1.jpg", "type": "image" }],
  "tags": ["product", "launch"]
}
```

### Comment Routes
**Base URL:** `/api` (Nested paths)

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/posts/{postId}/comments` | Add comment/reply | Bearer |
| `GET` | `/posts/{postId}/comments` | List comments | Public |
| `DELETE` | `/comments/{id}` | Delete comment | Bearer |
| `POST` | `/comments/{id}/like` | Like comment | Bearer |
| `POST` | `/comments/{id}/unlike` | Unlike comment | Bearer |
| `GET` | `/comments/{id}/replies` | Get replies | Public |

#### Add Reply Example
`POST /api/posts/{postId}/comments`
```json
{
  "text": "This is a reply",
  "parent_id": "PARENT_COMMENT_ID"
}
```

### Follow Routes
**Base URL:** `/api`

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/follow` | Follow user (body: `{followedUserId}`) | Bearer |
| `POST` | `/unfollow` | Unfollow user (body: `{followedUserId}`) | Bearer |
| `GET` | `/users/{id}/followers` | List followers | Public |
| `GET` | `/users/{id}/following` | List following | Public |

---

## 5. Media & Engagement

### Story Routes
**Base URL:** `/api/stories`

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | Create/append story | Bearer |
| `GET` | `/feed` | Active stories feed | Bearer |
| `GET` | `/{storyId}/items` | Get story items | Bearer |
| `POST` | `/items/{itemId}/view` | Mark item viewed | Bearer |
| `GET` | `/{storyId}/views` | Get viewers (owner only) | Bearer |
| `POST` | `/upload` | Upload story media | Bearer |
| `GET` | `/archive` | Get archived stories | Bearer |
| `DELETE` | `/{storyId}` | Delete story | Bearer |

#### Create Story Example
`POST /api/stories`
```json
{
  "items": [{
    "media": [{ "url": "http://...", "type": "image" }],
    "transform": { "x": 0.5, "y": 0.5, "scale": 1 }
  }]
}
```

### Upload Routes
**Base URL:** `/api/upload`

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | Upload file (multipart/form-data) | Bearer |
| `POST` | `/avatar` | Upload avatar and update user | Bearer |

**Response:**
```json
{
  "fileName": "file.jpg",
  "fileUrl": "http://localhost:5000/uploads/file.jpg"
}
```

### Ads Routes
**Base URL:** `/api/ads`

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/categories` | Get all ad categories | Public |
| `GET` | `/feed` | Get active ads feed for user | Bearer |
| `GET` | `/{id}` | Get ad details | Bearer |
| `POST` | `/` | Create a new ad (Vendor only) | Bearer |
| `POST` | `/{id}/view` | Record ad view | Bearer |
| `POST` | `/{id}/complete` | Complete ad view & claim reward | Bearer |
| `POST` | `/{id}/like` | Like/Unlike an ad | Bearer |
| `POST` | `/{id}/comments` | Add comment to ad | Bearer |
| `GET` | `/{id}/comments` | Get comments for ad | Bearer |
| `DELETE` | `/comments/{id}` | Delete ad comment | Bearer |

#### Admin Ad Routes
**Base URL:** `/api/admin/ads`

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | List all ads (Admin dashboard) | Admin |
| `PATCH` | `/{id}` | Update ad status (approve/reject) | Admin |
| `DELETE` | `/{id}` | Soft delete ad | Admin |

#### Create Ad Example
`POST /api/ads`
```json
{
  "title": "Summer Sale",
  "video_url": "http://example.com/video.mp4",
  "coins_reward": 50,
  "category": "Electronics",
  "duration_seconds": 30
}
```

### Wallet Routes
**Base URL:** `/api/wallet`

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/me` | Get my balance & transactions | Bearer |
| `GET` | `/` | Admin: Get all wallets/transactions | Admin |

**Response Example:**
```json
{
  "wallet": { "balance": 150, "currency": "Coins" },
  "transactions": [
    { "type": "AD_REWARD", "amount": 50, "status": "SUCCESS" }
  ]
}
```

### View Routes
**Base URL:** `/api/views`

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | Record view start | Bearer |
| `POST` | `/complete` | Complete view (reward) | Bearer |

---

## 6. Troubleshooting

1.  **"Wallet not found" in DB:**
    -   Ensure you are using the latest `auth.controller.js`. The wallet is now in a separate `wallets` collection, linked by `user_id`.

2.  **Login returns no wallet:**
    -   The `login` controller automatically performs a lookup in the `wallets` collection. If missing, check if the user was created before the wallet logic was added.

3.  **Cannot reply to a reply:**
    -   This is by design (One-level threading). The `parent_id` must always point to a top-level comment.

4.  **Swagger "Unauthorized":**
    -   Click the "Authorize" button in Swagger UI.
    -   Paste the token **without** the "Bearer " prefix (Swagger adds it automatically).
