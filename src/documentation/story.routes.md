# Story Routes

- POST /api/stories — Create/append story items (auth)
- GET /api/stories/feed — Active stories feed (auth)
- GET /api/stories/{storyId}/items — List story items (auth)
- POST /api/stories/items/{itemId}/view — Mark item viewed (auth)
- GET /api/stories/{storyId}/views — Viewers list (auth, owner-only)
- POST /api/stories/upload — Upload story media (auth, multipart)
- GET /api/stories/archive — Get archived stories (auth)



# API Documentation for Story System

## Story System

This is the API documentation for the story system, including story creation, viewing, uploading media, and story management.

### Base URL
- All endpoints are mounted under `/api/stories`

### Authorization
- Use JWT bearer token for protected endpoints
- Header: `Authorization: Bearer <TOKEN>`

### Swagger Documentation

#### Create or Append Story Items

**POST** `/api/stories`

##### Request Body

```json
{
  "items": [
    {
      "media": {
        "url": "string",
        "type": "image|reel"
      },
      "transform": {
        "x": 0.5,
        "y": 0.5,
        "scale": 1,
        "rotation": 0
      },
      "filter": {
        "name": "string",
        "intensity": 0
      },
      "texts": [
        {
          "content": "string",
          "x": 0,
          "y": 0,
          "fontSize": 24,
          "fontFamily": "classic",
          "color": "string",
          "align": "center",
          "rotation": 0,
          "background": {
            "enabled": false
          }
        }
      ],
      "mentions": [
        {
          "user_id": "string",
          "username": "string",
          "x": 0,
          "y": 0
        }
      ]
    }
  ]
}
```

##### Responses

- **200**: Story created/appended
- **400**: Bad request
- **401**: Not authorized

###### Example Response (200)
```json
{
  "success": true,
  "story": {
    "_id": "string",
    "user_id": "string",
    "items_count": 3,
    "views_count": 0,
    "expiresAt": "string",
    "isArchived": false,
    "createdAt": "string"
  },
  "items": [
    { "_id": "string", "order": 1, "media": { "url": "string", "type": "image" } }
  ]
}
```

---

#### Get Active Stories Feed

**GET** `/api/stories/feed`

##### Responses

- **200**: List of active stories

###### Example Response (200)
```json
[
  {
    "_id": "string",
    "user": { "username": "string", "avatar_url": "string" },
    "items_count": 2,
    "views_count": 10,
    "preview_item": { "_id": "string", "order": 1, "media": { "url": "string", "type": "image" } },
    "seen": false
  }
]
```

---

#### Get Ordered Items of a Story

**GET** `/api/stories/{storyId}/items`

##### Responses

- **200**: List of story items
- **404**: Story not found

###### Example Response (200)
```json
[
  {
    "_id": "string",
    "order": 1,
    "media": { "url": "string", "type": "image" },
    "transform": { "x": 0.5, "y": 0.5, "scale": 1, "rotation": 0 },
    "texts": [],
    "mentions": [],
    "expiresAt": "string"
  }
]
```

---

#### Mark a Story Item as Viewed

**POST** `/api/stories/items/{itemId}/view`

##### Responses

- **200**: View recorded successfully
- **404**: Story item not found

###### Example Response (200)
```json
{ "success": true }
```

---

#### Get Viewers List of a Story

**GET** `/api/stories/{storyId}/views`

##### Responses

- **200**: List of viewers
- **403**: Forbidden
- **404**: Story not found

###### Example Response (200)
```json
{
  "viewers": [
    { "viewer": { "_id": "string", "username": "string", "avatar_url": "string" }, "viewedAt": "string" }
  ],
  "total_views": 12,
  "unique_viewers": 10
}
```

---

#### Upload a File for Stories

**POST** `/api/stories/upload`

##### Request Body

```json
{
  "file": "file data"
}
```

##### Responses

- **200**: Story file uploaded successfully
- **400**: No file uploaded or invalid file type
- **401**: Not authorized

###### Example Response (200)
```json
{
  "fileName": "string",
  "fileUrl": "http://localhost:5000/uploads/file.jpg",
  "media": { "url": "http://localhost:5000/uploads/file.jpg", "type": "image" }
}
```

---

#### Get Archived Stories

**GET** `/api/stories/archive`

##### Responses

- **200**: Archived stories

###### Example Response (200)
```json
{
  "stories": [
    { "_id": "string", "items_count": 2, "isArchived": true, "archivedAt": "string" }
  ]
}
```

---

#### Delete a Story

**DELETE** `/api/stories/{storyId}`

##### Responses

- **200**: Story deleted successfully
- **401**: Not authorized
- **403**: Forbidden
- **404**: Story not found

###### Example Response (200)
```json
{ "message": "Story deleted successfully" }
```

---

## Components

### Story

```json
{
  "_id": "string",
  "user_id": "string",
  "items_count": 0,
  "views_count": 0,
  "expiresAt": "string",
  "isArchived": false,
  "archivedAt": "string",
  "createdAt": "string",
  "updatedAt": "string"
}
```

### StoryItem

```json
{
  "_id": "string",
  "story_id": "string",
  "user_id": "string",
  "order": 1,
  "media": { ... },  // MediaItem object
  "transform": { ... },  // Transform object
  "filter": { ... },  // Filter object
  "texts": [ ... ],  // Texts array
  "mentions": [ ... ],  // Mentions array
  "expiresAt": "string",
  "isDeleted": false,
  "createdAt": "string",
  "updatedAt": "string"
}
```
