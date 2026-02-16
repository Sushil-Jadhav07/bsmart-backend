# Follow Routes

- POST /api/follow — Follow a user (auth)
- POST /api/unfollow — Unfollow a user (auth)
- GET /api/users/{id}/followers — List followers of a user
- GET /api/users/{id}/following — List following of a user



# API Documentation for Follow System

## Follow System

This is the API documentation for the follow system allowing users to follow/unfollow others and get followers/following details.

### Swagger Documentation

#### Follow a User

**POST** `/api/follow`

##### Request Body

```json
{
  "userId": "string"  // The ID of the user to follow
}
```

##### Responses

- **200**: Successfully followed the user
- **400**: Already following the user or invalid user
- **404**: User not found

---

#### Unfollow a User

**POST** `/api/unfollow`

##### Request Body

```json
{
  "userId": "string"  // The ID of the user to unfollow
}
```

##### Responses

- **200**: Successfully unfollowed the user
- **400**: Not following the user or invalid user
- **404**: User not found

---

#### Get Followers of a User

**GET** `/api/users/{id}/followers`

##### Responses

- **200**: List of followers
- **404**: User not found

---

#### Get Users that the User is Following

**GET** `/api/users/{id}/following`

##### Responses

- **200**: List of users being followed
- **404**: User not found

---

## Components

### Follow Request

```json
{
  "userId": "string"  // The ID of the user to follow/unfollow
}
```

