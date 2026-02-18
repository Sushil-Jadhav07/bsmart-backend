# Upload Routes

- POST /api/upload — Upload image/video, returns fileUrl (auth, multipart)


# API Documentation for File Upload

## File Upload System

This is the API documentation for the file upload system, allowing users to upload image or video files.

### Base URL
- Endpoint is mounted under `/api/upload`

### Authorization
- Use JWT bearer token for protected endpoint
- Header: `Authorization: Bearer <TOKEN>`

### Swagger Documentation

#### Upload a File (Image/Video)

**POST** `/api/upload`

##### Request Body

```json
{
  "file": "file data"
}
```

##### Responses

- **200**: File uploaded successfully
- **400**: No file uploaded or invalid file type
- **401**: Not authorized
- **500**: Server error

###### Example Request (multipart/form-data)
```bash
curl -X POST http://localhost:5000/api/upload \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@/path/to/image.jpg"
```

###### Example Response (200)
```json
{
  "fileName": "image-1739542312.jpg",
  "fileUrl": "http://localhost:5000/uploads/image-1739542312.jpg"
}
```

---

## Components

### Upload Response

```json
{
  "fileName": "string",
  "fileUrl": "string"
}
```
