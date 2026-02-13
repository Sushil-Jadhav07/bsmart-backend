# Bsmart API Documentation – Upload Module

## Overview
- Upload a single file (image/video) and receive the stored fileName and a public fileUrl.
- Auth required; multipart/form-data; field name: file.
- Exactly mirrors implementation in the codebase.

## Endpoint
- Base URL: /api/upload
- Method: POST
- Auth: Bearer Token
- Content-Type: multipart/form-data
- Form Field: file (binary)
- Route: [upload.routes.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/routes/upload.routes.js)

## Authentication
- Protected by verifyToken middleware
- Required header:
  - Authorization: Bearer <token>
- If token is missing or invalid, middleware blocks the request.

## Request
- multipart/form-data
- Fields:
  - file: binary (image/video), required
- Multer config: [config/multer.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/config/multer.js)
  - Ensures uploads directory exists
  - Generates unique filenames: timestamp-random + original extension
  - Limits size to 50MB
  - Allowed types: jpeg, jpg, png, gif, webp, mp4, mov, avi

## Success Response (200)
```json
{
  "fileName": "abc123.png",
  "fileUrl": "http://localhost:5000/uploads/abc123.png"
}
```

## How fileUrl is generated
- baseUrl = req.protocol + "://" + req.get("host")
- fileUrl = baseUrl + "/uploads/" + req.file.filename
- In production: https://your-domain/uploads/<filename>

## Error Responses
- 400 – No file uploaded
```json
{ "message": "Please upload a file" }
```
- 500 – Server error
```json
{ "message": "Server error", "error": "error message here" }
```

## Notes (Based on Code)
- Uploads a single file only: upload.single('file')
- File validation (type/size) enforced in Multer config
- Static files must be exposed by the server:
  - app.use('/uploads', express.static('uploads'))

## Curl Example
```bash
curl -X POST http://localhost:5000/api/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/image.png"
```
