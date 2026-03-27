# Highlight Routes

This document is intended for the Flutter app developer.

Base URL examples:

- Local: `http://localhost:5000/api`
- Production: use your deployed backend URL

All highlight APIs require:

```http
Authorization: Bearer <JWT_TOKEN>
```

---

## Overview

Highlights are collections of story items shown as permanent profile circles.

There are 2 main entities:

### Highlight

```json
{
  "_id": "67e3aa001122334455667700",
  "user_id": "67e3aa001122334455667711",
  "title": "Travel",
  "cover_url": "https://example.com/highlight-cover.jpg",
  "items_count": 3,
  "order": 0,
  "createdAt": "2026-03-27T10:00:00.000Z",
  "updatedAt": "2026-03-27T10:15:00.000Z"
}
```

### Highlight Item

Internally this links one story item to one highlight.

Important:

- same story item cannot be added twice to the same highlight
- duplicate insert attempts are skipped gracefully
- `items_count` is maintained on the highlight document

---

## 1. Create Highlight

### Endpoint

**POST** `/api/highlights`

### Purpose

Create a new empty highlight for the logged-in user.

### Auth

- Required

### Request Body

```json
{
  "title": "Travel",
  "cover_url": "https://example.com/cover.jpg"
}
```

### Validation Rules

- `title` is required
- `title` max length: `30`
- `cover_url` optional

### Success Response

Status: `201`

```json
{
  "_id": "67e3aa001122334455667700",
  "user_id": "67e3aa001122334455667711",
  "title": "Travel",
  "cover_url": "https://example.com/cover.jpg",
  "items_count": 0,
  "order": 0,
  "createdAt": "2026-03-27T10:00:00.000Z",
  "updatedAt": "2026-03-27T10:00:00.000Z",
  "__v": 0
}
```

### Error Cases

- `400`: `title required`
- `401`: unauthorized
- `500`: server error

### Flutter Notes

- after success, append this highlight to the current user’s highlight list
- `order` is set automatically based on existing highlight count

---

## 2. Get User Highlights

### Endpoint

**GET** `/api/highlights/user/{userId}`

### Purpose

Get all highlights of a user in display order.

### Auth

- Required

### Path Params

- `userId`: target user id

### Success Response

```json
[
  {
    "_id": "67e3aa001122334455667700",
    "user_id": "67e3aa001122334455667711",
    "title": "Travel",
    "cover_url": "https://example.com/cover.jpg",
    "items_count": 3,
    "order": 0,
    "createdAt": "2026-03-27T10:00:00.000Z",
    "updatedAt": "2026-03-27T10:15:00.000Z"
  },
  {
    "_id": "67e3aa001122334455667701",
    "user_id": "67e3aa001122334455667711",
    "title": "Work",
    "cover_url": "",
    "items_count": 1,
    "order": 1,
    "createdAt": "2026-03-27T10:05:00.000Z",
    "updatedAt": "2026-03-27T10:05:00.000Z"
  }
]
```

### Sorting

- sorted by `order` ascending

### Flutter Notes

- use this to render highlight circles on profile screens
- `cover_url` is the thumbnail shown in the circle
- `items_count` is useful for UI badges or fallback empty states

---

## 3. Add Story Items to Highlight

### Endpoint

**POST** `/api/highlights/{id}/items`

### Purpose

Attach one or more story items to a highlight.

### Auth

- Required
- only the owner of the highlight can add items

### Path Params

- `id`: highlight id

### Request Body

```json
{
  "story_item_ids": [
    "67e3aa001122334455667810",
    "67e3aa001122334455667811"
  ]
}
```

### Important Behavior

- duplicates are ignored
- insert uses `ordered: false`
- `items_count` is recalculated after insert
- if `cover_url` is empty, backend auto-fills it from the first inserted story item:
  - `storyItem.media.thumbnail`
  - else `storyItem.media.url`

### Success Response

```json
{
  "success": true,
  "items_count": 3
}
```

### Error Cases

- `400`: `story_item_ids required`
- `401`: unauthorized
- `403`: forbidden
- `404`: highlight not found
- `500`: server error

### Flutter Notes

- recommended flow:
  1. create highlight if needed
  2. collect selected story item ids
  3. call this endpoint
  4. refresh the highlight list or item list

---

## 4. Get Highlight Items

### Endpoint

**GET** `/api/highlights/{id}/items`

### Purpose

Get the full story items inside a highlight in order.

### Auth

- Required

### Path Params

- `id`: highlight id

### Response Shape

The backend returns populated `StoryItem` data, not raw `HighlightItem` rows.

Each item is basically:

- all fields from `StoryItem`
- plus `_itemId`
- plus `order`

### Success Response

```json
[
  {
    "_id": "67e3aa001122334455667810",
    "_itemId": "67e3aa001122334455667900",
    "story_id": "67e3aa001122334455667820",
    "user_id": "67e3aa001122334455667711",
    "order": 0,
    "media": {
      "url": "https://example.com/story-image.jpg",
      "type": "image",
      "thumbnail": "https://example.com/story-thumb.jpg",
      "durationSec": 15,
      "width": 1080,
      "height": 1920,
      "hls": false
    },
    "transform": {
      "x": 0.5,
      "y": 0.5,
      "scale": 1,
      "rotation": 0
    },
    "filter": {
      "name": "none"
    },
    "texts": [],
    "mentions": [],
    "expiresAt": "2026-03-28T10:00:00.000Z",
    "createdAt": "2026-03-27T09:50:00.000Z",
    "updatedAt": "2026-03-27T09:50:00.000Z"
  }
]
```

### Important Flutter Note

Use:

- `_id` = story item id
- `_itemId` = highlight item id

You need `_itemId` when removing a single item from a highlight.

---

## 5. Update Highlight

### Endpoint

**PATCH** `/api/highlights/{id}`

### Purpose

Update highlight metadata.

### Auth

- Required
- only the owner of the highlight can update it

### Path Params

- `id`: highlight id

### Request Body

```json
{
  "title": "Best Moments",
  "cover_url": "https://example.com/new-cover.jpg"
}
```

### Behavior

- if `title` is present, it updates
- if `cover_url` is present, it updates
- omitted fields remain unchanged

### Success Response

```json
{
  "_id": "67e3aa001122334455667700",
  "user_id": "67e3aa001122334455667711",
  "title": "Best Moments",
  "cover_url": "https://example.com/new-cover.jpg",
  "items_count": 3,
  "order": 0,
  "createdAt": "2026-03-27T10:00:00.000Z",
  "updatedAt": "2026-03-27T10:25:00.000Z"
}
```

### Error Cases

- `401`: unauthorized
- `403`: forbidden
- `404`: not found
- `500`: server error

---

## 6. Remove One Item From Highlight

### Endpoint

**DELETE** `/api/highlights/{id}/items/{itemId}`

### Purpose

Remove a specific highlight item from a highlight.

### Auth

- Required
- only the owner of the highlight can remove items

### Path Params

- `id`: highlight id
- `itemId`: highlight item id, not story item id

### Success Response

```json
{
  "success": true
}
```

### Error Cases

- `401`: unauthorized
- `403`: forbidden
- `404`: item not found
- `500`: server error

### Important Flutter Note

Use the `_itemId` from `GET /api/highlights/{id}/items`.

Do not send the story item `_id` here.

---

## 7. Delete Entire Highlight

### Endpoint

**DELETE** `/api/highlights/{id}`

### Purpose

Delete the highlight and all highlight-item links under it.

### Auth

- Required
- only the owner of the highlight can delete it

### Path Params

- `id`: highlight id

### Success Response

```json
{
  "message": "Deleted"
}
```

### Behavior

- deletes all `HighlightItem` rows for that highlight
- deletes the highlight itself

### Error Cases

- `401`: unauthorized
- `403`: forbidden
- `404`: not found
- `500`: server error

---

## Suggested Flutter Flow

### Create a new highlight from selected stories

1. User taps `New Highlight`
2. Call `POST /api/highlights` with title and optional cover
3. Save returned highlight id
4. Call `POST /api/highlights/{id}/items` with selected `story_item_ids`
5. Refresh `GET /api/highlights/user/{userId}`

### Open a highlight

1. Get user highlights using `GET /api/highlights/user/{userId}`
2. When user taps one highlight, call `GET /api/highlights/{id}/items`
3. Render returned story items in `order`

### Remove one story from a highlight

1. Load items using `GET /api/highlights/{id}/items`
2. Read `_itemId` from the selected item
3. Call `DELETE /api/highlights/{id}/items/{itemId}`
4. Refresh the items list

---

## Important Integration Notes

- all highlight routes require bearer auth
- `GET /api/highlights/user/{userId}` is available to any logged-in user
- all write operations are owner-only
- `itemId` in remove-item route is highlight-item id, not story-item id
- duplicate story items in one highlight are prevented at database level
- `cover_url` may be auto-filled by backend when adding the first item

---

## Common Error Response Shape

Usually:

```json
{
  "message": "Readable error message"
}
```

Recommended Flutter handling:

- `401`: redirect to login
- `403`: show permission error
- `404`: show missing highlight/item state
- `500`: show retry message
