// ─── Text helpers: topics and language ──────────────────────────────────────
// Content in bSmart has no stored language or topic fields, so both are
// derived from captions, hashtags and tags at ranking time.
//
// \p{M} (combining marks) is part of every "word" pattern: Indic scripts write
// vowel signs as marks, so without it '#क्रिकेट' would be cut after one letter.

const HASHTAG_RE = /#([\p{L}\p{M}\p{N}_]{2,50})/gu;
const STOPWORDS = new Set(['and', 'the', 'for', 'with', 'all']);

// Lowercase, strip '#', collapse spaces. '.' and '$' are removed because the
// terms are stored as object keys in MongoDB.
const normalizeTerm = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/^#+/, '')
  .replace(/[.$]/g, '')
  .replace(/\s+/g, ' ')
  .slice(0, 60);

// 'Sports & Fitness' → ['sports & fitness', 'sports', 'fitness']
const expandTerm = (value) => {
  const term = normalizeTerm(value);
  if (!term) return [];
  const parts = term
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((part) => part.length > 2 && !STOPWORDS.has(part));
  return [...new Set([term, ...parts])];
};

const extractHashtags = (text) => {
  const tags = [];
  for (const match of String(text || '').matchAll(HASHTAG_RE)) tags.push(normalizeTerm(match[1]));
  return tags;
};

const tagValue = (tag) => {
  if (typeof tag === 'string') return tag;
  if (tag && typeof tag === 'object') return tag.name || tag.tag || tag.label || tag.value || '';
  return '';
};

const itemText = (item, type) => (type === 'tweet'
  ? `${item.content || ''} ${item.quoteContent || ''}`
  : `${item.caption || ''} ${item.ad_title || ''} ${item.ad_description || ''}`);

// Topic terms for any feed item (post, reel, tweet, ad, promote_reel).
const extractTopics = (item, type, limit = 20) => {
  if (!item) return [];
  const terms = [];
  const push = (value) => { for (const term of expandTerm(value)) terms.push(term); };

  extractHashtags(itemText(item, type)).forEach(push);
  (Array.isArray(item.tags) ? item.tags : []).forEach((tag) => push(tagValue(tag)));

  if (type === 'ad') {
    push(item.category);
    push(item.sub_category);
    [item.hashtags, item.keywords, item.targeting?.interests, item.target_preferences]
      .filter(Array.isArray)
      .forEach((list) => list.forEach(push));
  }

  return [...new Set(terms)].filter(Boolean).slice(0, limit);
};

// ─── Language detection ─────────────────────────────────────────────────────
// Script-based, so it is reliable for Indic scripts and deliberately coarse
// otherwise: all Latin text is 'en' unless it reads as romanised Hindi.
const SCRIPTS = [
  ['hi', /[ऀ-ॿ]/g], // Devanagari (Hindi, Marathi, Nepali)
  ['bn', /[ঀ-৿]/g],
  ['pa', /[਀-੿]/g],
  ['gu', /[઀-૿]/g],
  ['or', /[଀-୿]/g],
  ['ta', /[஀-௿]/g],
  ['te', /[ఀ-౿]/g],
  ['kn', /[ಀ-೿]/g],
  ['ml', /[ഀ-ൿ]/g],
  ['ur', /[؀-ۿ]/g], // Arabic script
  ['en', /[A-Za-z]/g],
];

const HINGLISH_WORDS = new Set([
  'hai', 'hain', 'nahi', 'nahin', 'kya', 'kyu', 'kyun', 'bhai', 'yaar', 'mera', 'meri',
  'tera', 'teri', 'tum', 'aap', 'kaise', 'kaisa', 'accha', 'acha', 'bahut', 'bohot',
  'kuch', 'haan', 'matlab', 'abhi', 'wala', 'wali', 'bhi', 'toh', 'hoga', 'raha',
  'rahi', 'karo', 'karna', 'dekho', 'chalo', 'humara', 'hamara', 'apna', 'sabse',
]);

const detectLanguage = (text) => {
  const clean = String(text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#@][\p{L}\p{M}\p{N}_]+/gu, ' ');

  let best = null;
  let bestCount = 0;
  for (const [code, re] of SCRIPTS) {
    const count = (clean.match(re) || []).length;
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  if (bestCount < 3) return null;

  if (best === 'en') {
    const words = clean.toLowerCase().match(/[a-z]+/g) || [];
    const hits = words.filter((word) => HINGLISH_WORDS.has(word)).length;
    if (hits >= 2 && hits / words.length >= 0.15) return 'hi-Latn';
  }
  return best;
};

// Languages sharing a script are treated as a near match.
const SCRIPT_GROUPS = { hi: 'deva', mr: 'deva', ne: 'deva', sa: 'deva', ur: 'arab', ar: 'arab', fa: 'arab' };
const scriptGroup = (code) => SCRIPT_GROUPS[code] || code;

// 1 = same language, 0.9 = same script, 0.7 = Hinglish vs Hindi/English,
// 0.5 = unknown on either side, 0.1 = mismatch.
const languageMatch = (itemLang, viewerLangs) => {
  if (!itemLang || !Array.isArray(viewerLangs) || !viewerLangs.length) return 0.5;
  if (viewerLangs.includes(itemLang)) return 1;
  const group = scriptGroup(itemLang);
  if (viewerLangs.some((lang) => scriptGroup(lang) === group)) return 0.9;
  const hindiOrEnglish = (lang) => lang === 'en' || scriptGroup(lang) === 'deva';
  if (itemLang === 'hi-Latn' && viewerLangs.some(hindiOrEnglish)) return 0.7;
  if (viewerLangs.includes('hi-Latn') && hindiOrEnglish(itemLang)) return 0.7;
  return 0.1;
};

const LANGUAGE_CODE_RE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?$/;

const LANGUAGE_NAMES = {
  english: 'en', hindi: 'hi', marathi: 'mr', bengali: 'bn', bangla: 'bn', punjabi: 'pa',
  gujarati: 'gu', odia: 'or', oriya: 'or', tamil: 'ta', telugu: 'te', kannada: 'kn',
  malayalam: 'ml', urdu: 'ur', arabic: 'ar', nepali: 'ne', hinglish: 'hi-Latn',
};

// Accepts 'hi', 'hi-Latn', 'Hindi', 'en-IN' … and returns a code or null.
const normalizeLanguage = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const named = LANGUAGE_NAMES[raw.toLowerCase()];
  if (named) return named;
  if (/^hi-latn$/i.test(raw)) return 'hi-Latn';
  const primary = raw.split(/[-_]/)[0].toLowerCase();
  return LANGUAGE_CODE_RE.test(primary) ? primary : null;
};

// 'en-IN,en;q=0.9,hi;q=0.8' → ['en', 'hi']
const parseAcceptLanguage = (header, max = 3) => {
  if (!header) return [];
  const entries = String(header)
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { code: normalizeLanguage(tag), q: q ? Number(q.split('=')[1]) : 1 };
    })
    .filter((entry) => entry.code && Number.isFinite(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  return [...new Set(entries.map((entry) => entry.code))].slice(0, max);
};

module.exports = {
  itemText,
  normalizeTerm,
  expandTerm,
  extractHashtags,
  extractTopics,
  detectLanguage,
  languageMatch,
  normalizeLanguage,
  parseAcceptLanguage,
  LANGUAGE_CODE_RE,
};
