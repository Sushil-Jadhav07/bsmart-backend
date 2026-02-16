# Upload Routes

- POST /api/upload — Upload image/video, returns fileUrl (auth, multipart)


# API Documentation for File Upload

## File Upload System

This is the API documentation for the file upload system, allowing users to upload image or video files.

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
- **500**: Server error

---

## Components

### Upload Response

```json
{
  "fileName": "string",
  "fileUrl": "string"
}
```

