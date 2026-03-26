# Vendor Routes

- POST /api/vendors — Create vendor profile (auth)
- GET /api/vendors/me — Get my vendor profile (auth)
- GET /api/vendors/users/{id} — Get vendor by user ID
- POST /api/vendors/profile/{vendorUserId}/viewProfile — Reward member for qualifying vendor profile view and deduct 10 coins from vendor wallet
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

## View Profile

**POST** `/api/vendors/profile/{vendorUserId}/viewProfile`

Auth: Bearer

Notes
- Only `member` users can earn coins.
- Viewer receives `10` coins after the qualifying profile view.
- `10` coins are deducted from the vendor's main wallet balance.
- No ad budget wallet is used by this API.
- The same member can earn again from the same vendor only after the 3 minute cooldown.

Responses
- 200: `{ "success": true, "coins_earned": 10, "deduction_source": "vendor_wallet", "wallet": { "new_balance": 120, "currency": "Coins" } }`
- 400: Invalid vendor user id, self-view, or insufficient vendor wallet balance
- 403: Only members can earn
- 404: Vendor not found
- 429: Cooldown not finished

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
