# Admin Dashboard – Ad Engagement Coins Documentation

This document describes the **Ad Engagement Coins** feature and how to display it correctly on the backend admin dashboard.

---

## 1. Feature Overview

When users interact with ads (like, comment, reply, or save), they earn **10 coins** per action. These coins are **deducted from the ad creator’s wallet** (the vendor who created the ad).

| User Action      | User Receives | Ad Creator Loses | Transaction Types                    |
|------------------|---------------|------------------|--------------------------------------|
| Like ad          | 10 coins      | 10 coins         | `AD_LIKE_REWARD` / `AD_LIKE_DEDUCTION` |
| Comment on ad    | 10 coins      | 10 coins         | `AD_COMMENT_REWARD` / `AD_COMMENT_DEDUCTION` |
| Reply to comment | 10 coins      | 10 coins         | `AD_REPLY_REWARD` / `AD_REPLY_DEDUCTION` |
| Save ad          | 10 coins      | 10 coins         | `AD_SAVE_REWARD` / `AD_SAVE_DEDUCTION` |
| Complete ad view | Variable (per ad) | Same amount   | `AD_VIEW_REWARD` / `AD_VIEW_DEDUCTION` |

**Important:** Like, comment, reply, and save each pay **exactly 10 coins**. Only ad view completion uses the per-ad `coins_reward` amount.

---

## 2. API Endpoints for Admin Dashboard

### 2.1 Get All Wallets & Transactions (Admin)

**Endpoint:** `GET /api/wallet`  
**Auth:** Bearer token (Admin role required)  
**Headers:** `Authorization: Bearer <token>`

**Response structure:**

```json
{
  "summary": {
    "total_coins_minted": 1500,
    "total_coins_from_ads": 1200,
    "total_coins_from_reels": 300,
    "total_transactions": 450
  },
  "total": 450,
  "transactions": [
    {
      "_id": "64abc...",
      "user_id": {
        "_id": "64xyz...",
        "username": "john_doe",
        "full_name": "John Doe",
        "avatar_url": "https://...",
        "gender": "male",
        "location": "New York"
      },
      "post_id": null,
      "ad_id": {
        "_id": "64ad1...",
        "title": "Summer Sale"
      },
      "type": "AD_LIKE_REWARD",
      "amount": 10,
      "status": "SUCCESS",
      "transactionDate": "2025-03-10T10:30:00.000Z",
      "createdAt": "2025-03-10T10:30:00.000Z"
    }
  ]
}
```

### 2.2 List All Ads (Admin)

**Endpoint:** `GET /api/ads`  
**Auth:** Bearer token (Admin role required)

**Response structure:**

```json
{
  "total": 25,
  "page": 1,
  "limit": 25,
  "totalPages": 1,
  "ads": [
    {
      "_id": "64ad1...",
      "user_id": { "username": "vendor_abc", "full_name": "Vendor ABC", ... },
      "vendor_id": { "business_name": "ABC Store", ... },
      "caption": "Summer Sale!",
      "category": "Electronics",
      "status": "active",
      "total_budget_coins": 1000,
      "total_coins_spent": 250,
      "likes_count": 15,
      "comments_count": 8,
      "views_count": 500,
      "unique_views_count": 300,
      "completed_views_count": 20,
      "content_type": "reel"
    }
  ]
}
```

**Fields relevant for engagement:**

- `total_budget_coins` – Budget allocated when ad was created  
- `total_coins_spent` – Sum of all coins given out (views + likes + comments + replies + saves)  
- `likes_count`, `comments_count` – Engagement metrics  
- `completed_views_count` – Count of completed view rewards

---

## 3. Wallet Transaction Types Reference

Use these to correctly label and group transactions on the dashboard.

### 3.1 Ad Engagement (10 coins each)

| Type               | Direction | Description                              |
|--------------------|-----------|------------------------------------------|
| `AD_LIKE_REWARD`   | +10       | User earned 10 coins for liking an ad    |
| `AD_LIKE_DEDUCTION`| -10       | Ad creator lost 10 coins from the like   |
| `AD_COMMENT_REWARD`| +10       | User earned 10 coins for commenting      |
| `AD_COMMENT_DEDUCTION` | -10   | Ad creator lost 10 coins from comment    |
| `AD_REPLY_REWARD`  | +10       | User earned 10 coins for replying        |
| `AD_REPLY_DEDUCTION` | -10    | Ad creator lost 10 coins from reply      |
| `AD_SAVE_REWARD`   | +10       | User earned 10 coins for saving ad       |
| `AD_SAVE_DEDUCTION`| -10       | Ad creator lost 10 coins from save       |

### 3.2 Ad View Completion (variable amount)

| Type               | Direction | Description                                |
|--------------------|-----------|--------------------------------------------|
| `AD_VIEW_REWARD`   | +N        | User earned N coins for completing ad view |
| `AD_VIEW_DEDUCTION`| -N        | Ad creator lost N coins from that view     |

### 3.3 Other Ad-Related

| Type                  | Direction | Description                          |
|-----------------------|-----------|--------------------------------------|
| `AD_BUDGET_DEDUCTION` | -N        | Vendor spent N coins to create ad    |

### 3.4 Post/Reel (for reference)

| Type              | Description              |
|-------------------|--------------------------|
| `LIKE`            | User liked a post        |
| `COMMENT`         | User commented on post   |
| `REPLY`           | User replied on post     |
| `SAVE`            | User saved a post        |
| `REEL_VIEW_REWARD`| User earned from reel    |

---

## 4. Dashboard UI Recommendations

### 4.1 Summary Cards

Display these at the top of the Wallet / Coins section:

| Metric                 | Source                      | Description                              |
|------------------------|-----------------------------|------------------------------------------|
| **Total Coins Minted** | `summary.total_coins_minted`| Sum of all rewards paid out              |
| **Total from Ads**     | `summary.total_coins_from_ads` | Coins from ad engagement and views    |
| **Total from Reels**   | `summary.total_coins_from_reels` | Coins from reel views                 |
| **Total Transactions** | `summary.total_transactions` | Total transaction count                 |

### 4.2 Ad Engagement Breakdown (Optional Enhancement)

If you extend the backend aggregation, you can show a breakdown by action type. Otherwise, derive it from the transactions list:

| Action  | Filter on transaction `type`      | Amount per tx |
|---------|-----------------------------------|---------------|
| Like    | `AD_LIKE_REWARD`                  | 10            |
| Comment | `AD_COMMENT_REWARD`               | 10            |
| Reply   | `AD_REPLY_REWARD`                 | 10            |
| Save    | `AD_SAVE_REWARD`                  | 10            |
| View    | `AD_VIEW_REWARD`                  | Variable      |

You can group transactions by `type` and sum `amount` to get totals per action.

### 4.3 Transactions Table

| Column        | Source            | Display suggestion                          |
|---------------|-------------------|---------------------------------------------|
| Date/Time     | `createdAt`       | Localized date & time                       |
| User          | `user_id.username`| With avatar if available                    |
| Type          | `type`            | Map to label (see labels below)             |
| Amount        | `amount`          | Positive in green (+), negative in red (-)  |
| Ad            | `ad_id.title`     | Link to ad detail if available              |
| Post          | `post_id`         | Link to post if present                     |
| Status        | `status`          | SUCCESS / FAILED                            |

### 4.4 Transaction Type Labels (for UI)

```javascript
const TYPE_LABELS = {
  AD_LIKE_REWARD:        'Ad Like (User Reward)',
  AD_LIKE_DEDUCTION:     'Ad Like (Creator Deduction)',
  AD_COMMENT_REWARD:     'Ad Comment (User Reward)',
  AD_COMMENT_DEDUCTION:  'Ad Comment (Creator Deduction)',
  AD_REPLY_REWARD:       'Ad Reply (User Reward)',
  AD_REPLY_DEDUCTION:    'Ad Reply (Creator Deduction)',
  AD_SAVE_REWARD:        'Ad Save (User Reward)',
  AD_SAVE_DEDUCTION:     'Ad Save (Creator Deduction)',
  AD_VIEW_REWARD:        'Ad View Complete (User Reward)',
  AD_VIEW_DEDUCTION:     'Ad View Complete (Creator Deduction)',
  AD_BUDGET_DEDUCTION:   'Ad Budget (Vendor Spend)',
  REEL_VIEW_REWARD:      'Reel View Reward',
  LIKE:                  'Post Like',
  COMMENT:               'Post Comment',
  REPLY:                 'Post Reply',
  SAVE:                  'Post Save',
};
```

### 4.5 Filters for Transactions Table

| Filter       | Logic                                                |
|--------------|------------------------------------------------------|
| Type         | Filter `type` in `AD_LIKE_REWARD`, `AD_COMMENT_REWARD`, etc. |
| Ad vs Post   | Use `ad_id` vs `post_id` presence                    |
| User         | Filter by `user_id`                                  |
| Date range   | Filter by `createdAt`                                |
| Direction    | `amount > 0` (credits) vs `amount < 0` (debits)      |

### 4.6 Ads List Integration

On the Ads management page, for each ad show:

- `total_budget_coins` – Total budget
- `total_coins_spent` – Amount spent (views + engagement)
- `likes_count`, `comments_count` – Engagement counts
- Budget utilization: `(total_coins_spent / total_budget_coins) * 100` %

These fields are already in the `GET /api/ads` response.

---

## 5. Example Frontend Logic (Pseudo-code)

### 5.1 Fetch transactions

```javascript
const response = await fetch('/api/wallet', {
  headers: { 'Authorization': `Bearer ${adminToken}` }
});
const { summary, transactions } = await response.json();
```

### 5.2 Group ad engagement by type

```javascript
const adEngagementByType = transactions
  .filter(t => t.ad_id && ['AD_LIKE_REWARD', 'AD_COMMENT_REWARD', 'AD_REPLY_REWARD', 'AD_SAVE_REWARD'].includes(t.type))
  .reduce((acc, t) => {
    acc[t.type] = (acc[t.type] || 0) + t.amount;
    return acc;
  }, {});
// Result: { AD_LIKE_REWARD: 150, AD_COMMENT_REWARD: 80, ... }
```

### 5.3 Display amount with sign/color

```javascript
function formatAmount(amount) {
  const sign = amount >= 0 ? '+' : '';
  const color = amount >= 0 ? 'green' : 'red';
  return { text: `${sign}${amount}`, color };
}
```

---

## 6. Checklist for Dashboard Implementation

- [ ] Display summary cards (total minted, from ads, from reels, total transactions)
- [ ] Show transactions table with date, user, type, amount, ad/post, status
- [ ] Map transaction types to readable labels
- [ ] Use color/sign for positive vs negative amounts
- [ ] Add filters: type, date range, user (optional)
- [ ] On Ads page, show budget vs spent and engagement metrics per ad
- [ ] Include `AD_SAVE_REWARD` and `AD_SAVE_DEDUCTION` in filters and labels

---

## 7. Related API Endpoints Summary

| Method | Endpoint        | Purpose                                  |
|--------|-----------------|------------------------------------------|
| GET    | `/api/wallet`   | All transactions + summary (Admin)       |
| GET    | `/api/ads`      | All ads list (Admin)                     |
| PATCH  | `/api/admin/ads/:id` | Update ad status (approve/reject)  |

---

*Document version: 1.0 | Last updated: March 2025*
