// ─── Text helpers: topics and language ──────────────────────────────────────
// Content in bSmart has no stored language or topic fields, so both are
// derived from captions, hashtags and tags at ranking time.
//
// \p{M} (combining marks) is part of every "word" pattern: Indic scripts write
// vowel signs as marks, so without it '#क्रिकेट' would be cut after one letter.

const { loadModule } = require('cld3-asm');

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
// Cheapest signal first:
//   1. Script (Unicode ranges) — enough for Tamil, Bengali, Telugu, Urdu …
//   2. Devanagari → Google's CLD3 model decides Hindi / Marathi / Nepali,
//      which share a script.
//   3. Latin → Hinglish (romanised Hindi) when it has enough Hindi function
//      words or CLD3 says hi-Latn; otherwise English.
// CLD3 (cld3-asm, WebAssembly) loads asynchronously at startup. Until it is
// ready, or if it fails to load, Devanagari falls back to 'hi'.

let cld = null;
const languageModelReady = loadModule()
  .then((factory) => { cld = factory.create(0, 1000); })
  .catch((err) => console.error('[Feed] CLD3 language model failed to load, using script detection only:', err.message));

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

const DEVANAGARI_LANGUAGES = new Set(['hi', 'mr', 'ne']);

// Frequent romanised-Hindi function words. Words that are also common in
// English ('to', 'hi', 'me', 'main', 'the', 'do', 'ho') are left out.
const HINGLISH_WORDS = new Set([
  'hai', 'hain', 'tha', 'thi', 'hoga', 'hogi', 'honge', 'hua', 'hui', 'hue', 'hota', 'hoti', 'hote',
  'ka', 'ki', 'ke', 'ko', 'se', 'mein', 'mai', 'aur', 'nahi', 'nahin', 'nhi', 'mat',
  'kya', 'kyu', 'kyun', 'kyon', 'kaise', 'kaisa', 'kaisi', 'kab', 'kahan', 'kaha', 'kaun',
  'yeh', 'ye', 'woh', 'wo', 'vo', 'hum', 'tum', 'aap', 'mujhe', 'tujhe', 'humein', 'unhe',
  'mera', 'meri', 'mere', 'tera', 'teri', 'tere', 'apna', 'apni', 'apne',
  'hamara', 'hamari', 'hamare', 'humara', 'tumhara', 'tumhari', 'uska', 'uski', 'uske',
  'unka', 'unki', 'iska', 'iski', 'kuch', 'sab', 'sabko', 'sabhi', 'bahut', 'bohot', 'bahot',
  'bhi', 'toh', 'raha', 'rahi', 'rahe', 'gaya', 'gayi', 'gaye', 'kar', 'karo', 'karna', 'karke',
  'kiya', 'kiye', 'diya', 'liya', 'lena', 'dena', 'dekho', 'dekha', 'dekhna', 'chalo',
  'accha', 'acha', 'achha', 'theek', 'thik', 'yaar', 'bhai', 'abhi', 'aaj', 'kal', 'phir', 'fir',
  'wala', 'wali', 'wale', 'jab', 'tab', 'agar', 'lekin', 'magar', 'sirf', 'zyada', 'jyada',
  'naya', 'nayi', 'naye', 'sach', 'pyaar', 'pyar', 'dost', 'dosto', 'doston', 'ghar', 'khana',
  'bas', 'ek', 'sakta', 'sakti', 'chahiye', 'matlab', 'haan', 'bilkul', 'zaroor', 'jaldi',
  'pehle', 'baad', 'saath', 'liye', 'pata', 'aao', 'jao', 'rakhna', 'maza', 'mazaa',
]);

// Captions are ranked on every feed request, so results are memoised.
const MEMO_MAX = 50000;
const memo = new Map();

const scriptOf = (text) => {
  let best = null;
  let bestCount = 0;
  for (const [code, re] of SCRIPTS) {
    const count = (text.match(re) || []).length;
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return bestCount >= 3 ? best : null;
};

const classify = (clean) => {
  const script = scriptOf(clean);
  if (script === 'hi') {
    const guess = cld ? cld.findLanguage(clean).language : null;
    return DEVANAGARI_LANGUAGES.has(guess) ? guess : 'hi';
  }
  if (script === 'en') {
    const words = clean.toLowerCase().match(/[a-z]+/g) || [];
    const hits = words.filter((word) => HINGLISH_WORDS.has(word)).length;
    if (hits >= 2 && hits / words.length >= 0.2) return 'hi-Latn';
    if (cld && cld.findLanguage(clean).language === 'hi-Latn') return 'hi-Latn';
    return 'en';
  }
  return script;
};

const detectLanguage = (text) => {
  const clean = String(text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#@][\p{L}\p{M}\p{N}_]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  if (!clean) return null;

  const cached = memo.get(clean);
  if (cached !== undefined) return cached;

  const language = classify(clean);
  // Only cache once the model is ready, so early guesses are not kept forever.
  if (cld) {
    if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value);
    memo.set(clean, language);
  }
  return language;
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
  languageModelReady,
  languageMatch,
  normalizeLanguage,
  parseAcceptLanguage,
  LANGUAGE_CODE_RE,
};
