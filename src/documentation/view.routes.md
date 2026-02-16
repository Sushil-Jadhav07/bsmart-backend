# View Routes

- POST /api/views — Add view for a reel (auth)
- POST /api/views/complete — Complete view and reward user (auth)



# API Documentation for View System

## View System

This is the API documentation for the view system, including view tracking, completion, and rewards.

### Swagger Documentation

#### Add a View for a Reel

**POST** `/api/views`

##### Request Body

```json
{
  "postId": "string"
}
```

##### Responses

- **200**: View recorded successfully
- **400**: Invalid postId/type
- **401**: Not authorized

---

#### Complete a View for a Reel and Reward User

**POST** `/api/views/complete`

##### Request Body

```json
{
  "postId": "string",
  "watchTimeMs": "number"
}
```

##### Responses

- **200**: Completion processed
- **400**: Invalid postId/type
- **401**: Not authorized

---

## Components

### View Response

```json
{
  "success": true,
  "views_count": 100,
  "unique_views_count": 50
}
```

### Completion Response

```json
{
  "success": true,
  "completed": true,
  "rewarded": true,
  "walletBalance": 100
}
```

