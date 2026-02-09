const http = require('http');

const BASE_URL = 'http://localhost:5000/api';

// Helper for making HTTP requests
function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (e) => reject(e));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTest() {
  console.log('--- Starting Test Case for Enhanced Post ---');

  // 1. Authentication
  const userCredentials = {
    username: 'testuser_new_features',
    email: 'test_new@example.com',
    password: 'password123',
    full_name: 'Test User New'
  };

  console.log('\n1. Attempting to Register/Login...');
  let authResponse = await request('POST', '/auth/register', userCredentials);
  
  if (authResponse.status !== 201 && authResponse.status !== 200) {
    // If registration fails (maybe already exists), try login
    console.log('Registration skipped (maybe exists), trying login...');
    authResponse = await request('POST', '/auth/login', {
      email: userCredentials.email,
      password: userCredentials.password
    });
  }

  if (!authResponse.data.token) {
    console.error('Authentication failed:', authResponse.data);
    process.exit(1);
  }

  const token = authResponse.data.token;
  console.log('Authentication successful. Token received.');

  // 2. Create Post with New Features
  console.log('\n2. Creating Post with Crop, Adjustments, and People Tags...');
  
  const postPayload = {
    caption: "Testing new editor features! 🎨✨",
    location: "Creative Studio",
    type: "post",
    hide_likes_count: false,
    turn_off_commenting: false,
    media: [
      {
        fileName: "test-image.jpg",
        type: "image",
        crop: {
          mode: "4:5",
          zoom: 1.2,
          x: 0.1,
          y: -0.05
        },
        filter: {
          name: "Vivid",
          css: "contrast(1.2) saturate(1.3)"
        },
        adjustments: {
          brightness: 0.1,
          contrast: 0.2,
          saturation: 0.1,
          temperature: -0.1,
          fade: 0.05,
          vignette: 0.3
        }
      }
    ],
    people_tags: [
      {
        // We'll tag the user themselves for simplicity since we have their ID from auth if needed, 
        // but the schema just needs an ID. We'll use a placeholder or the user's own ID if returned.
        user_id: authResponse.data.user ? authResponse.data.user.id : "6615a9b2f2b3a12345678901", 
        username: "tagged_friend",
        x: 0.5,
        y: 0.5
      }
    ]
  };

  const createResponse = await request('POST', '/posts', postPayload, token);

  console.log('Create Post Status:', createResponse.status);
  
  if (createResponse.status === 201) {
    console.log('\n✅ Post Created Successfully!');
    const post = createResponse.data;
    
    // Verification
    console.log('\n--- Verification ---');
    
    // Check Crop
    const media = post.media[0];
    if (media.crop && media.crop.mode === '4:5' && media.crop.zoom === 1.2) {
      console.log('✅ Crop data saved correctly');
    } else {
      console.error('❌ Crop data mismatch:', media.crop);
    }

    // Check Filter
    if (media.filter && media.filter.name === 'Vivid' && media.filter.css === 'contrast(1.2) saturate(1.3)') {
      console.log('✅ Filter data saved correctly');
    } else {
      console.error('❌ Filter data mismatch:', media.filter);
    }

    // Check Adjustments
    if (media.adjustments && media.adjustments.vignette === 0.3) {
      console.log('✅ Adjustments saved correctly');
    } else {
      console.error('❌ Adjustments mismatch:', media.adjustments);
    }

    // Check People Tags
    if (post.people_tags && post.people_tags.length > 0 && post.people_tags[0].username === 'tagged_friend') {
      console.log('✅ People tags saved correctly');
    } else {
      console.error('❌ People tags mismatch:', post.people_tags);
    }

    console.log('\nFull Post Response Summary:');
    console.log(JSON.stringify({
      id: post._id,
      caption: post.caption,
      media_crop: post.media[0].crop,
      media_filter: post.media[0].filter,
      media_adjustments: post.media[0].adjustments,
      people_tags: post.people_tags
    }, null, 2));

  } else {
    console.error('❌ Failed to create post:', JSON.stringify(createResponse.data, null, 2));
  }
}

runTest();
