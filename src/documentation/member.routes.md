# Member Routes

- GET /api/members/me — Get my member profile (auth)
- GET /api/members/users/{id} — Get member by user ID


## Get My Member

**GET** `/api/members/me`

Auth: Bearer

Responses
- 200: Member object
- 404: Member profile not found

---

## Get Member by User ID

**GET** `/api/members/users/{id}`

Responses
- 200: Member object
- 404: Member profile not found
