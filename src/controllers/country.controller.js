const data = require('../data/countries_states_cities.json');

// ─── Pre-compute flat lists once at startup (fast, in-memory) ─────────────
const allCountries = data.map(({ name, isoCode, flag, phonecode, currency, latitude, longitude, timezones, languages }) => ({
  name, isoCode, flag, phonecode, currency, latitude, longitude, timezones, languages,
}));

const allStates = data.flatMap(({ name: countryName, isoCode: countryCode, states }) =>
  states.map(({ name, isoCode, languages, latitude, longitude }) => ({
    name, isoCode, countryCode, countryName, languages, latitude, longitude,
  }))
);

const allCities = data.flatMap(({ name: countryName, isoCode: countryCode, states }) =>
  states.flatMap(({ name: stateName, isoCode: stateCode, cities }) =>
    cities.map(({ name, latitude, longitude }) => ({
      name, stateName, stateCode, countryName, countryCode, latitude, longitude,
    }))
  )
);

const allLanguages = [...new Set(
  data.flatMap((c) => c.languages)
)].filter(Boolean).sort();
// ───────────────────────────────────────────────────────────────────────────

// GET /api/countries
const getAllCountries = (req, res) =>
  res.status(200).json({ success: true, count: allCountries.length, data: allCountries });

// GET /api/states
const getAllStates = (req, res) =>
  res.status(200).json({ success: true, count: allStates.length, data: allStates });

// GET /api/cities
const getAllCities = (req, res) =>
  res.status(200).json({ success: true, count: allCities.length, data: allCities });

// GET /api/languages
const getAllLanguages = (req, res) =>
  res.status(200).json({ success: true, count: allLanguages.length, data: allLanguages });

module.exports = { getAllCountries, getAllStates, getAllCities, getAllLanguages };