// ─── Server-side feed signals ───────────────────────────────────────────────
// The existing APIs (likes, comments, saves, reposts, reel and ad views, ad
// clicks …) call trackFeedEvent, so the feed learns from them immediately and
// keeps a training log without depending on the app to report them.
//
// Fire-and-forget: events are queued in memory and written in one batch per
// user about once a second, so it never throws into, or slows down, the API
// that called it. Events still queued when the process exits are lost.
// Admins can switch tracking off with events.serverTracking.

const { getFeedConfig } = require('./settings');
const { validateEvents, recordEvents } = require('./events');

const FLUSH_INTERVAL_MS = 1000;
const MAX_QUEUE_PER_USER = 25;

const queues = new Map(); // userId → events[]
let timer = null;

const flushUser = async (userId) => {
  const events = queues.get(userId);
  queues.delete(userId);
  if (!events?.length) return;
  try {
    const config = await getFeedConfig();
    if (!config.events.serverTracking) return;
    const { learning } = await recordEvents(userId, events, config, { source: 'server' });
    await learning;
  } catch (err) {
    console.error('[Feed] Server event flush failed:', err.message);
  }
};

// Writes everything queued so far. Also used by tests.
const flushFeedTracking = () => Promise.all([...queues.keys()].map(flushUser));

const scheduleFlush = () => {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flushFeedTracking();
  }, FLUSH_INTERVAL_MS);
  timer.unref?.();
};

// trackFeedEvent(req.userId, { itemId, itemType: 'post', event: 'like' })
// `undo: true` reverses an earlier event (unlike, unsave, un-repost).
const trackFeedEvent = (userId, { itemId, itemType, event, undo = false, watchMs, completionPct } = {}) => {
  try {
    if (!userId || !itemId) return;
    const { valid } = validateEvents([{
      item_id: String(itemId),
      item_type: itemType,
      event,
      watch_ms: watchMs,
      completion_pct: completionPct,
    }], { source: 'server' });
    if (!valid.length) return;

    const key = String(userId);
    const queue = queues.get(key) || [];
    queue.push({ ...valid[0], undo: Boolean(undo) });
    queues.set(key, queue);
    if (queue.length >= MAX_QUEUE_PER_USER) flushUser(key);
    else scheduleFlush();
  } catch (err) {
    console.error(`[Feed] trackFeedEvent(${event}) failed:`, err.message);
  }
};

module.exports = { trackFeedEvent, flushFeedTracking };
