# B-Smart Backend Documentation

This document provides a detailed overview of the B-Smart backend architecture, data models, and API endpoints to assist in developing features for the Admin Dashboard.

## **Architecture Overview**
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose ODM)
- **Real-time**: Socket.io for notifications and chat
- **Authentication**: JWT (JSON Web Tokens) with Passport.js
- **File Handling**: Multer for local/cloud storage

---

## **Core Data Models**

### **1. User ([User.js](file:///c:/Asynk%20clients/B-smart/bsmart-backend/src/models/User.js))**
The primary user model for members, vendors, and admins.
- `email`, `username`, `password`: Core credentials.
- `role`: `member`, `vendor`, `admin`, `sales`.
- `is_active`: Boolean status.
- `company_details`: Snapshot of vendor info (if role is vendor).
- `ad_interests`: Array of strings for targeted ads.
- `isDeleted`: Soft delete flag.

### **2. Vendor ([Vendor.js](file:///c:/Asynk%20clients/B-smart/bsmart-backend/src/models/Vendor.js))**
Extended profile for vendor users.
- `user_id`: Reference to User model.
- `business_name`, `logo_url`, `cover_image_urls`.
- `company_details`: Registration info, industry, tax ID.
- `business_details`: Category, nature of business, coverage.
- `online_presence`: Website, social links, address.
- `validated`: Approval status.
- `assigned_sales_officer`: Reference to a User with 'sales' role.

### **3. Ad ([Ad.js](file:///c:/Asynk%20clients/B-smart/bsmart-backend/src/models/Ad.js))**
Advertisement data and targeting settings.
- `vendor_id`, `user_id`: Ownership references.
- `ad_type`: `promote`, `general`.
- `media`: Array of objects (images/videos with crop/filter settings).
- `cta`: Call-to-action (URL, phone, WhatsApp).
- `budget`: `daily_budget_coins`, `start_date`, `end_date`.
- `targeting`: Location (countries, states, cities), age, gender, interests.
- `status`: `draft`, `pending`, `active`, `paused`, `rejected`.

### **4. Post ([Post.js](file:///c:/Asynk%20clients/B-smart/bsmart-backend/src/models/Post.js))**
User-generated content (posts and reels).
- `user_id`: Creator reference.
- `caption`, `location`, `media`.
- `type`: `post`, `reel`, `promote`, `advertise`.
- `likes_count`, `comments_count`, `views_count`.

### **5. Wallet & Transactions ([Wallet.js](file:///c:/Asynk%20clients/B-smart/bsmart-backend/src/models/Wallet.js), [WalletTransaction.js](file:///c:/Asynk%20clients/B-smart/bsmart-backend/src/models/WalletTransaction.js))**
Coin-based economy.
- **Wallet**: `user_id`, `balance`.
- **Transaction**:
    - `type`: `VENDOR_RECHARGE`, `AD_VIEW_REWARD`, `ADMIN_ADJUSTMENT`, etc.
    - `amount`, `description`.

### **6. Tweets ([tweet.model.js](file:///c:/Asynk%20clients/B-smart/bsmart-backend/src/models/tweet.model.js))**
Twitter-like text posts.
- `author`: Reference to User.
- `content`: Text content (max 280 chars).
- `media`: Array of image URLs.
- `likes_count`, `reposts_count`, `replies_count`.
- `parent_tweet_id`: For replies.

---

## **API Endpoints (Admin & Management)**

### **Admin Moderation (`/api/admin`)**
*Requires `admin` role.*
- `DELETE /posts/:id`: Permanently delete a post.
- `DELETE /users/:id`: Soft delete a user.
- `DELETE /vendors/:id`: Soft delete a vendor.
- `PATCH /ads/:id`: Update ad status (`active`, `paused`, `rejected`).
- `DELETE /tweets/:id`: Delete a tweet (via standard tweet routes).

### **Sales & Assignments (`/api/sales`)**
- `GET /officers`: List all users with the `sales` role.
- `GET /officers/:id/vendors`: List vendors assigned to a specific sales officer.
- `POST /assign`: Assign a sales officer to a vendor (`vendor_user_id`, `sales_user_id`).

### **User Management (`/api/users`)**
- `GET /`: List all users.
- `GET /:id`: Get detailed user profile.
- `PUT /:id`: Update user details.

### **Vendor Management (`/api/vendors`)**
- `GET /`: List all vendors.
- `GET /profile/:id`: Get vendor profile details.
- `PATCH /validate/:id`: Validate/Approve a vendor.

### **Ad Management (`/api/ads`)**
- `GET /`: List ads (filters by status, vendor, etc.).
- `POST /`: Create a new ad.
- `PUT /:id`: Update ad details.

### **Wallet & Financials (`/api/wallet`)**
- `GET /wallet/balance/:userId`: Get user balance.
- `POST /wallet/admin/adjust`: Manually add/remove coins.
- `POST /wallet/recharge`: Top up vendor coins.

---

## **Integration Notes for Dashboard**
1. **Auth**: Use the token from `/api/auth/login` in the `Authorization: Bearer <token>` header.
2. **Soft Deletes**: Most models use `isDeleted: true`. Ensure filters account for this.
3. **Roles**: Verify the user role is `admin` before showing management UI.
4. **Data Consistency**: When updating a Vendor, ensure the corresponding User's `company_details` are synced if necessary.
