// Cloudflare Realtime SFU — thin wrapper around the Calls HTTPS API
// (https://developers.cloudflare.com/realtime/sfu/https-api/). Verified live
// against the real API — see createSession()/closeSession() usage in
// call.controller.js for the 1:1 audio call flow.
//
// Model: each call participant gets their OWN session and PUSHes their
// local track(s) to it — one ('audio') for a voice call, two ('audio' +
// 'video') for a video call, both carried by the same SDP offer/session. To
// hear/see the other side, a participant PULLs the peer's tracks by
// referencing the peer's session_id + track names (stored on CallLog by
// call.controller.js once each side has published). A pull can require an
// immediate renegotiation (new offer from Cloudflare that the client must
// answer) — callers of pullTrack must check `requiresImmediateRenegotiation`
// and, if true, answer it via renegotiate().

const APP_ID = process.env.CLOUDFLARE_REALTIME_APP_ID;
const APP_TOKEN = process.env.CLOUDFLARE_REALTIME_APP_TOKEN;
const BASE_URL = 'https://rtc.live.cloudflare.com/v1';

const isConfigured = () => !!(APP_ID && APP_TOKEN);

if (!isConfigured()) {
  console.warn('[CloudflareRealtime] CLOUDFLARE_REALTIME_APP_ID/APP_TOKEN not set — call media sessions disabled.');
}

const call = async (path, options = {}) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${APP_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errorCode) {
    const msg = data.errorDescription || data.errorCode || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
};

// Creates an empty session for one call participant. Returns the session id,
// or null if Cloudflare Realtime isn't configured. Throws on failure so the
// caller can surface the real reason (wrangler tail doesn't show in-process
// console output for this Workers+Containers setup, so swallowing the error
// here means it's invisible everywhere).
const createSession = async () => {
  if (!isConfigured()) return null;
  const data = await call(`/apps/${APP_ID}/sessions/new`, { method: 'POST' });
  return data.sessionId || null;
};

// Pushes this participant's local track(s) (from their WebRTC offer) to
// their session. `tracks` is an array of `{ mid, trackName }` — `mid` is
// the m-line id of that track in `sdpOffer` (the browser assigns this —
// pass it through as-is), `trackName` is 'audio' or 'video'. A voice call
// passes one entry, a video call passes two — both m-lines are already in
// the same offer, so they're pushed in a single request. Returns the SDP
// answer to set as the local RTCPeerConnection's remote description, or
// null on failure.
const pushTrack = async (sessionId, sdpOffer, tracks) => {
  if (!isConfigured() || !sessionId || !Array.isArray(tracks) || !tracks.length) return null;
  try {
    const data = await call(`/apps/${APP_ID}/sessions/${sessionId}/tracks/new`, {
      method: 'POST',
      body: JSON.stringify({
        sessionDescription: { type: 'offer', sdp: sdpOffer },
        tracks: tracks.map(({ mid, trackName }) => ({ location: 'local', mid, trackName })),
      }),
    });
    return data.sessionDescription?.sdp || null;
  } catch (err) {
    console.error('[CloudflareRealtime] pushTrack error:', err.message);
    return null;
  }
};

// Pulls the peer's published track(s) into this participant's session.
// `remoteTrackNames` is an array (e.g. ['audio'] or ['audio', 'video']) —
// all of the peer's tracks are pulled in one request/renegotiation. Returns
// { requiresImmediateRenegotiation, sdpOffer } — if
// requiresImmediateRenegotiation is true, sdpOffer is the new offer the
// client must answer and send back via renegotiate(). Returns null on
// failure.
const pullTrack = async (sessionId, remoteSessionId, remoteTrackNames) => {
  if (!isConfigured() || !sessionId || !remoteSessionId || !Array.isArray(remoteTrackNames) || !remoteTrackNames.length) return null;
  try {
    const data = await call(`/apps/${APP_ID}/sessions/${sessionId}/tracks/new`, {
      method: 'POST',
      body: JSON.stringify({
        tracks: remoteTrackNames.map((trackName) => ({ location: 'remote', sessionId: remoteSessionId, trackName })),
      }),
    });
    return {
      requiresImmediateRenegotiation: !!data.requiresImmediateRenegotiation,
      sdpOffer: data.sessionDescription?.sdp || null,
    };
  } catch (err) {
    console.error('[CloudflareRealtime] pullTrack error:', err.message);
    return null;
  }
};

// Answers a renegotiation offer Cloudflare sent back from pullTrack().
const renegotiate = async (sessionId, sdpAnswer) => {
  if (!isConfigured() || !sessionId) return false;
  try {
    await call(`/apps/${APP_ID}/sessions/${sessionId}/renegotiate`, {
      method: 'PUT',
      body: JSON.stringify({ sessionDescription: { type: 'answer', sdp: sdpAnswer } }),
    });
    return true;
  } catch (err) {
    console.error('[CloudflareRealtime] renegotiate error:', err.message);
    return false;
  }
};

// Closes a session when a call ends, so it's not left running. `tracks` is
// the same `{ mid, name }` array stored on CallLog — every published track
// (audio, and video if this was a video call) is closed in one request.
// Non-fatal if it fails — the session will time out on Cloudflare's side
// regardless. NOTE: Cloudflare's HTTPS API has no documented "close
// session" endpoint — only `tracks/close` for individual tracks. Closing
// every published track is the closest equivalent and is enough to stop
// the media relay.
const closeSession = async (sessionId, tracks) => {
  if (!isConfigured() || !sessionId || !Array.isArray(tracks) || !tracks.length) return;
  try {
    await call(`/apps/${APP_ID}/sessions/${sessionId}/tracks/close`, {
      method: 'PUT',
      body: JSON.stringify({ tracks: tracks.map(({ mid, name }) => ({ mid, trackName: name })) }),
    });
  } catch (err) {
    console.error('[CloudflareRealtime] closeSession error:', err.message);
  }
};

module.exports = { isConfigured, createSession, pushTrack, pullTrack, renegotiate, closeSession };
