# Post Routes

- POST /api/posts — Create post (auth)
- GET /api/posts/feed — Get feed (auth)
- GET /api/posts/saved — Get all saved posts (auth)
- GET /api/posts/{id} — Get post by ID (auth)
- DELETE /api/posts/{id} — Delete post (auth)
- POST /api/posts/{id}/like — Like post (auth)
- POST /api/posts/{id}/unlike — Unlike post (auth)
- GET /api/posts/{id}/likes — Get users who liked (auth)
- POST /api/posts/{id}/save — Save post (auth)
- POST /api/posts/{id}/unsave — Unsave post (auth)


# API Documentation for Posts

## Create Post

**POST** `/api/posts`

Auth: Bearer

Request Body
```json
{
  "caption": "string",
  "location": "string",
  "media": [
    { "fileName": "image.jpg", "type": "image" }
  ],
  "tags": ["string"],
  "people_tags": [{ "user_id": "string", "username": "string", "x": 0, "y": 0 }],
  "hide_likes_count": false,
  "turn_off_commenting": false,
  "type": "post"
}
```

Responses
- 201: Post created (Post object)

---

## Get Feed

**GET** `/api/posts/feed`

Auth: Bearer

Responses
- 200: Array of Post objects

---

## Get Post

**GET** `/api/posts/{id}`

Auth: Bearer

Path Params: `id`

Responses
- 200: Post object
- 404: Post not found

---

## Delete Post

**DELETE** `/api/posts/{id}`

Auth: Bearer

Responses
- 200: Post deleted
- 403: Not authorized
- 404: Post not found

---

## Like/Unlike Post

**POST** `/api/posts/{id}/like`

Auth: Bearer

Responses
- 200: `{ "message": "Liked", "likes_count": 12, "liked": true }`
- 400: Already liked
- 404: Post not found

**POST** `/api/posts/{id}/unlike`

Auth: Bearer

Responses
- 200: `{ "message": "Unliked", "likes_count": 11, "liked": false }`
- 400: Not liked yet
- 404: Post not found

---

## Get Post Likes

**GET** `/api/posts/{id}/likes`

Auth: Bearer

Responses
- 200:
```json
{
  "total": 2,
  "users": [
    { "_id": "string", "username": "string", "full_name": "string", "avatar_url": "string" }
  ]
}
```
- 404: Post not found

---

## Save/Unsave Post

**POST** `/api/posts/{id}/save`

Auth: Bearer

Responses
- 200: `{ "success": true, "message": "Post saved", "saved": true, "saved_count": 5 }`
- 400: Invalid postId
- 404: Post not found
- 409: Already saved

**POST** `/api/posts/{id}/unsave`

Auth: Bearer

Responses
- 200: `{ "success": true, "message": "Post unsaved", "saved": false, "saved_count": 4 }`
- 400: Invalid postId or Not saved yet
- 404: Post not found

---

## Get Saved Posts (All)

**GET** `/api/posts/saved`

Auth: Bearer

Responses
- 200:
```json
{
  "success": true,
  "posts": [{ /* Post object */ }]
}
```
