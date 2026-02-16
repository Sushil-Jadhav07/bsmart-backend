# Comment Routes

- POST /api/posts/{postId}/comments — Add comment or reply (auth)
- GET /api/posts/{postId}/comments — List post comments
- DELETE /api/comments/{id} — Delete comment (auth; author/post owner)
- POST /api/comments/{commentId}/like — Like comment (auth)
- POST /api/comments/{commentId}/unlike — Unlike comment (auth)
- GET /api/comments/{commentId}/replies — List replies for a comment



# API Documentation for Comments

## Comment Functionality

This is the API documentation for the comment functionality in the post system.

### Swagger Documentation

#### Add a Comment to a Post

**POST** `/api/posts/{postId}/comments`

##### Request Body

```json
{
  "text": "This is a reply to your comment",
  "parent_id": "64f8a1234567890abcdef123"  // Optional
}
```

##### Responses

- **201**: Comment created successfully
- **400**: Invalid input
- **404**: Post or User not found

---

#### Get Comments for a Post

**GET** `/api/posts/{postId}/comments`

##### Responses

- **200**: List of comments
- **404**: Post not found

---

#### Delete a Comment

**DELETE** `/api/comments/{id}`

##### Responses

- **200**: Comment deleted successfully
- **403**: Not authorized
- **404**: Comment not found

---

#### Like a Comment

**POST** `/api/comments/{commentId}/like`

##### Responses

- **200**: Comment liked successfully
- **400**: Already liked
- **404**: Comment not found

---

#### Unlike a Comment

**POST** `/api/comments/{commentId}/unlike`

##### Responses

- **200**: Comment unliked successfully
- **400**: Not liked
- **404**: Comment not found

---

#### Get Replies for a Comment

**GET** `/api/comments/{commentId}/replies`

##### Responses

- **200**: List of replies
- **500**: Server error

---

## Components

### Comment

```json
{
  "comment_id": "string",
  "_id": "string",
  "post_id": "string",
  "parent_id": "string",
  "user": {
    "id": "string",
    "username": "string",
    "avatar_url": "string"
  },
  "text": "string",
  "likes_count": "number",
  "createdAt": "string"
}
```

