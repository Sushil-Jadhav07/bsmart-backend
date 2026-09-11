const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTerm, expandTerm, extractHashtags, extractTopics,
  detectLanguage, languageMatch, normalizeLanguage, parseAcceptLanguage,
} = require('../../src/feed/text');

test('normalizeTerm lowercases, strips # and characters unsafe as Mongo keys', () => {
  assert.equal(normalizeTerm('  #Node.JS  '), 'nodejs');
  assert.equal(normalizeTerm('Price$Drop'), 'pricedrop');
  assert.equal(normalizeTerm(null), '');
});

test('expandTerm splits multi-word categories', () => {
  assert.deepEqual(expandTerm('Sports & Fitness'), ['sports & fitness', 'sports', 'fitness']);
  assert.deepEqual(expandTerm('#cricket'), ['cricket']);
  assert.deepEqual(expandTerm(''), []);
});

test('extractHashtags handles unicode hashtags', () => {
  assert.deepEqual(extractHashtags('Go #India! #क्रिकेट and #ipl_2026'), ['india', 'क्रिकेट', 'ipl_2026']);
});

test('extractTopics combines hashtags, tags and ad categories', () => {
  const post = { caption: 'What a match #Cricket', tags: ['Travel', { name: 'Food' }] };
  assert.deepEqual(extractTopics(post, 'post').sort(), ['cricket', 'food', 'travel']);

  const tweet = { content: 'Weekend plans #roadtrip', quoteContent: '' };
  assert.deepEqual(extractTopics(tweet, 'tweet'), ['roadtrip']);

  const ad = { caption: '', category: 'Sports & Fitness', hashtags: ['#running'], tags: [] };
  const topics = extractTopics(ad, 'ad');
  for (const t of ['sports & fitness', 'sports', 'fitness', 'running']) assert.ok(topics.includes(t), t);
});

test('detectLanguage recognises Indic scripts, English and Hinglish', () => {
  assert.equal(detectLanguage('आज का मैच बहुत शानदार था'), 'hi');
  assert.equal(detectLanguage('இன்று நல்ல நாள்'), 'ta');
  assert.equal(detectLanguage('Today the match was really amazing'), 'en');
  assert.equal(detectLanguage('yaar ye match bahut accha tha bhai'), 'hi-Latn');
  assert.equal(detectLanguage('🔥🔥🔥'), null);
  // Hashtags and links do not count towards the language.
  assert.equal(detectLanguage('#travel https://example.com आज का दिन'), 'hi');
});

test('languageMatch scores exact, same-script, Hinglish and unknown cases', () => {
  assert.equal(languageMatch('hi', ['hi']), 1);
  assert.equal(languageMatch('mr', ['hi']), 0.9);
  assert.equal(languageMatch('hi-Latn', ['en']), 0.7);
  assert.equal(languageMatch('en', ['hi-Latn']), 0.7);
  assert.equal(languageMatch('ta', ['hi']), 0.1);
  assert.equal(languageMatch(null, ['hi']), 0.5);
  assert.equal(languageMatch('hi', []), 0.5);
});

test('normalizeLanguage and parseAcceptLanguage', () => {
  assert.equal(normalizeLanguage('Hindi'), 'hi');
  assert.equal(normalizeLanguage('hi-latn'), 'hi-Latn');
  assert.equal(normalizeLanguage('en-IN'), 'en');
  assert.equal(normalizeLanguage('12'), null);
  assert.equal(normalizeLanguage(''), null);
  assert.deepEqual(parseAcceptLanguage('en-IN,en;q=0.9,hi;q=0.8,*;q=0.1'), ['en', 'hi']);
  assert.deepEqual(parseAcceptLanguage('ta;q=0.5, hi'), ['hi', 'ta']);
  assert.deepEqual(parseAcceptLanguage(undefined), []);
});
