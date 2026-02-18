# B-Smart Backend API Context (For AI Assistants)

## System Overview
**Project:** B-Smart Backend
**Stack:** Node.js, Express, MongoDB (Mongoose)
**Auth:** JWT Bearer Token
**Base URL:** `http://localhost:5000/api`

## Core Data Models

### User
```json
{
  "_id": "ObjectId",
  "username": "string",
  "email": "string",
  "role": "member|vendor|admin",
  "wallet": { "balance": number, "currency": "Coins" },
  "avatar_url": "string"
}
```

### Post
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (User)",
  "caption": "string",
  "media": [{ "fileName": "string", "type": "image|video", "fileUrl": "string" }],
  "likes_count": number,
  "comments_count": number,
  "createdAt": "ISO Date"
}
```

### Comment
```json
{
  "_id": "ObjectId",
  "post_id": "ObjectId (Post)",
  "user": "Object (User)",
  "text": "string",
  "parent_id": "ObjectId (Comment) | null",
  "replies": ["Array of Comment (if fetched)"],
  "likes_count": number
}
```

### Story
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId",
  "items": [{ "media": { "url": "string", "type": "image|reel" }, "viewed": boolean }],
  "expiresAt": "ISO Date"
}
```

## API Reference

### Auth (`/auth`)
- `POST /register` -> Body: `{username, email, password, role}` -> Res: `{token, user}`
- `POST /login` -> Body: `{email, password}` -> Res: `{token, user}`
- `GET /me` -> Res: `{user}`
- `GET /users` -> Res: `[{user, posts: []}]`

### Users (`/users`)
- `GET /` -> List users
- `GET /:id` -> Get user details
- `GET /:id/posts` -> Get user posts
- `GET /:id/saved` -> Get saved posts
- `PUT /:id` -> Update user profile
- `DELETE /:id` -> Delete user

### Posts (`/posts`)
- `POST /` -> Body: `{caption, media: []}` -> Create post
- `GET /feed` -> Get main feed
- `GET /saved` -> Get saved posts
- `GET /:id` -> Get single post
- `DELETE /:id` -> Delete post
- `POST /:id/like` | `POST /:id/unlike` -> Toggle like
- `POST /:id/save` | `POST /:id/unsave` -> Toggle save

### Comments (Nested)
- `POST /posts/:postId/comments` -> Body: `{text, parent_id?}` -> Add comment/reply
- `GET /posts/:postId/comments` -> List comments
- `DELETE /comments/:id` -> Delete comment
- `POST /comments/:id/like` | `POST /comments/:id/unlike` -> Toggle like
- `GET /comments/:id/replies` -> Get replies

### Follow (`/`)
- `POST /follow` -> Body: `{followedUserId}`
- `POST /unfollow` -> Body: `{followedUserId}`
- `GET /users/:id/followers`
- `GET /users/:id/following`

### Stories (`/stories`)
- `POST /` -> Create/Append story
- `GET /feed` -> Story feed
- `GET /:storyId/items` -> Story items
- `POST /items/:itemId/view` -> Mark viewed
- `POST /upload` -> Upload media

### Vendors (`/vendors`)
- `POST /` -> Create vendor
- `GET /me` -> Get my vendor profile

### Members (`/members`)
- `GET /me` -> Get my member profile

### Upload (`/upload`)
- `POST /` -> Multipart `file` -> Res: `{fileUrl}`
- `POST /avatar` -> Multipart `file` -> Updates `user.avatar_url`, returns `{fileUrl, user}`
