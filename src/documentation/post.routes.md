# Post Routes

- POST /api/posts — Create post or reel (auth)
- GET /api/posts/feed — Get posts feed (auth)
- GET /api/posts/{id} — Get single post (auth)
- DELETE /api/posts/{id} — Delete post (auth, owner-only)
- POST /api/posts/{id}/like — Like post (auth)
- POST /api/posts/{id}/unlike — Unlike post (auth)
- GET /api/posts/{id}/likes — List users who liked post (auth)
- POST /api/posts/{id}/save — Save post (auth)
- POST /api/posts/{id}/unsave — Unsave post (auth)



# API Documentation for Post System

## Post System

This is the API documentation for the post system, including post creation, feed retrieval, liking/unliking posts, and saving/unsaving posts.

### Swagger Documentation

#### Create a New Post

**POST** `/api/posts`

##### Request Body

```json
{
  "caption": "string",
  "location": "string",
  "media": [
    { ... }  // MediaItem object
  ],
  "tags": ["string"],
  "people_tags": [
    { "user_id": "string", "username": "string", "x": 0, "y": 0 }
  ],
  "hide_likes_count": false,
  "turn_off_commenting": false,
  "type": "post"  // post, reel, promote, advertise
}
```

##### Responses

- **201**: Post created successfully
- **400**: Invalid input

---

#### Get Posts Feed

**GET** `/api/posts/feed`

##### Responses

- **200**: List of posts

---

#### Get a Single Post by ID

**GET** `/api/posts/{id}`

##### Responses

- **200**: Post details
- **404**: Post not found

---

#### Delete a Post

**DELETE** `/api/posts/{id}`

##### Responses

- **200**: Post deleted successfully
- **403**: Not authorized
- **404**: Post not found

---

#### Like a Post

**POST** `/api/posts/{id}/like`

##### Responses

- **200**: Liked successfully
- **400**: Already liked
- **404**: Post not found

---

#### Unlike a Post

**POST** `/api/posts/{id}/unlike`

##### Responses

- **200**: Unliked successfully
- **400**: Not liked yet
- **404**: Post not found

---

#### Get Users Who Liked a Post

**GET** `/api/posts/{id}/likes`

##### Responses

- **200**: List of users who liked the post
- **404**: Post not found

---

#### Save a Post

**POST** `/api/posts/{id}/save`

##### Responses

- **200**: Saved successfully
- **404**: Post not found

---

#### Unsave a Post

**POST** `/api/posts/{id}/unsave`

##### Responses

- **200**: Unsaved successfully
- **404**: Post not found

---

## Components

### MediaItem

```json
{
  "fileName": "string",
  "type": "image|video",
  "fileUrl": "string",
  "crop": {
    "mode": "original|1:1|4:5|16:9",
    "zoom": 1,
    "x": 0,
    "y": 0
  },
  "filter": {
    "name": "Original",
    "css": ""
  },
  "adjustments": {
    "brightness": 0,
    "contrast": 0,
    "saturation": 0,
    "temperature": 0,
    "fade": 0,
    "vignette": 0
  }
}
```

### Post

```json
{
  "post_id": "string",
  "_id": "string",
  "user_id": {
    "username": "string",
    "full_name": "string",
    "avatar_url": "string"
  },
  "caption": "string",
  "location": "string",
  "media": [ { ... } ],  // MediaItem array
  "tags": ["string"],
  "people_tags": [
    { "user_id": "string", "username": "string", "x": 0, "y": 0 }
  ],
  "likes_count": 0,
  "is_liked_by_me": false,
  "comments": [
    { ... }  // Comment object
  ],
  "createdAt": "string"
}
```

