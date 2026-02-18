# Auth Routes

- POST /api/auth/register — Register user (roles: member|vendor), auto wallet
- POST /api/auth/login — Login and return token + user with wallet
- GET /api/auth/me — Get current user profile (auth required)
- GET /api/auth/users — List users with posts/comments/likes (auth required)
- GET /api/auth/google — Initiate Google OAuth
- GET /api/auth/google/callback — Google OAuth callback, redirects with JWT


# API Documentation

## Authentication Management

This is the API documentation for the authentication and user management system.

### Base URL
- All endpoints are mounted under `/api/auth`

### Authorization
- Use JWT bearer token for protected endpoints
- Header: `Authorization: Bearer <TOKEN>`

### Swagger Documentation

#### Register a New User

**POST** `/api/auth/register`

##### Request Body

```json
{
  "email": "string",
  "password": "string",
  "username": "string",
  "full_name": "string",
  "phone": "string",
  "role": "member|vendor"
}
```

##### Responses

- **201**: User registered successfully
- **400**: User already exists or invalid role
- **500**: Server error

###### Example Response (201)
```json
{
  "token": "JWT_TOKEN",
  "user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "full_name": "string",
    "avatar_url": "string",
    "phone": "string",
    "role": "member",
    "wallet": { "balance": 5000, "currency": "Coins" }
  }
}
```

---

#### Login User

**POST** `/api/auth/login`

##### Request Body

```json
{
  "email": "string",
  "password": "string"
}
```

##### Responses

- **200**: Login successful
- **400**: Invalid credentials
- **500**: Server error

###### Example Response (200)
```json
{
  "token": "JWT_TOKEN",
  "user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "full_name": "string",
    "avatar_url": "string",
    "phone": "string",
    "role": "member",
    "wallet": { "balance": 0, "currency": "Coins" }
  }
}
```

---

#### Get Current User Profile

**GET** `/api/auth/me`

##### Responses

- **200**: User profile retrieved successfully
- **401**: Not authorized
- **404**: User not found
- **500**: Server error

###### Example Response (200)
```json
{
  "id": "string",
  "username": "string",
  "email": "string",
  "full_name": "string",
  "avatar_url": "string",
  "phone": "string",
  "role": "member|vendor|admin",
  "wallet": {
    "balance": 5000,
    "currency": "Coins"
  },
  "createdAt": "2026-02-18T00:00:00.000Z",
  "updatedAt": "2026-02-18T00:00:00.000Z"
}
```

---

#### Get All Users

**GET** `/api/auth/users`

##### Responses

- **200**: List of users with embedded posts
- **500**: Server error

###### Example Response (200)
```json
[
  {
    "id": "string",
    "username": "string",
    "email": "string",
    "full_name": "string",
    "avatar_url": "string",
    "role": "member",
    "posts": [
      {
        "_id": "string",
        "caption": "string",
        "media": [{ "fileName": "string", "type": "image", "fileUrl": "string" }],
        "likes_count": 0,
        "comments_count": 0,
        "createdAt": "2026-02-18T00:00:00.000Z"
      }
    ]
  }
]
```

---

#### Google Authentication

**GET** `/api/auth/google`

Redirects user to Google login page.

##### Response

- **302**: Redirects to Google

---

#### Google Authentication Callback

**GET** `/api/auth/google/callback`

##### Query Parameters

- **code**: Authorization code from Google

##### Responses

- **302**: Redirects to frontend with JWT token
- **401**: Authentication failed

###### Redirect URL Format
`{CLIENT_URL}/auth/google/success?token=<JWT_TOKEN>`

---

## Components

### User

```json
{
  "id": "string",
  "username": "string",
  "email": "string",
  "full_name": "string",
  "avatar_url": "string",
  "phone": "string",
  "role": "member|vendor|admin",
  "wallet": {
    "balance": "number",
    "currency": "string"
  },
  "createdAt": "string",
  "updatedAt": "string"
}
```

### UserWithPosts

```json
{
  "id": "string",
  "username": "string",
  "email": "string",
  "full_name": "string",
  "avatar_url": "string",
  "phone": "string",
  "role": "member|vendor|admin",
  "wallet": {
    "balance": "number",
    "currency": "string"
  },
  "createdAt": "string",
  "updatedAt": "string",
  "posts": [
    { "post_id": "string", "caption": "string", "media": [{ "fileName": "string", "type": "image", "fileUrl": "string" }], "likes_count": 0 }
  ]
}
```
