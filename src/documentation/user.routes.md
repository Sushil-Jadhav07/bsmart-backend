# User Routes

- GET /api/users — Aggregated users profiles + posts/comments/likes/views (auth)
- GET /api/users/{id} — Get user details
- GET /api/users/{id}/posts — Get user's posts with comments
- GET /api/users/{id}/followers — List followers
- GET /api/users/{id}/following — List following
- GET /api/users/{id}/saved — List saved posts (auth)
- PUT /api/users/{id} — Update user (auth; self/admin)
- DELETE /api/users/{id} — Delete user (auth; self/admin)



# API Documentation for User System

## User System

This is the API documentation for the user management system, including user profile retrieval, user post management, and follow/unfollow functionality.

### Swagger Documentation

#### Get List of User Profiles with Posts, Comments, Likes, and Views

**GET** `/api/users`

##### Responses

- **200**: List of user profiles with aggregated data
- **401**: Not authorized
- **500**: Server error

---

#### Get User Details

**GET** `/api/users/{id}`

##### Responses

- **200**: User details
- **404**: User not found
- **500**: Server error

---

#### Get User's Posts with Comments and Likes

**GET** `/api/users/{id}/posts`

##### Responses

- **200**: List of posts with comments and likes
- **404**: User not found
- **500**: Server error

---

#### Update User Details

**PUT** `/api/users/{id}`

##### Request Body

```json
{
  "full_name": "string",
  "bio": "string",
  "avatar_url": "string",
  "phone": "string",
  "username": "string"
}
```

##### Responses

- **200**: User updated successfully
- **403**: Not authorized
- **404**: User not found
- **500**: Server error

---

#### Delete User and Their Posts

**DELETE** `/api/users/{id}`

##### Responses

- **200**: User deleted successfully
- **403**: Not authorized
- **404**: User not found
- **500**: Server error

---

## Components

### User

```json
{
  "_id": "string",
  "username": "string",
  "full_name": "string",
  "avatar_url": "string",
  "phone": "string",
  "bio": "string",
  "createdAt": "string",
  "updatedAt": "string"
}
```

### Post

```json
{
  "post_id": "string",
  "_id": "string",
  "user_id": { ... },  // User object
  "caption": "string",
  "location": "string",
  "media": [ { ... } ],  // Media array
  "tags": ["string"],
  "likes_count": 0,
  "is_liked_by_me": false,
  "comments": [ ... ],  // Comments array
  "createdAt": "string"
}
```

