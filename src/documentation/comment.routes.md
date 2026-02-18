# Comment Routes

- POST /api/posts/{postId}/comments — Add comment/reply (auth)
- GET /api/posts/{postId}/comments — List comments for a post
- DELETE /api/comments/{id} — Delete comment (auth)
- POST /api/comments/{commentId}/like — Like comment (auth)
- POST /api/comments/{commentId}/unlike — Unlike comment (auth)
- GET /api/comments/{commentId}/replies — List replies for a comment


## Add Comment / Reply

**POST** `/api/posts/{postId}/comments`

Auth: Bearer

Body
```json
{ "text": "string", "parent_id": "string|null" }
```

Responses
- 201: Comment created (Comment object)
- 400: Invalid input
- 404: Post or User not found

---

## Get Comments

**GET** `/api/posts/{postId}/comments`

Responses
- 200: Array of Comment objects
- 404: Post not found

---

## Delete Comment

**DELETE** `/api/comments/{id}`

Auth: Bearer

Responses
- 200: Comment deleted
- 403: Not authorized
- 404: Comment not found

---

## Like / Unlike Comment

**POST** `/api/comments/{commentId}/like`

Auth: Bearer

Responses
- 200: `{ "liked": true, "likes_count": 5 }`
- 400: Already liked
- 404: Comment not found

**POST** `/api/comments/{commentId}/unlike`

Auth: Bearer

Responses
- 200: `{ "liked": false, "likes_count": 4 }`
- 400: Not liked
- 404: Comment not found

---

## Get Replies

**GET** `/api/comments/{commentId}/replies`

Responses
- 200: Array of reply Comment objects
- 500: Server error
