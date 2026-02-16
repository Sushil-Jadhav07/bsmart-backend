# Vendor Routes

- POST /api/vendors — Create vendor profile and set role (auth)
- GET /api/vendors/me — Get current vendor profile (auth)
- GET /api/vendors/users/{id} — Get vendor profile by user id


# API Documentation for Vendor System

## Vendor System

This is the API documentation for the vendor management system, including vendor profile creation and retrieval.

### Swagger Documentation

#### Create a Vendor Profile

**POST** `/api/vendors`

##### Request Body

```json
{
  "company_name": "string",
  "contact_person": "string",
  "contact_email": "string",
  "phone": "string",
  "address": "string"
}
```

##### Responses

- **200**: Vendor created successfully
- **400**: Invalid input
- **500**: Server error

---

#### Get Current Logged-in User's Vendor Profile

**GET** `/api/vendors/me`

##### Responses

- **200**: Vendor profile details
- **401**: Not authorized
- **500**: Server error

---

#### Get Vendor Profile by User ID

**GET** `/api/vendors/users/{id}`

##### Responses

- **200**: Vendor profile details
- **404**: Vendor not found
- **500**: Server error

---

## Components

### Vendor

```json
{
  "_id": "string",
  "company_name": "string",
  "contact_person": "string",
  "contact_email": "string",
  "phone": "string",
  "address": "string",
  "createdAt": "string",
  "updatedAt": "string"
}
```

