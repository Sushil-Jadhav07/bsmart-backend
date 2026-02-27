const fetch = global.fetch;

const API_URL = 'http://localhost:5000/api';
const credentials = {
  email: "bsmart@gmail.com",
  password: "Bsmart@123"
};

const adData = {
  caption: "Test Ad Integration",
  location: "New York, USA",
  category: "Electronics",
  coins_reward: 10,
  total_budget_coins: 100,
  media: [
    {
      fileName: "test_video.mp4",
      media_type: "video",
      fileUrl: "http://example.com/test_video.mp4",
      video_meta: {
        original_length_seconds: 60,
        selected_start: 0,
        selected_end: 30,
        final_duration: 30,
        thumbnail_time: 15
      },
      image_editing: {
        filter: { name: "Original", css: "" },
        adjustments: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, fade: 0, vignette: 0 }
      },
      crop_settings: {
        mode: "original",
        aspect_ratio: "16:9",
        zoom: 1,
        x: 0,
        y: 0
      },
      timing_window: { start: 0, end: 30 },
      thumbnails: [
        { fileName: "thumb.jpg", media_type: "image", fileUrl: "http://example.com/thumb.jpg" }
      ]
    }
  ],
  hashtags: ["#test", "#ad"],
  tagged_users: [],
  engagement_controls: {
    hide_likes_count: false,
    disable_comments: false
  },
  content_type: "reel",
  tags: ["electronics", "sale"],
  target_language: "en",
  target_location: "USA",
  product: {
    product_id: "prod_123",
    title: "Awesome Gadget",
    description: "Best gadget ever",
    price: 99.99,
    link: "http://example.com/product"
  }
};

async function runTest() {
  try {
    console.log('--- STARTING AD INTEGRATION TEST ---');

    // 1. Login
    console.log('1. Logging in...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    if (!loginRes.ok) {
      const err = await loginRes.json();
      throw new Error(`Login failed: ${err.message}`);
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('   Login successful. Token obtained.');

    // 2. Create Ad
    console.log('2. Creating Ad...');
    const adRes = await fetch(`${API_URL}/ads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(adData)
    });

    const adResponseData = await adRes.json();

    if (!adRes.ok) {
      throw new Error(`Ad creation failed: ${adResponseData.message}`);
    }

    console.log('   Ad Created Successfully!');
    console.log('   Ad ID:', adResponseData._id);
    console.log('   Status:', adResponseData.status);
    console.log('   Product Title:', adResponseData.product?.title);

    console.log('--- TEST COMPLETED SUCCESSFULLY ---');

  } catch (error) {
    console.error('--- TEST FAILED ---');
    console.error(error.message);
  }
}

if (require.main === module) {
  runTest();
}
