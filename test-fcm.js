const admin = require('./src/lib/firebase');

if (!admin) {
  throw new Error('Firebase service account is not configured');
}

admin.messaging().send({
  token: 'cbvMFdl9SBm3fXoN3ueu8s:APA91bGqYeVcJwZR86dzmzNuAuNQQ2QVDczImOeqG4Bm7a-Y9caFpidVz_uKW0PRnD-Z2DSVG351-4pQpodxuMm980diXgx59U9zMN52E88wSEGNbBqwO-c',
  notification: {
    title: 'Test from backend',
    body: 'FCM is working!',
  },
  android: {
    notification: { channel_id: 'bsmart_channel' },
  },
  data: { type: 'test', link: '' },
}).then((response) => {
  console.log('Success:', response);
}).catch((error) => {
  console.error('Failed:', error);
  process.exitCode = 1;
});
