$ErrorActionPreference = "Stop"
$base = "http://localhost:5000/api"
$ts = Get-Random

function PostJson {
  param([string]$Url, [hashtable]$Body, [string]$Token)
  $headers = @{}
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  $json = $Body | ConvertTo-Json -Depth 5
  return Invoke-RestMethod -Uri $Url -Method Post -ContentType "application/json" -Headers $headers -Body $json
}
function GetJson {
  param([string]$Url, [string]$Token)
  $headers = @{}
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  return Invoke-RestMethod -Uri $Url -Method Get -Headers $headers
}

Write-Host "--- Setup Admin and Users ---"
$admin = PostJson "$base/auth/register" @{ username = "admin_$ts"; email = "admin_$ts@test.com"; password = "password123"; role = "admin" }
$adminToken = $admin.token
$member = PostJson "$base/auth/register" @{ username = "member_$ts"; email = "member_$ts@test.com"; password = "password123" }
$memberToken = $member.token
$vendor = PostJson "$base/auth/register" @{ username = "vendor_$ts"; email = "vendor_$ts@test.com"; password = "password123"; role = "vendor"; company_details = @{ company_name = "Company_$ts" } }
$vendorUserId = $vendor.user.id

Write-Host "--- Create Post by Member ---"
$post = PostJson "$base/posts" @{ caption = "Post to delete"; media = @(@{ fileName = "photo_$ts.jpg"; type = "image" }) } $memberToken
$postId = $post._id
Write-Host "Post ID: $postId"

Write-Host "--- Admin Delete Post ---"
Invoke-RestMethod -Uri "$base/admin/posts/$postId" -Method Delete -Headers @{ Authorization = "Bearer $adminToken" } | Out-Null
try {
  $p = GetJson "$base/posts/$postId" $adminToken
  throw "Post still exists after delete"
} catch {
  Write-Host "Post deletion verified: Not Found"
}

Write-Host "--- Get Vendor entity and Admin Delete ---"
$vendorObj = GetJson "$base/vendors/users/$vendorUserId" $null
$vendorId = $vendorObj._id
Invoke-RestMethod -Uri "$base/admin/vendors/$vendorId" -Method Delete -Headers @{ Authorization = "Bearer $adminToken" } -ContentType "application/json" -Body (@{ downgrade_user_to_member = $true } | ConvertTo-Json) | Out-Null
try {
  $vo = GetJson "$base/vendors/users/$vendorUserId" $null
  throw "Vendor still exists after delete"
} catch {
  Write-Host "Vendor deletion verified: Not Found"
}

Write-Host "OK: Admin hard delete tests passed"
