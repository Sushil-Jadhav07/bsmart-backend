# Member Routes

- GET /api/members/me — Get current member profile (auth)
- GET /api/members/users/{id} — Get member profile by user id


# API Documentation for Member System

## Member System

This is the API documentation for the member system, allowing users to retrieve their own member data and data for specific users.

### Swagger Documentation

#### Get Current Logged-in User Member Details

**GET** `/api/member/me`

##### Responses

- **200**: Successfully retrieved member data
- **401**: Not authorized
- **500**: Server error

---

#### Get Member Details by User ID

**GET** `/api/users/{id}`

##### Responses

- **200**: Successfully retrieved member data
- **404**: User not found
- **500**: Server error

---

## Components

### Member

```json
{
  "id": "string",
  "username": "string",
  "email": "string",
  "full_name": "string",
  "avatar_url": "string",
  "phone": "string",
  "createdAt": "string",
  "updatedAt": "string"
}
```

