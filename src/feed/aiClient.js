// ─── AI service client ──────────────────────────────────────────────────────
// Talks to the Python AI service (ai-service/). It is optional: without
// AI_SERVICE_URL every call returns null and the feed ranks exactly as before.
// Each call has a short timeout, and after repeated failures the client stops
// calling for 30 seconds, so a slow or stopped service never slows the feed.

const FAILURES_BEFORE_PAUSE = 3;
const PAUSE_MS = 30 * 1000;
const MAX_EXCLUDED_AUTHORS = 5000; // the service's limit; the feed re-filters anyway

let failures = 0;
let pausedUntil = 0;

const baseUrl = () => String(process.env.AI_SERVICE_URL || '').trim().replace(/\/+$/, '');
const aiServiceConfigured = () => Boolean(baseUrl());

const post = async (path, body, timeoutMs) => {
  const base = baseUrl();
  if (!base || Date.now() < pausedUntil) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AI-Token': process.env.AI_SERVICE_TOKEN || '' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    failures = 0;
    return data;
  } catch (err) {
    failures += 1;
    if (failures >= FAILURES_BEFORE_PAUSE) {
      failures = 0;
      pausedUntil = Date.now() + PAUSE_MS;
      console.warn(`[Feed] AI service unavailable (${err.message}); skipping it for ${PAUSE_MS / 1000}s`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// Items closest to the user's taste: [{ item_id, item_type, score }].
const fetchSimilarItems = async (userId, { k, types, excludeAuthorIds = [], sinceDays, timeoutMs }) => {
  const data = await post('/v1/candidates', {
    user_id: String(userId),
    k,
    types,
    exclude_author_ids: excludeAuthorIds.slice(0, MAX_EXCLUDED_AUTHORS).map(String),
    since_days: sinceDays,
  }, timeoutMs);
  return Array.isArray(data?.items) ? data.items : [];
};

// Map of itemId → similarity to the user's taste, or null when there is none
// (service off, or a user with no history yet).
const fetchSemanticScores = async (userId, itemIds, timeoutMs) => {
  if (!itemIds.length) return null;
  const data = await post('/v1/score', { user_id: String(userId), item_ids: itemIds.slice(0, 2000) }, timeoutMs);
  if (!data?.has_profile) return null;
  return new Map(Object.entries(data.scores || {}).map(([id, score]) => [id, Number(score)]));
};

// For tests.
const resetAiClient = () => {
  failures = 0;
  pausedUntil = 0;
};

module.exports = { aiServiceConfigured, fetchSimilarItems, fetchSemanticScores, resetAiClient };
