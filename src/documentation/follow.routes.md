# Follow Routes

- POST /api/follow — Follow a user (auth)
- POST /api/unfollow — Unfollow a user (auth)
- POST /api/follows/{userId} — Follow by userId param (auth)
- GET /api/users/{id}/followers — List followers of a user
- GET /api/users/{id}/following — List users the given user is following
- GET /api/followers — List all follower relations (global)
- GET /api/following — List all following relations (global)


# API Documentation for Follow System

## Follow a User

**POST** `/api/follow`

Auth: Bearer

Request Body
```json
{ "followedUserId": "string" }
```

Responses
- 200: `{ "followed": true, "alreadyFollowing": false }`
- 400: Invalid request or self-follow
- 404: User not found

---

## Unfollow a User

**POST** `/api/unfollow`

Auth: Bearer

Request Body
```json
{ "followedUserId": "string" }
```

Responses
- 200: `{ "unfollowed": true, "alreadyNotFollowing": false }`
- 404: Relationship not found

---

## Follow by Path Param

**POST** `/api/follows/{userId}`

Auth: Bearer

Path Params: `userId`

Responses
- 200:
```json
{
  "success": true,
  "follower": { "_id": "string", "username": "string", "email": "string", "role": "member|vendor|admin" },
  "following": { "_id": "string", "username": "string", "email": "string", "role": "member|vendor|admin" },
  "followingCount": 12,
  "followersCount": 33
}
```
- 400: Invalid ID or self-follow
- 404: User not found
- 409: Already following

---

## List Followers of a User

**GET** `/api/users/{id}/followers`

Responses
- 200:
```json
{
  "total": 2,
  "users": [
    { "_id": "string", "username": "string", "full_name": "string", "avatar_url": "string", "followers_count": 10, "following_count": 3 }
  ]
}
```

---

## List Following of a User

**GET** `/api/users/{id}/following`

Responses
- 200:
```json
{
  "total": 2,
  "users": [
    { "_id": "string", "username": "string", "full_name": "string", "avatar_url": "string", "followers_count": 10, "following_count": 3 }
  ]
}
```

---

## Global Followers

**GET** `/api/followers`

Responses
- 200:
```json
{
  "total": 2,
  "relations": [
    { "follower": { "_id": "string", "username": "string" }, "followed": { "_id": "string", "username": "string" } }
  ]
}
```

---

## Global Following

**GET** `/api/following`

Responses
- 200:
```json
{
  "total": 2,
  "relations": [
    { "follower": { "_id": "string", "username": "string" }, "followed": { "_id": "string", "username": "string" } }
  ]
}
```
