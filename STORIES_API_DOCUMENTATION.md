# Stories API Documentation

## Overview
- Instagram-like Stories: ephemeral content with 24h lifetime, ordered items, mentions, view tracking, archive, and delete.
- One active story per user. POST /api/stories appends items to the current active story. After expiry or delete, a new POST creates a new story.
- All endpoints require Authorization: Bearer <JWT>.

## Lifecycle
- Create/Append: User adds items to an active story
- View: Viewers mark individual items as viewed (unique per item per viewer)
- Feed: Returns story preview, counts, and seen state for the requester
- Archive: After 24h, stories are lazily marked archived when fetched
- Delete: Owner can delete a story; cascades StoryItem and StoryView

## Models
- Story: user_id, items_count, views_count, expiresAt, isArchived, archivedAt, createdAt, updatedAt
  - [Story.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/models/Story.js)
- StoryItem: story_id, user_id, order, media, transform, filter, texts, mentions, expiresAt, isDeleted, timestamps
  - [StoryItem.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/models/StoryItem.js)
- StoryView: story_id, story_item_id, owner_id, viewer_id, viewedAt
  - Unique compound index: (story_item_id, viewer_id)
  - [StoryView.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/models/StoryView.js)

## Payload Schemas
- StoryItemPayload (request item):
  - media: { url:string, type:"image"|"reel", thumbnail?:string, durationSec?:number, width?:number, height?:number }
  - transform: { x?:number=0.5, y?:number=0.5, scale?:number=1, rotation?:number=0, boxWidth?:number, boxHeight?:number }
  - filter: { name?:string="none", intensity?:number }
  - texts: [{ content:string, x?:number, y?:number, fontSize:number, fontFamily?:"classic"|"modern"|"neon"|"typewriter", color?:string, align?:"left"|"center"|"right"=center, rotation?:number, background?:{ enabled?:boolean=false, color?:string, opacity?:number } }]
  - mentions: [{ user_id:string, username?:string, x?:number, y?:number }]

- StoryItem (response):
  - _id, story_id, user_id, order, media, transform, filter, texts, mentions, expiresAt, isDeleted, createdAt, updatedAt

- Feed item (response):
  - { _id, user:{ username, avatar_url }, items_count, views_count, preview_item:StoryItem, seen:boolean }

- Views response (owner-only):
  - { viewers:[{ viewer:{ _id, username, avatar_url }, viewedAt }], total_views:number, unique_viewers:number }

## Endpoints

### Create/Append Story
- POST /api/stories
- Auth: required
- Body:
```json
{
  "items": [
    {
      "media": { "url": "http://localhost:5000/uploads/photo.jpg", "type": "image" },
      "transform": { "x": 0.5, "y": 0.5, "scale": 1, "rotation": 0 },
      "filter": { "name": "none", "intensity": 0 },
      "texts": [{ "content": "Hello", "fontSize": 24 }],
      "mentions": [{ "user_id": "603e...", "username": "alice", "x": 0.2, "y": 0.3 }]
    }
  ]
}
```
- Response: { success:boolean, story:Story, items:StoryItem[] }
- Controller: [createStory](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/controllers/story.controller.js#L9-L84)

### Stories Feed
- GET /api/stories/feed
- Auth: required
- Response: Feed item[]
- Controller: [getStoriesFeed](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/controllers/story.controller.js#L86-L115)

### Story Items
- GET /api/stories/{storyId}/items
- Auth: required
- Response: StoryItem[]
- Controller: [getStoryItems](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/controllers/story.controller.js#L117-L134)

### View Story Item
- POST /api/stories/items/{itemId}/view
- Auth: required
- Response: { success:true }
- Notes: Duplicate views by the same viewer on the same item are ignored by index
- Controller: [viewStoryItem](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/controllers/story.controller.js#L136-L155)

### Viewers List with Counts
- GET /api/stories/{storyId}/views
- Auth: required, Owner-only
- Response: { viewers:[...], total_views, unique_viewers }
- Controller: [getStoryViews](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/controllers/story.controller.js#L157-L179)

### Archive
- GET /api/stories/archive
- Auth: required
- Response: { stories: Story[] }
- Controller: [getStoriesArchive](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/controllers/story.controller.js#L185-L203)

### Delete Story
- DELETE /api/stories/{storyId}
- Auth: required, Owner-only
- Response: { message:"Story deleted successfully" }
- Controller: [deleteStory](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/src/controllers/story.controller.js#L206-L223)

## Curl Examples
```bash
curl -X POST http://localhost:5000/api/stories \
  -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \
  -d '{"items":[{"media":{"url":"http://localhost:5000/uploads/photo.jpg","type":"image"}}]}'

curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/stories/feed
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/stories/STORY_ID/items
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/stories/items/ITEM_ID/view
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/stories/STORY_ID/views
curl -X DELETE -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/stories/STORY_ID
```

## Testing
- Mentions: [test-stories-mentions.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/test-stories-mentions.js)
- Views + counts: [test-stories-views-count.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/test-stories-views-count.js)
- Multiple stories per user + deletion: [test-stories-multiple.js](file:///c%3A/Asynk%20clients/B-smart/bsmart-backend/test-stories-multiple.js)
