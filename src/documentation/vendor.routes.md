# Vendor Routes

- POST /api/vendors — Create vendor profile (auth)
- GET /api/vendors/me — Get my vendor profile (auth)
- GET /api/vendors/users/{id} — Get vendor by user ID
- GET /api/vendors/validate — List validated vendors (auth, admin)
- GET /api/vendors/invalidate — List invalidated vendors (auth, admin)


## Create Vendor

**POST** `/api/vendors`

Auth: Bearer

Body
```json
{ "business_name": "string", "description": "string", "category": "string", "phone": "string", "address": "string", "logo_url": "string" }
```

Responses
- 201: Vendor created with wallet credit (5000 coins)
- 400: business_name required or vendor already exists
- 500: Server error

---

## Get My Vendor

**GET** `/api/vendors/me`

Auth: Bearer

Responses
- 200: Vendor object with wallet
- 404: Vendor not found

---

## Get Vendor by User ID

**GET** `/api/vendors/users/{id}`

Responses
- 200: Vendor object with wallet
- 404: Vendor not found

---

## List Validated Vendors

**GET** `/api/vendors/validate`

Auth: Bearer (admin)

Responses
- 200: Array of validated vendor objects (populated user fields)
- 401: Not authorized
- 403: Forbidden

---

## List Invalidated Vendors

**GET** `/api/vendors/invalidate`

Auth: Bearer (admin)

Responses
- 200: Array of invalidated vendor objects (populated user fields)
- 401: Not authorized
- 403: Forbidden
