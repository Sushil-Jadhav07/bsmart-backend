const API_URL = 'http://localhost:5000/api';
let token = '';
let userId = '';

// Helper function for delays
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper for logging steps
const step = (msg) => console.log(`\n\x1b[36m[STEP]\x1b[0m ${msg}`);
const success = (msg) => console.log(`\x1b[32m  ✓ ${msg}\x1b[0m`);
const info = (msg) => console.log(`  ℹ ${msg}`);
const error = (msg) => console.log(`\x1b[31m  ✗ ${msg}\x1b[0m`);

async function runDemo() {
  console.log('\x1b[1m\x1b[33m=== B-Smart Comment & Reply Feature Demo ===\x1b[0m');

  try {
    // 1. Register a new user
    step('Registering a temporary user...');
    const timestamp = Date.now();
    const userPayload = {
      username: `demo_${timestamp}`,
      email: `demo_${timestamp}@example.com`,
      password: 'password123',
      full_name: 'Demo User'
    };

    const authRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userPayload)
    });
    
    const authData = await authRes.json();
    if (!authRes.ok) throw new Error(`Registration failed: ${authData.message}`);
    
    token = authData.token;
    userId = authData.user.id;
    success(`User registered: ${userPayload.username}`);

    // 2. Create a Post
    step('Creating a new post...');
    const postPayload = {
      caption: 'Hello World! This is a demo post.',
      media: [{ fileName: 'demo.jpg', type: 'image', ratio: 1 }]
    };

    const postRes = await fetch(`${API_URL}/posts`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(postPayload)
    });

    const postData = await postRes.json();
    if (!postRes.ok) throw new Error(`Create post failed: ${postData.message}`);
    
    const postId = postData._id;
    success(`Post created (ID: ${postId})`);

    // 3. Add a Root Comment
    step('Adding a root comment...');
    const commentPayload = { text: 'This is a top-level comment.' };
    
    const commentRes = await fetch(`${API_URL}/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(commentPayload)
    });

    const commentData = await commentRes.json();
    if (!commentRes.ok) throw new Error(`Comment failed: ${commentData.message}`);
    
    const commentId = commentData._id;
    success(`Root comment added (ID: ${commentId})`);

    // 4. Add a Reply (The new feature!)
    step('Adding a reply to the root comment (One-Level Reply)...');
    const replyPayload = { 
      text: 'This is a reply to the comment!',
      parent_id: commentId // <--- This is the key field for replies
    };
    
    const replyRes = await fetch(`${API_URL}/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(replyPayload)
    });

    const replyData = await replyRes.json();
    if (!replyRes.ok) throw new Error(`Reply failed: ${replyData.message}`);
    
    const replyId = replyData._id;
    success(`Reply added successfully (ID: ${replyId})`);
    info(`Notice 'parent_id' is set to: ${replyData.parent_id}`);

    // 5. Like the Reply
    step('Liking the reply...');
    const likeRes = await fetch(`${API_URL}/comments/${replyId}/like`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`
      }
    });

    const likeData = await likeRes.json();
    if (!likeRes.ok) throw new Error(`Like failed: ${likeData.message}`);
    
    success(`Reply liked! New likes count: ${likeData.likes_count}`);

    // 6. Verify by Fetching Replies
    step('Fetching replies for the root comment...');
    const getRepliesRes = await fetch(`${API_URL}/comments/${commentId}/replies`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const getRepliesData = await getRepliesRes.json();
    if (!getRepliesRes.ok) throw new Error(`Get replies failed: ${getRepliesData.message}`);
    
    success(`Fetched ${getRepliesData.replies.length} replies.`);
    console.log('\nRetrieved Reply Data:');
    console.dir(getRepliesData.replies[0], { depth: null, colors: true });

    console.log('\n\x1b[1m\x1b[32m=== Demo Completed Successfully ===\x1b[0m');
    console.log('You can delete this script (demo_usage.js) when you are done.');

  } catch (err) {
    error(err.message);
  }
}

runDemo();
