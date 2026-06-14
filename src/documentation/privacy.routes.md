# Privacy Routes

- GET  /api/privacy                        — Get all privacy settings (auth)
- PATCH /api/privacy/profile-visibility    — Update who can view profile sections (auth)
- PATCH /api/privacy/activity-status       — Update online status / last seen / read receipts (auth)
- PATCH /api/privacy/follow-settings       — Update follow request behaviour (auth)
- PATCH /api/privacy/messaging             — Update who can send direct messages (auth)
- PATCH /api/privacy/search-discovery      — Update search & discovery settings (auth)

Also — existing Account Privacy (in follow routes):
- PATCH /api/follow/privacy/toggle         — Toggle account public/private (auth)
- PATCH /api/follow/privacy/set            — Set account public/private explicitly (auth)
- GET   /api/follow/privacy/status         — Get current public/private status (auth)


---

# Privacy Enforcement Rules

Every section has a visibility value that controls who can see it:

| Value            | Who can see                          |
|------------------|--------------------------------------|
| `everyone`       | All users (including unauthenticated)|
| `followers_only` | Only users who follow the owner      |
| `nobody`         | Only the profile owner themselves    |

The backend checks the viewer's relationship automatically:
- **owner** → always sees everything regardless of settings
- **follower** → can see `everyone` and `followers_only` sections
- **public / unauthenticated** → can only see `everyone` sections

When a section is blocked the API returns `403` with `"privacy_blocked": true`.

---

# API Documentation for Privacy Settings

## Get All Privacy Settings

**GET** `/api/privacy`

Auth: Bearer

Responses
- 200:
```json
{
  "profile_visibility": {
    "profile":        "everyone",
    "posts":          "everyone",
    "stories":        "followers_only",
    "pulse":          "everyone",
    "followers_list": "everyone",
    "following_list": "followers_only"
  },
  "activity_status": {
    "show_online_status": true,
    "show_last_seen":     true,
    "show_read_receipts": false
  },
  "follow_settings": {
    "allow_follow_requests":        true,
    "auto_approve_follow_requests": false
  },
  "messaging_privacy": "followers_only",
  "search_discovery": {
    "allow_search_by_username": true,
    "allow_search_by_email":    false,
    "allow_search_by_phone":    false,
    "appear_in_suggestions":    true
  }
}
```
- 401: Unauthorized
- 500: Server error

---

## Update Profile Visibility

**PATCH** `/api/privacy/profile-visibility`

Auth: Bearer

Controls who can view each section of the profile page.
Send only the fields you want to change — others are left unchanged.

Request Body
```json
{
  "profile":        "everyone | followers_only | nobody",
  "posts":          "everyone | followers_only | nobody",
  "stories":        "everyone | followers_only | nobody",
  "pulse":          "everyone | followers_only | nobody",
  "followers_list": "everyone | followers_only | nobody",
  "following_list": "everyone | followers_only | nobody"
}
```

Field Mapping — what each field controls on the frontend:

| Field            | Blocks access to                                    |
|------------------|-----------------------------------------------------|
| `profile`        | The entire profile page (bio, info, counts)         |
| `posts`          | Posts tab + Tweets tab on the profile               |
| `stories`        | Stories shown on profile / story bar                |
| `pulse`          | Reels tab + Promote Reels (short videos) on profile |
| `followers_list` | GET /api/users/:id/followers                        |
| `following_list` | GET /api/users/:id/following                        |

Responses
- 200:
```json
{
  "message": "Profile visibility updated",
  "profile_visibility": {
    "profile":        "everyone",
    "posts":          "followers_only",
    "stories":        "followers_only",
    "pulse":          "everyone",
    "followers_list": "followers_only",
    "following_list": "followers_only"
  }
}
```
- 400: Invalid visibility value or no fields provided
- 401: Unauthorized
- 500: Server error

---

## Update Activity Status

**PATCH** `/api/privacy/activity-status`

Auth: Bearer

Controls whether other users can see your online/last-seen state and read receipts.
Send only the fields you want to change.

Request Body
```json
{
  "show_online_status": true,
  "show_last_seen":     false,
  "show_read_receipts": false
}
```

| Field                | Effect when false                                     |
|----------------------|-------------------------------------------------------|
| `show_online_status` | Others cannot see the green "online" dot next to you  |
| `show_last_seen`     | Others cannot see your "last seen" timestamp          |
| `show_read_receipts` | Others cannot see double-tick / "seen" in chat        |

Responses
- 200:
```json
{
  "message": "Activity status updated",
  "activity_status": {
    "show_online_status": true,
    "show_last_seen":     false,
    "show_read_receipts": false
  }
}
```
- 400: No valid fields provided
- 401: Unauthorized
- 500: Server error

---

## Update Follow Settings

**PATCH** `/api/privacy/follow-settings`

Auth: Bearer

Controls how follow requests work for this account.
Send only the fields you want to change.

Request Body
```json
{
  "allow_follow_requests":        true,
  "auto_approve_follow_requests": false
}
```

| Field                          | Behaviour                                                                                    |
|--------------------------------|----------------------------------------------------------------------------------------------|
| `allow_follow_requests`        | `false` → nobody can send you a follow request at all                                        |
| `auto_approve_follow_requests` | `true` → incoming follow requests are auto-accepted without manual approval (private accounts)|

Note: `auto_approve_follow_requests` is relevant only when the account is private (`isPrivate: true`).
To set the account private/public use `PATCH /api/follow/privacy/set`.

Responses
- 200:
```json
{
  "message": "Follow settings updated",
  "follow_settings": {
    "allow_follow_requests":        true,
    "auto_approve_follow_requests": false
  }
}
```
- 400: No valid fields provided
- 401: Unauthorized
- 500: Server error

---

## Update Messaging Privacy

**PATCH** `/api/privacy/messaging`

Auth: Bearer

Controls who can send you direct messages.

Request Body
```json
{
  "messaging_privacy": "everyone | followers_only | nobody"
}
```

| Value            | Effect                                      |
|------------------|---------------------------------------------|
| `everyone`       | Anyone on the platform can message you      |
| `followers_only` | Only your followers can message you         |
| `nobody`         | Direct messages are completely disabled     |

Responses
- 200:
```json
{
  "message": "Messaging privacy updated",
  "messaging_privacy": "followers_only"
}
```
- 400: Invalid or missing value
- 401: Unauthorized
- 500: Server error

---

## Update Search & Discovery

**PATCH** `/api/privacy/search-discovery`

Auth: Bearer

Controls how others can find your account on the platform.
Send only the fields you want to change.

Request Body
```json
{
  "allow_search_by_username": true,
  "allow_search_by_email":    false,
  "allow_search_by_phone":    false,
  "appear_in_suggestions":    true
}
```

| Field                      | Effect when false                                              |
|----------------------------|----------------------------------------------------------------|
| `allow_search_by_username` | Account will not appear in username search results             |
| `allow_search_by_email`    | Others cannot find your account by searching your email        |
| `allow_search_by_phone`    | Others cannot find your account by searching your phone number |
| `appear_in_suggestions`    | Account will not show in "People you may know" suggestions     |

Responses
- 200:
```json
{
  "message": "Search & discovery settings updated",
  "search_discovery": {
    "allow_search_by_username": true,
    "allow_search_by_email":    false,
    "allow_search_by_phone":    false,
    "appear_in_suggestions":    true
  }
}
```
- 400: No valid fields provided
- 401: Unauthorized
- 500: Server error

---

# Privacy Enforcement — Which API Checks What

## Profile Page — GET /api/users/:id  or  GET /api/users/username/:username

Checks: `profile_visibility.profile`

- `everyone` → full profile returned to anyone
- `followers_only` → non-followers get 403:
```json
{
  "message": "This profile is private",
  "privacy_blocked": true,
  "user": { "_id": "...", "username": "...", "full_name": "...", "avatar_url": "..." }
}
```
- `nobody` → same 403 for everyone except the owner

---

## Profile Content — GET /api/users/:id/profile-content

Checks: `profile_visibility.posts` and `profile_visibility.pulse`

The response always returns the full shape but blocked sections have empty arrays:
```json
{
  "user_id": "...",
  "privacy_restricted": {
    "posts": false,
    "pulse": true
  },
  "counts": { "posts": 3, "reels": 0, "promote_reels": 0, "tweets": 2 },
  "data": {
    "posts":         [...],
    "reels":         [],
    "promote_reels": [],
    "tweets":        [...]
  }
}
```

| Section blocked  | Returns empty                    |
|------------------|----------------------------------|
| `posts`          | `posts: []` and `tweets: []`     |
| `pulse`          | `reels: []` and `promote_reels: []` |

---

## Stories — GET /api/stories/user/:userId

Checks: `profile_visibility.stories`

Blocked response (403):
```json
{ "message": "Stories are private", "privacy_blocked": true }
```

---

## Followers List — GET /api/users/:id/followers

Checks: `profile_visibility.followers_list`

Blocked response (403):
```json
{ "message": "Followers list is private", "privacy_blocked": true }
```

---

## Following List — GET /api/users/:id/following

Checks: `profile_visibility.following_list`

Blocked response (403):
```json
{ "message": "Following list is private", "privacy_blocked": true }
```

---

# Complete Frontend Flow (Profile Page)

```
1. Call GET /api/users/:id  (or /username/:username)
   ├── 403 + privacy_blocked: true  →  Show "This account is private" screen
   │                                    Display the minimal user card returned in body.user
   └── 200  →  Render full profile header (avatar, bio, counts, etc.)

2. Call GET /api/users/:id/profile-content
   ├── Check privacy_restricted.posts === true  →  Show "Posts are private" placeholder tab
   ├── Check privacy_restricted.pulse === true  →  Show "Reels are private" placeholder tab
   └── Otherwise  →  Render posts / reels / promote reels / tweets normally

3. Call GET /api/stories/user/:userId
   ├── 403 + privacy_blocked: true  →  Hide story ring / show locked icon
   └── 200  →  Show story ring normally

4. Call GET /api/users/:id/followers  /  GET /api/users/:id/following
   ├── 403 + privacy_blocked: true  →  Show "List is private" message on that screen
   └── 200  →  Render the list normally

5. Messaging (frontend-enforced using cached privacy.messaging_privacy)
   ├── "nobody"         →  Hide / disable the "Message" button entirely
   ├── "followers_only" →  Show button only if viewer is following the profile owner
   └── "everyone"       →  Always show the "Message" button
```
