// Apple PushKit VoIP push — the only reliable way to make an iPhone ring for
// an incoming call when bsmart isn't in the foreground. This is DIFFERENT
// from a normal FCM/APNs notification: it needs its own certificate/key,
// its own topic (`<bundle-id>.voip`), and the `apns-push-type: voip` header.
//
// NOT WIRED YET. No APNS_* credentials exist in this project's .env, and the
// `apn` (or `apns2`) npm package isn't installed — this file intentionally
// lazy-requires it so the rest of the backend keeps working if it's never
// added. To activate: `npm install apn`, generate a VoIP Services certificate
// (or auth key) in the Apple Developer portal for this app's bundle id, and
// set the APNS_* env vars referenced below.

const APNS_KEY_PATH = process.env.APNS_KEY_PATH;     // path to the .p8 auth key
const APNS_KEY_ID = process.env.APNS_KEY_ID;
const APNS_TEAM_ID = process.env.APNS_TEAM_ID;
const APNS_VOIP_BUNDLE_ID = process.env.APNS_VOIP_BUNDLE_ID; // e.g. com.ruvees.bsmart.ios.voip

const isConfigured = () => !!(APNS_KEY_PATH && APNS_KEY_ID && APNS_TEAM_ID && APNS_VOIP_BUNDLE_ID);

let apnProvider = null;
const getProvider = () => {
  if (apnProvider) return apnProvider;
  if (!isConfigured()) return null;
  try {
    // eslint-disable-next-line global-require
    const apn = require('apn');
    apnProvider = new apn.Provider({
      token: { key: APNS_KEY_PATH, keyId: APNS_KEY_ID, teamId: APNS_TEAM_ID },
      production: process.env.NODE_ENV === 'production',
    });
    return apnProvider;
  } catch (err) {
    console.warn('[VoIP Push] "apn" package not installed — run `npm install apn` to enable iOS call ringing.');
    return null;
  }
};

// payload: { callId, callerId, callerName, callerAvatar, callType }
const sendVoipPush = async (voipToken, payload) => {
  const provider = getProvider();
  if (!provider || !voipToken) return;

  try {
    // eslint-disable-next-line global-require
    const apn = require('apn');
    const note = new apn.Notification();
    note.topic = `${APNS_VOIP_BUNDLE_ID}.voip`;
    note.pushType = 'voip';
    note.priority = 10;
    note.payload = payload;

    const result = await provider.send(note, voipToken);
    if (result.failed?.length) {
      console.error('[VoIP Push] Send failed:', result.failed[0].response);
    }
  } catch (err) {
    console.error('[VoIP Push] Error:', err.message);
  }
};

module.exports = { isConfigured, sendVoipPush };
