const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const credentialCandidates = [
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  path.join(__dirname, '../../serviceAccountKey.json'),
  path.join(__dirname, '../../bsmart-930c6-firebase-adminsdk-fbsvc-7a10d84b8b.json'),
].filter(Boolean);

const resolveCredentialPath = () => (
  credentialCandidates.find((filePath) => fs.existsSync(path.resolve(filePath)))
);

const parseInlineServiceAccount = () => {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
};

const initializeFirebase = () => {
  if (admin.apps.length) return admin;

  const inlineServiceAccount = parseInlineServiceAccount();
  if (inlineServiceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(inlineServiceAccount),
    });
    return admin;
  }

  const credentialPath = resolveCredentialPath();
  if (credentialPath) {
    const serviceAccount = require(path.resolve(credentialPath));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    return admin;
  }

  console.warn('[FCM] Firebase service account not configured; direct FCM disabled.');
  return null;
};

const firebaseAdmin = initializeFirebase();

if (firebaseAdmin) {
  module.exports = firebaseAdmin;
} else {
  module.exports = null;
}
