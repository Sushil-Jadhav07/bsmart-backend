const API_URL = 'http://localhost:5000/api';

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m"
};

const step = (msg) => console.log(`\n${colors.cyan}[STEP] ${msg}${colors.reset}`);
const success = (msg) => console.log(`${colors.green}  ✓ ${msg}${colors.reset}`);
const info = (msg) => console.log(`  ℹ ${msg}`);
const errorLog = (msg) => console.log(`${colors.red}  ✗ ${msg}${colors.reset}`);

async function runFullFlow() {
  console.log(`${colors.bright}${colors.yellow}=== B-Smart Full Feature End-to-End Test ===${colors.reset}`);
  
  const timestamp = Date.now();
  let vendorToken, memberToken;
  let vendorId, memberId;
  let postId, commentId, replyId;

  try {
    // ---------------------------------------------------------
    // 1. VENDOR REGISTRATION
    // ---------------------------------------------------------
    step('Registering a VENDOR user...');
    const vendorPayload = {
      username: `vendor_${timestamp}`,
      email: `vendor_${timestamp}@test.com`,
      password: 'password123',
      role: 'vendor'
    };
    
    const vendorRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vendorPayload)
    });
    const vendorData = await vendorRes.json();
    
    if (!vendorRes.ok) throw new Error(`Vendor register failed: ${vendorData.message}`);
    
    vendorToken = vendorData.token;
    vendorId = vendorData.user.id;
    
    success(`Vendor registered: ${vendorPayload.username}`);
    
    // Verify Wallet
    if (vendorData.user.wallet && vendorData.user.wallet.balance === 5000) {
      success('Vendor Wallet Balance verified: 5000 Coins');
    } else {
      throw new Error(`Vendor wallet balance mismatch. Expected 5000, got ${vendorData.user.wallet?.balance}`);
    }

    // ---------------------------------------------------------
    // 2. MEMBER REGISTRATION
    // ---------------------------------------------------------
    step('Registering a MEMBER user...');
    const memberPayload = {
      username: `member_${timestamp}`,
      email: `member_${timestamp}@test.com`,
      password: 'password123',
      role: 'member'
    };
    
    const memberRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memberPayload)
    });
    const memberData = await memberRes.json();
    
    if (!memberRes.ok) throw new Error(`Member register failed: ${memberData.message}`);
    
    memberToken = memberData.token;
    memberId = memberData.user.id;
    
    success(`Member registered: ${memberPayload.username}`);
    
    // Verify Wallet
    if (memberData.user.wallet && memberData.user.wallet.balance === 0) {
      success('Member Wallet Balance verified: 0 Coins');
    } else {
      throw new Error(`Member wallet balance mismatch. Expected 0, got ${memberData.user.wallet?.balance}`);
    }

    // ---------------------------------------------------------
    // 3. VENDOR CREATES A POST
    // ---------------------------------------------------------
    step('Vendor creating a post...');
    const postPayload = {
      caption: 'Exclusive Vendor Product! Check it out.',
      media: [{ fileName: 'product.jpg', type: 'image', ratio: 1 }]
    };

    const postRes = await fetch(`${API_URL}/posts`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${vendorToken}`
      },
      body: JSON.stringify(postPayload)
    });
    const postData = await postRes.json();
    
    if (!postRes.ok) throw new Error(`Post creation failed: ${postData.message}`);
    
    postId = postData._id;
    success(`Post created (ID: ${postId})`);

    // ---------------------------------------------------------
    // 4. MEMBER COMMENTS ON POST
    // ---------------------------------------------------------
    step('Member commenting on the post...');
    const commentPayload = { text: 'How much does this cost?' };
    
    const commentRes = await fetch(`${API_URL}/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${memberToken}`
      },
      body: JSON.stringify(commentPayload)
    });
    const commentData = await commentRes.json();
    
    if (!commentRes.ok) throw new Error(`Comment failed: ${commentData.message}`);
    
    commentId = commentData._id;
    success(`Comment added by Member (ID: ${commentId})`);

    // ---------------------------------------------------------
    // 5. VENDOR REPLIES TO MEMBER
    // ---------------------------------------------------------
    step('Vendor replying to the comment...');
    const replyPayload = { 
      text: 'It costs 100 Coins!',
      parent_id: commentId
    };
    
    const replyRes = await fetch(`${API_URL}/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${vendorToken}`
      },
      body: JSON.stringify(replyPayload)
    });
    const replyData = await replyRes.json();
    
    if (!replyRes.ok) throw new Error(`Reply failed: ${replyData.message}`);
    
    replyId = replyData._id;
    success(`Reply added by Vendor (ID: ${replyId})`);
    info(`Reply Parent ID: ${replyData.parent_id}`);

    // ---------------------------------------------------------
    // 6. MEMBER LIKES THE REPLY
    // ---------------------------------------------------------
    step('Member liking the Vendor\'s reply...');
    
    const likeRes = await fetch(`${API_URL}/comments/${replyId}/like`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${memberToken}`
      }
    });
    const likeData = await likeRes.json();
    
    if (!likeRes.ok) throw new Error(`Like failed: ${likeData.message}`);
    
    success(`Reply Liked! New Like Count: ${likeData.likes_count}`);

    // ---------------------------------------------------------
    // 6.5. VERIFY LATEST COMMENTS ON POST OBJECT
    // ---------------------------------------------------------
    step('Verifying latest_comments on Post object (Feed Preview)...');
    
    const postFetchRes = await fetch(`${API_URL}/posts/${postId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${memberToken}` }
    });
    const postFetchData = await postFetchRes.json();
    
    if (postFetchData.latest_comments && postFetchData.latest_comments.length > 0) {
      const latest = postFetchData.latest_comments[0];
      // Note: latest_comments[0] should be the NEWEST comment.
      // We added a comment (commentId) and a reply (replyId).
      // Depending on implementation, replies might NOT be in latest_comments (we only added top-level check).
      // In my implementation: "if (!parentCommentId) { push to latest_comments }"
      // So the REPLY (which has parentCommentId) will NOT be in latest_comments.
      // So latest_comments[0] should be the COMMENT (commentId).
      
      if (latest._id === commentId) {
        success('Latest top-level comment found in Post.latest_comments.');
        if (latest.text === commentPayload.text) {
             success('Comment text verified in Post object.');
        } else {
             errorLog(`Comment text mismatch. Expected "${commentPayload.text}", got "${latest.text}"`);
        }

        // Verify Reply Nesting
        if (latest.replies && latest.replies.length > 0) {
           const reply = latest.replies[0];
           if (reply.text === replyPayload.text) {
             success('Reply verified inside latest_comments structure.');
           } else {
             errorLog(`Reply text mismatch in latest_comments. Expected "${replyPayload.text}", got "${reply.text}"`);
           }
        } else {
           errorLog('Replies array missing or empty in latest_comments.');
        }

      } else {
        errorLog(`Latest comment ID mismatch. Expected ${commentId}, got ${latest._id}`);
      }
    } else {
      errorLog('No latest_comments found on Post object.');
    }

    // ---------------------------------------------------------
    // 7. VERIFY THREAD STRUCTURE (GET REPLIES)
    // ---------------------------------------------------------
    step('Fetching replies for the comment...');
    
    const getRepliesRes = await fetch(`${API_URL}/comments/${commentId}/replies`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${memberToken}` }
    });
    const getRepliesData = await getRepliesRes.json();
    
    if (!getRepliesRes.ok) throw new Error(`Get replies failed: ${getRepliesData.message}`);
    
    if (getRepliesData.replies && getRepliesData.replies.length > 0) {
      success(`Successfully retrieved ${getRepliesData.replies.length} reply/replies.`);
      const fetchedReply = getRepliesData.replies[0];
      
      if (fetchedReply._id === replyId && fetchedReply.user.username === vendorPayload.username) {
        success('Reply content and author verified.');
      } else {
        errorLog('Reply verification failed (ID or Author mismatch).');
      }
    } else {
      throw new Error('No replies found.');
    }

    console.log(`\n${colors.bright}${colors.green}=== ALL TESTS PASSED SUCCESSFULLY ===${colors.reset}`);

  } catch (err) {
    console.log(`\n${colors.bright}${colors.red}=== TEST FAILED ===${colors.reset}`);
    console.error(err);
  }
}

runFullFlow();
