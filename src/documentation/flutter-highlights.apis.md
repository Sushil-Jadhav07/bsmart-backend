# Flutter Developer Handoff: Highlight APIs

This document covers the main APIs the Flutter app is expected to use for:

- ad click tracking
- vendor profile reward flow
- reports and analytics
- vendor wallet transaction history

Base URL examples:

- Local: `http://localhost:5000/api`
- Production: use your deployed backend base URL

All protected APIs require:

```http
Authorization: Bearer <JWT_TOKEN>
```

---

## 1. Ad Click Tracking

### Endpoint

**POST** `/api/ads/{id}/click`

### Purpose

Call this when the user taps an ad CTA, vendor name, or vendor profile entry from an ad card.

### Path Params

- `id`: ad id

### Auth

- Required

### Request Body

- No request body required

### Success Response

```json
{
  "success": true,
  "message": "Ad click recorded",
  "click": {
    "_id": "67e2aa001122334455667788",
    "ad_id": "67e2aa001122334455667700",
    "user_id": "67e2aa001122334455667799",
    "vendor_id": "67e2aa001122334455667711",
    "is_unique": true,
    "is_invalid": false,
    "coins_spent": 0,
    "country": "India",
    "language": "English",
    "gender": "male",
    "created_at": "2026-03-27T10:30:00.000Z"
  }
}
```

### Error Cases

- `400`: invalid ad id
- `404`: ad not found
- `500`: server error

### Flutter Notes

- This API is for analytics/tracking.
- It does not reward the member.
- The response contains the stored click analytics payload.

---

## 2. Vendor Profile View Reward

### Endpoint

**POST** `/api/vendors/profile/{vendorUserId}/viewProfile`

### Purpose

Reward a member after they stay on a vendor profile page for 3 minutes.

### Path Params

- `vendorUserId`: vendor user id, not vendor profile id

### Auth

- Required
- Only `member` users can earn from this API

### Frontend Trigger Rule

The Flutter app should call this endpoint only after:

1. the member opens a vendor profile
2. the member stays on that screen for at least 3 minutes
3. the viewed profile belongs to another vendor

### Business Rules

- reward to member: `10` coins
- deduction source: vendor main wallet
- no ad budget wallet is used
- self-view is not allowed
- same member can earn again from the same vendor only after 3 minutes

### Success Response

```json
{
  "success": true,
  "message": "You earned 10 coins for viewing this vendor's profile!",
  "coins_earned": 10,
  "deduction_source": "vendor_wallet",
  "deduction_note": "Coins were deducted from the vendor wallet balance, not from any ad budget wallet.",
  "viewer": {
    "user_id": "67e2aa001122334455667799",
    "name": "John Doe",
    "username": "john_doe",
    "country": "India",
    "language": "English",
    "gender": "male"
  },
  "wallet": {
    "new_balance": 120,
    "currency": "Coins"
  }
}
```

### Error Cases

- `400`: invalid `vendorUserId`, self-view, or insufficient vendor wallet balance
- `403`: only members can earn
- `404`: vendor not found
- `429`: cooldown not finished

### Example Cooldown Response

```json
{
  "success": false,
  "message": "You can earn coins from this profile again in 97 seconds",
  "next_eligible_in_seconds": 97
}
```

### Flutter Notes

- best trigger point: after visible active time reaches 3 minutes
- recommended: pause timer when app goes background or screen is not visible
- do not call this repeatedly during the same visit after success

---

## 3. Reports Overview Cards

### Endpoint

**GET** `/api/reports/summary`

### Purpose

Use this for the top report cards in vendor analytics.

### Query Params

- `startDate`: `YYYY-MM-DD`
- `endDate`: `YYYY-MM-DD`
- `ad_id`
- `country`
- `gender`
- `language`
- `vendor_id`
  - admin only

### Success Response

```json
{
  "filters": {
    "startDate": "2026-03-01",
    "endDate": "2026-03-31",
    "ad_id": null,
    "country": null,
    "language": null,
    "gender": null
  },
  "overview": {
    "total_impressions": 75,
    "total_clicks": 2,
    "engagement_rate": 101.33,
    "total_spend": 520,
    "conversions": 1,
    "reach": 10
  }
}
```

### Field Meaning

- `total_impressions`: from ad views
- `total_clicks`: from ad click records
- `engagement_rate`: `(likes + comments + saves) / impressions * 100`
- `total_spend`: ad deduction wallet transactions
- `conversions`: currently mapped to unique clicks
- `reach`: distinct viewers

---

## 4. Performance Summary Report

### Endpoint

**GET** `/api/reports/performance-summary`

### Purpose

Date-wise report for:

- impressions
- clicks
- CTR
- reach
- frequency

### Query Params

- `startDate`: `YYYY-MM-DD`
- `endDate`: `YYYY-MM-DD`
- `ad_id`
- `country`
- `gender`
- `language`
- `vendor_id`
  - admin only

### Success Response

```json
{
  "filters": {
    "startDate": "2026-03-01",
    "endDate": "2026-03-31",
    "ad_id": null,
    "country": null,
    "gender": null,
    "language": null
  },
  "total_days": 8,
  "data": [
    {
      "date": "2026-03-12",
      "impressions": 20,
      "clicks": 0,
      "ctr": 0,
      "reach": 3,
      "frequency": 6.67
    },
    {
      "date": "2026-03-26",
      "impressions": 0,
      "clicks": 2,
      "ctr": 0,
      "reach": 0,
      "frequency": 0
    }
  ]
}
```

### Flutter Notes

- use this for the performance table
- one row = one calendar date

---

## 5. Click Report

### Endpoint

**GET** `/api/reports/clicks`

### Purpose

Per-ad click report.

### Query Params

- `startDate`: `YYYY-MM-DD`
- `endDate`: `YYYY-MM-DD`
- `ad_id`
- `country`
- `gender`
- `language`
- `page`
- `limit`
- `vendor_id`
  - admin only

### Important Current Behavior

- this endpoint now returns all scoped ads
- ads with zero clicks are also included
- zero-click ads will return click metrics as `0`

### Success Response

```json
{
  "total": 3,
  "page": 1,
  "limit": 20,
  "totalPages": 1,
  "data": [
    {
      "ad_id": "67e2aa001122334455667700",
      "ad_name": "Third ads",
      "status": "active",
      "category": "Fashion",
      "impressions": 42,
      "total_clicks": 2,
      "unique_clicks": 1,
      "invalid_clicks": 0,
      "cpc": 0,
      "click_rate": 4.76,
      "coins_spent": 0
    },
    {
      "ad_id": "67e2aa001122334455667701",
      "ad_name": "Second ads",
      "status": "active",
      "category": "Fashion",
      "impressions": 8,
      "total_clicks": 0,
      "unique_clicks": 0,
      "invalid_clicks": 0,
      "cpc": 0,
      "click_rate": 0,
      "coins_spent": 0
    }
  ]
}
```

### Field Meaning

- `impressions`: total ad views
- `total_clicks`: all click events
- `unique_clicks`: unique user clicks
- `invalid_clicks`: fraud-flagged clicks
- `cpc`: coins spent per click
- `click_rate`: `total_clicks / impressions * 100`

---

## 6. Engagement Report

### Endpoint

**GET** `/api/reports/engagement`

### Purpose

Per-ad engagement report.

### Query Params

- `startDate`: `YYYY-MM-DD`
- `endDate`: `YYYY-MM-DD`
- `ad_id`
- `country`
- `gender`
- `language`
- `page`
- `limit`
- `vendor_id`
  - admin only

### Success Response

```json
{
  "total": 3,
  "page": 1,
  "limit": 20,
  "totalPages": 1,
  "data": [
    {
      "ad_id": "67e2aa001122334455667700",
      "ad_name": "Third ads",
      "status": "active",
      "category": "Fashion",
      "impressions": 41,
      "likes": 7,
      "dislikes": 0,
      "comments": 1,
      "saves": 0,
      "engagement_rate": 19.51
    }
  ]
}
```

---

## 7. Geographic Report

### Endpoint

**GET** `/api/reports/geographic`

### Purpose

Country-wise report.

### Query Params

- `startDate`: `YYYY-MM-DD`
- `endDate`: `YYYY-MM-DD`
- `ad_id`
- `country`
- `gender`
- `language`
- `page`
- `limit`
- `vendor_id`
  - admin only

### Success Response

```json
{
  "total": 4,
  "page": 1,
  "limit": 20,
  "totalPages": 1,
  "data": [
    {
      "country": "India",
      "impressions": 52,
      "clicks": 3,
      "ctr": 5.77,
      "reach": 8
    }
  ]
}
```

### Important Note

This report includes:

- ad click geography
- ad view geography
- vendor profile interaction geography stored on `VendorProfileView`

---

## 8. Vendor Wallet / Coins & Billing History

### Endpoint

**GET** `/api/wallet/vendor/{userId}/history`

### Purpose

Use this for vendor wallet transaction history and coins & billing screens.

### Path Params

- `userId`: vendor user id

### Query Params

- `startDate`: `YYYY-MM-DD`
- `endDate`: `YYYY-MM-DD`
- `type`
  - comma-separated transaction types if needed
- `page`
- `limit`

### Success Response

```json
{
  "success": true,
  "user": {
    "_id": "67e2aa001122334455667711",
    "username": "vendor_one",
    "full_name": "Vendor One",
    "avatar_url": "https://example.com/avatar.png",
    "role": "vendor"
  },
  "wallet": {
    "balance": 267871,
    "currency": "Coins"
  },
  "summary": {
    "total_credited": 80200,
    "total_debited": 11999,
    "total_transactions": 25,
    "total_ads_created": 3,
    "total_ad_budget_allocated": 5000
  },
  "pagination": {
    "total": 25,
    "page": 1,
    "limit": 100,
    "pages": 1
  },
  "transactions": [
    {
      "_id": "67e2aa001122334455667755",
      "type": "VENDOR_RECHARGE",
      "label": "Package Purchase",
      "description": "Package purchased: Standard",
      "amount": 40000,
      "direction": "credit",
      "status": "SUCCESS",
      "created_at": "2026-03-24T14:35:00.000Z",
      "ad": null
    },
    {
      "_id": "67e2aa001122334455667756",
      "type": "AD_BUDGET_DEDUCTION",
      "label": "Ad Budget Allocated",
      "description": "ad_creation: reserved ad budget",
      "amount": -5000,
      "direction": "debit",
      "status": "SUCCESS",
      "created_at": "2026-03-17T10:35:00.000Z",
      "ad": {
        "_id": "67e2aa001122334455667700",
        "title": "Third ads",
        "caption": "Third ads",
        "status": "active"
      }
    }
  ]
}
```

### Flutter Notes

- use `transactions` for the list table
- use `summary` and `wallet` for top cards
- sort is already newest first from backend

---

## Recommended Flutter Integration Flow

### Ad Feed to Vendor Reward Flow

1. User taps vendor/profile area on an ad
2. Call `POST /api/ads/{id}/click`
3. Navigate to vendor profile screen
4. Start a 3-minute visible timer
5. After 3 minutes, call `POST /api/vendors/profile/{vendorUserId}/viewProfile`
6. On success, update member wallet balance in UI

### Vendor Analytics Screen

Use:

- overview cards: `GET /api/reports/summary`
- performance table: `GET /api/reports/performance-summary`
- click table: `GET /api/reports/clicks`
- engagement table: `GET /api/reports/engagement`
- geographic table: `GET /api/reports/geographic`
- wallet/coins history: `GET /api/wallet/vendor/{userId}/history`

---

## Common Error Handling

Backend usually returns one of these shapes:

```json
{ "message": "Server error" }
```

or

```json
{ "success": false, "message": "Readable error message" }
```

Recommended Flutter handling:

- if response has `message`, show it directly
- if status is `401`, redirect to login
- if status is `403`, show permission error
- if status is `429`, show retry time when available

---

## Notes for the Flutter Team

- All dates used in filters should be sent as `YYYY-MM-DD`
- All report endpoints are scoped automatically for vendor users
- For admin users, `vendor_id` can be supplied to scope results
- `viewProfile` rewards are deducted from vendor main wallet only
- `viewProfile` does not use ad budget wallet
- click report now includes zero-click ads
