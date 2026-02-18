# View Routes

- POST /api/views — Add a view for a reel (auth)
- POST /api/views/complete — Complete a view and reward (auth)


## Add View

**POST** `/api/views`

Auth: Bearer

Body
```json
{ "postId": "string" }
```

Responses
- 200: `{ "success": true, "views_count": 10, "unique_views_count": 5 }`
- 400: Invalid postId/type
- 401: Not authorized

---

## Complete View

**POST** `/api/views/complete`

Auth: Bearer

Body
```json
{ "postId": "string", "watchTimeMs": 12345 }
```

Responses
- 200: `{ "success": true, "completed": true, "rewarded": true, "walletBalance": 5010 }`
- 400: Invalid postId/type
- 401: Not authorized
