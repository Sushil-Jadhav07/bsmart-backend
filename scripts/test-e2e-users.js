const fetch = global.fetch;

const base = 'http://localhost:5000/api';

const j = async (url, method, body, token) => {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  }
  return json;
};

(async () => {
  const ts = Date.now();
  console.log('--- Register Users ---');
  const memberA = await j(`${base}/auth/register`, 'POST', {
    username: `memberA_${ts}`,
    email: `memberA_${ts}@test.com`,
    password: 'password123'
  });
  const vendorB = await j(`${base}/auth/register`, 'POST', {
    username: `vendorB_${ts}`,
    email: `vendorB_${ts}@test.com`,
    password: 'password123',
    role: 'vendor',
    company_details: { company_name: `Company_${ts}` }
  });
  const memberC = await j(`${base}/auth/register`, 'POST', {
    username: `memberC_${ts}`,
    email: `memberC_${ts}@test.com`,
    password: 'password123'
  });

  const mAToken = memberA.token;
  const vBToken = vendorB.token;
  const mCToken = memberC.token;
  const mAId = memberA.user.id;
  const vBId = vendorB.user.id;
  const mCId = memberC.user.id;

  console.log('--- Create Posts ---');
  const mAPost = await j(`${base}/posts`, 'POST', {
    caption: 'MemberA post',
    media: [{ fileName: `photo_${ts}.jpg`, type: 'image' }]
  }, mAToken);
  const vBPost = await j(`${base}/posts`, 'POST', {
    caption: 'VendorB post',
    media: [{ fileName: `photo_${ts}.jpg`, type: 'image' }]
  }, vBToken);

  console.log('MemberA Post ID:', mAPost._id, 'VendorB Post ID:', vBPost._id);

  console.log('--- Create Reel ---');
  const mAReel = await j(`${base}/posts/reels`, 'POST', {
    caption: 'MemberA reel',
    media: [{ fileName: `clip_${ts}.mp4`, type: 'video' }]
  }, mAToken);
  console.log('MemberA Reel ID:', mAReel._id);

  console.log('--- Like Post ---');
  await j(`${base}/posts/${mAPost._id}/like`, 'POST', null, mCToken);
  const likedPost = await j(`${base}/posts/${mAPost._id}`, 'GET', null, mCToken);
  console.log('Likes count for MemberA Post:', likedPost.likes_count);

  console.log('--- Comment on Vendor Post ---');
  const comment = await j(`${base}/posts/${vBPost._id}/comments`, 'POST', { text: 'Nice post!' }, mCToken);
  console.log('Comment ID:', comment.comment_id || comment._id);

  console.log('--- Like Comment ---');
  await j(`${base.replace('/api','')}/api/comments/${comment._id || comment.comment_id || comment.id}/like`, 'POST', null, mAToken);

  console.log('--- Reply to Comment ---');
  const reply = await j(`${base}/posts/${vBPost._id}/comments`, 'POST', { text: 'Thanks!', parent_id: comment._id || comment.comment_id || comment.id }, mAToken);
  console.log('Reply ID:', reply.comment_id || reply._id);

  console.log('--- Follow VendorB ---');
  const followRes = await j(`${base}/follow`, 'POST', { followedUserId: vBId }, mCToken);
  console.log('Followed VendorB:', followRes.followed, 'Already:', followRes.alreadyFollowing);

  console.log('--- View Reel and Complete ---');
  const view1 = await j(`${base}/views`, 'POST', { postId: mAReel._id }, mCToken);
  const complete = await j(`${base}/views/complete`, 'POST', { postId: mAReel._id, watchTimeMs: 15000 }, mCToken);
  console.log('Views:', view1.views_count, 'Unique:', view1.unique_views_count, 'Completed:', complete.completed, 'Rewarded:', complete.rewarded);

  console.log('--- Create Story ---');
  const storyRes = await j(`${base}/stories`, 'POST', {
    items: [{
      media: [{ url: `http://localhost:5000/uploads/sample_${ts}.jpg`, type: 'image' }],
      transform: { x: 0.5, y: 0.5, scale: 1 }
    }]
  }, vBToken);
  console.log('Story created, items_count:', storyRes.story.items_count);

  console.log('--- Summary ---');
  console.log({
    memberA: mAId,
    vendorB: vBId,
    memberC: mCId,
    mAPostId: mAPost._id,
    vBPostId: vBPost._id,
    mAReelId: mAReel._id,
    commentId: comment._id || comment.comment_id,
    replyId: reply._id || reply.comment_id
  });

  console.log('OK: E2E test completed');
  process.exit(0);
})().catch(err => {
  console.error('E2E test failed:', err.message || err);
  process.exit(1);
});
