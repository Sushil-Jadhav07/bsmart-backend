// ─── Promotions: ads + promote reels ────────────────────────────────────────
// Ads carry targeting (geo, age, gender, language, interests, schedule) that
// is enforced here; promote reels have none and are ranked on relevance only.

const Ad = require('../models/Ad');
const PromoteReel = require('../models/PromoteReel');
const FeedEvent = require('../models/FeedEvent');
const { toCandidate } = require('./items');
const { scoreCandidate } = require('./scoring');
const { diversify } = require('./rerank');
const { normalizeLanguage } = require('./text');
const { norm } = require('./geo');
const { AUTHOR_SELECT, oids } = require('./candidates');
const { loadItemStats } = require('./stats');

// ─── Targeting (pure) ───────────────────────────────────────────────────────
const DEFAULT_AGE_RANGE = { min: 13, max: 65 };
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const geoTargets = (ad) => {
  const t = ad.targeting || {};
  return [
    ...(t.countries || []), ...(t.states || []), ...(t.cities || []),
    ...(ad.target_location || []), ...(ad.target_states || []),
  ].map(norm).filter(Boolean);
};

// true: viewer is inside the target area. false: viewer's location is known
// and outside it. null: the ad is untargeted or the viewer's location unknown.
const matchGeoTargeting = (ad, viewer) => {
  const targets = geoTargets(ad);
  if (!targets.length) return null;
  if (!viewer || !(viewer.city || viewer.state || viewer.country)) return null;
  return targets.some((t) => t === viewer.city || t === viewer.state || t === viewer.country);
};

// The schema defaults to 13–65, so an unchanged default means "no age targeting".
const matchAge = (ad, age) => {
  const min = ad.targeting?.age_min ?? DEFAULT_AGE_RANGE.min;
  const max = ad.targeting?.age_max ?? DEFAULT_AGE_RANGE.max;
  if (min === DEFAULT_AGE_RANGE.min && max === DEFAULT_AGE_RANGE.max) return true;
  if (!Number.isFinite(age) || age <= 0) return true;
  return age >= min && age <= max;
};

const matchGender = (ad, gender) => {
  const target = norm(ad.targeting?.gender || 'all');
  if (!target || target === 'all') return true;
  const viewer = norm(gender);
  return !viewer || viewer === target;
};

// Soft: language inference is heuristic, so a mismatch only lowers the score.
const languageFit = (ad, viewerLangs) => {
  const targets = (ad.target_language || []).map(normalizeLanguage).filter(Boolean);
  if (!targets.length || !viewerLangs?.length) return 1;
  const fits = targets.some((t) => viewerLangs.includes(t) || (t === 'hi' && viewerLangs.includes('hi-Latn')));
  return fits ? 1 : 0.5;
};

const toMinutes = (hhmm) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

// Ad.scheduling.delivery_time_slots, evaluated in the configured timezone.
const inDeliveryWindow = (ad, nowMs, tzOffsetMinutes) => {
  const slots = ad.scheduling?.delivery_time_slots || [];
  if (!slots.length) return true;
  const local = new Date(nowMs + tzOffsetMinutes * 60000);
  const day = DAYS[local.getUTCDay()];
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return slots.some((slot) => {
    if (slot.day_of_week && slot.day_of_week !== day) return false;
    const start = toMinutes(slot.start_time) ?? 0;
    const end = toMinutes(slot.end_time) ?? 24 * 60;
    return start <= end ? minutes >= start && minutes <= end : minutes >= start || minutes <= end;
  });
};

// 1 = budget left. An exhausted budget stops delivery only when the vendor
// opted in via auto_stop_on_budget_exhausted; otherwise the ad is down-ranked.
const budgetFactor = (ad, cfg) => {
  const total = Number(ad.total_budget_coins || 0);
  const spent = Number(ad.total_coins_spent || 0);
  if (total <= 0 || spent < total) return 1;
  return ad.budget?.auto_stop_on_budget_exhausted ? 0 : cfg.exhaustedBudgetFactor;
};

// ─── Ranking ────────────────────────────────────────────────────────────────
const rankPromotions = async (ctx, config, { limit, videoOnly = false } = {}) => {
  const now = Date.now();
  const nowDate = new Date(now);
  const cfg = config.promotions;
  const surfaceCfg = config.surfaces.promotions;
  const pool = config.candidates.promotionPoolLimit;

  const exclude = [...ctx.excludedAuthorIds];
  if (!surfaceCfg.includeOwn) exclude.push(ctx.userId);
  const authorFilter = exclude.length ? { user_id: { $nin: oids(exclude) } } : {};

  const [ads, promoteReels, impressions] = await Promise.all([
    surfaceCfg.sources.includes('ad')
      ? Ad.find({
        status: 'active',
        isDeleted: false,
        ...authorFilter,
        $and: [
          { $or: [{ 'budget.start_date': null }, { 'budget.start_date': { $lte: nowDate } }] },
          { $or: [{ 'budget.end_date': null }, { 'budget.end_date': { $gte: nowDate } }] },
        ],
      }).sort({ createdAt: -1 }).limit(pool).select('-likes -dislikes').populate('user_id', AUTHOR_SELECT).lean()
      : [],
    surfaceCfg.sources.includes('promote_reel')
      ? PromoteReel.find({ isDeleted: false, ...authorFilter })
        .sort({ createdAt: -1 }).limit(pool).select('-likes -latest_comments -people_tags')
        .populate('user_id', AUTHOR_SELECT).lean()
      : [],
    FeedEvent.aggregate([
      {
        $match: {
          user_id: ctx.userObjectId,
          event: 'impression',
          item_type: { $in: ['ad', 'promote_reel'] },
          createdAt: { $gte: new Date(now - 864e5) },
        },
      },
      { $group: { _id: '$item_id', n: { $sum: 1 } } },
    ]),
  ]);

  const capped = new Set(impressions.filter((i) => i.n >= cfg.frequencyCapPerDay).map((i) => String(i._id)));
  const blocked = (key) => capped.has(key) || ctx.hiddenSet.has(key) || ctx.reportedSet.has(key);

  const candidates = [];
  for (const ad of ads) {
    if (blocked(String(ad._id))) continue;
    if (!matchAge(ad, ctx.age) || !matchGender(ad, ctx.gender)) continue;
    if (!inDeliveryWindow(ad, now, cfg.timezoneOffsetMinutes)) continue;
    const geoMatch = matchGeoTargeting(ad, ctx.geo);
    if (geoMatch === false) continue;
    const budget = budgetFactor(ad, cfg);
    if (budget === 0) continue;
    const candidate = toCandidate(ad, 'ad', 'promotion');
    if (!candidate.authorActive || (videoOnly && !candidate.isVideo)) continue;
    candidate.fit = { geoMatch, budget, language: languageFit(ad, ctx.languages) };
    candidates.push(candidate);
  }
  for (const reel of promoteReels) {
    if (blocked(String(reel._id))) continue;
    const candidate = toCandidate(reel, 'promote_reel', 'promotion');
    if (!candidate.authorActive) continue;
    candidate.fit = { geoMatch: null, budget: 1, language: 1 };
    candidates.push(candidate);
  }

  const stats = await loadItemStats(candidates.map((c) => c.key));
  const scored = candidates.map((candidate) => {
    const result = scoreCandidate(candidate, ctx, surfaceCfg, config, stats.get(candidate.key), now);
    const { geoMatch, budget, language } = candidate.fit;
    let score = result.score;
    if (geoMatch === true) score += 0.5 * (surfaceCfg.weights.locale || 0); // inside the ad's target area
    score -= (1 - budget) + (1 - language);
    const reasons = geoMatch === true ? ['targeted', ...result.reasons] : result.reasons;
    return { ...candidate, ...result, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  return diversify(scored, { window: 4, maxPerAuthor: 1, maxPerTopic: 2, maxConsecutiveType: 2 }).slice(0, limit);
};

module.exports = {
  matchGeoTargeting,
  matchAge,
  matchGender,
  languageFit,
  inDeliveryWindow,
  budgetFactor,
  rankPromotions,
};
