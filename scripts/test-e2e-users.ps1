$ErrorActionPreference = "Stop"

$base = "http://localhost:5000/api"
$ts = Get-Random

function PostJson {
  param(
    [string]$Url,
    [hashtable]$Body,
    [string]$Token
  )
  $headers = @{}
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  $json = $Body | ConvertTo-Json -Depth 5
  return Invoke-RestMethod -Uri $Url -Method Post -ContentType "application/json" -Headers $headers -Body $json
}

function GetJson {
  param(
    [string]$Url,
    [string]$Token
  )
  $headers = @{}
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  return Invoke-RestMethod -Uri $Url -Method Get -Headers $headers
}

Write-Host "--- Register Users ---"
$memberA = PostJson "$base/auth/register" @{ username = "memberA_$ts"; email = "memberA_$ts@test.com"; password = "password123" }
$vendorB = PostJson "$base/auth/register" @{ username = "vendorB_$ts"; email = "vendorB_$ts@test.com"; password = "password123"; role = "vendor"; company_details = @{ company_name = "Company_$ts" } }
$memberC = PostJson "$base/auth/register" @{ username = "memberC_$ts"; email = "memberC_$ts@test.com"; password = "password123" }

$mAToken = $memberA.token
$vBToken = $vendorB.token
$mCToken = $memberC.token
$mAId = $memberA.user.id
$vBId = $vendorB.user.id
$mCId = $memberC.user.id

Write-Host "--- Create Posts ---"
$mAPost = PostJson "$base/posts" @{ caption = "MemberA post"; media = @(@{ fileName = "photo_$ts.jpg"; type = "image" }) } $mAToken
$vBPost = PostJson "$base/posts" @{ caption = "VendorB post"; media = @(@{ fileName = "photo_$ts.jpg"; type = "image" }) } $vBToken
Write-Host "MemberA Post ID: $($mAPost._id) VendorB Post ID: $($vBPost._id)"

Write-Host "--- Create Reel ---"
$mAReel = PostJson "$base/posts/reels" @{ caption = "MemberA reel"; media = @(@{ fileName = "clip_$ts.mp4"; type = "video" }) } $mAToken
Write-Host "MemberA Reel ID: $($mAReel._id)"

Write-Host "--- Like Post ---"
Invoke-RestMethod -Uri "$base/posts/$($mAPost._id)/like" -Method Post -Headers @{ Authorization = "Bearer $mCToken" } | Out-Null
$likedPost = GetJson "$base/posts/$($mAPost._id)" $mCToken
Write-Host "Likes count for MemberA Post: $($likedPost.likes_count)"

Write-Host "--- Comment on Vendor Post ---"
$comment = PostJson "$base/posts/$($vBPost._id)/comments" @{ text = "Nice post!" } $mCToken
$cid = $comment._id
if (-not $cid) { $cid = $comment.comment_id }
Write-Host "Comment ID: $cid"

Write-Host "--- Like Comment ---"
Invoke-RestMethod -Uri "$base/comments/$cid/like" -Method Post -Headers @{ Authorization = "Bearer $mAToken" } | Out-Null

Write-Host "--- Reply to Comment ---"
$reply = PostJson "$base/posts/$($vBPost._id)/comments" @{ text = "Thanks!"; parent_id = $cid } $mAToken
$rid = $reply._id
if (-not $rid) { $rid = $reply.comment_id }
Write-Host "Reply ID: $rid"

Write-Host "--- Follow VendorB ---"
$followRes = PostJson "$base/follow" @{ followedUserId = $vBId } $mCToken
Write-Host "Followed VendorB: $($followRes.followed) Already: $($followRes.alreadyFollowing)"

Write-Host "--- View Reel and Complete ---"
$view1 = PostJson "$base/views" @{ postId = $mAReel._id } $mCToken
$complete = PostJson "$base/views/complete" @{ postId = $mAReel._id; watchTimeMs = 15000 } $mCToken
Write-Host "Views: $($view1.views_count) Unique: $($view1.unique_views_count) Completed: $($complete.completed) Rewarded: $($complete.rewarded)"

Write-Host "--- Create Story ---"
$storyRes = PostJson "$base/stories" @{ items = @(@{ media = @(@{ url = "http://localhost:5000/uploads/sample_$ts.jpg"; type = "image" }); transform = @{ x = 0.5; y = 0.5; scale = 1 } }) } $vBToken
Write-Host "Story created, items_count: $($storyRes.story.items_count)"

Write-Host "--- Summary ---"
$summary = [ordered]@{
  memberA = $mAId
  vendorB = $vBId
  memberC = $mCId
  mAPostId = $mAPost._id
  vBPostId = $vBPost._id
  mAReelId = $mAReel._id
  commentId = $cid
  replyId = $rid
}
$summary | Format-List | Out-String | Write-Host

Write-Host "OK: E2E test completed"
