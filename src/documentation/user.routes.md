# User Routes

- GET /api/users — List user profiles with aggregated stats (auth)
- GET /api/users/{id} — Get user details
- GET /api/users/{id}/posts — Get user's posts with comments and likes
- GET /api/users/{id}/followers — Get user's followers
- GET /api/users/{id}/following — Get user's following
- GET /api/users/{id}/saved — Get user's saved posts (auth)
- PUT /api/users/{id} — Update user (auth)
- DELETE /api/users/{id} — Delete user and posts (auth)


## List Users

**GET** `/api/users`

Auth: Bearer

Responses
- 200: Array of profiles with summary and posts
- 401: Not authorized
- 500: Server error

---

## Get User

**GET** `/api/users/{id}`

Responses
- 200: User object
- 404: User not found
- 500: Server error

---

## User's Posts

**GET** `/api/users/{id}/posts`

Responses
- 200: Array of Post objects
- 404: User not found
- 500: Server error

---

## Followers / Following

**GET** `/api/users/{id}/followers`

**GET** `/api/users/{id}/following`

Responses
- 200: `{ "total": number, "users": [ { "_id": "...", "username": "...", "full_name": "...", "avatar_url": "...", "followers_count": 0, "following_count": 0 } ] }`

---

## Saved Posts (by user)

**GET** `/api/users/{id}/saved`

Auth: Bearer

Responses
- 200: Array of Post objects

---

## Update User

**PUT** `/api/users/{id}`

Auth: Bearer

Body
```json
{ "full_name": "string", "bio": "string", "avatar_url": "string", "phone": "string", "username": "string" }
```

Responses
- 200: Updated User object
- 403: Not authorized
- 404: User not found
- 500: Server error

---

## Delete User

**DELETE** `/api/users/{id}`

Auth: Bearer

Responses
- 200: User deleted
- 403: Not authorized
- 404: User not found
- 500: Server error
