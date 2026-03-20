const structuredCountries = require('../data/countries_data.json');

// ─── Pre-compute flat lists once at startup ───────────────────────────────

const allCountriesFlat = structuredCountries.map(
  ({ country: name, flag, phonecode, currency, languages }) => ({
    name, flag, phonecode, currency, languages,
  })
);

const allStatesFlat = structuredCountries.flatMap(({ country: countryName, states }) =>
  states.map(({ state: name, languages }) => ({
    name, countryName, languages,
  }))
);

const allCitiesFlat = structuredCountries.flatMap(({ country: countryName, states }) =>
  states.flatMap(({ state: stateName, cities }) =>
    cities.map((name) => ({ name, stateName, countryName }))
  )
);

const allLanguages = [...new Set(
  structuredCountries.flatMap((c) => c.languages)
)].filter(Boolean).sort();

// ─── Helpers ──────────────────────────────────────────────────────────────

const findCountry = (name) =>
  structuredCountries.find(
    (c) => c.country.toLowerCase() === name.toLowerCase()
  );

// ─── Controllers ──────────────────────────────────────────────────────────

/** GET /api/countries — flat list */
const getAllCountries = (req, res) =>
  res.status(200).json({ success: true, count: allCountriesFlat.length, data: allCountriesFlat });

/** GET /api/states — flat list */
const getAllStates = (req, res) =>
  res.status(200).json({ success: true, count: allStatesFlat.length, data: allStatesFlat });

/** GET /api/cities — flat list */
const getAllCities = (req, res) =>
  res.status(200).json({ success: true, count: allCitiesFlat.length, data: allCitiesFlat });

/** GET /api/languages — all unique languages sorted A-Z */
const getAllLanguages = (req, res) =>
  res.status(200).json({ success: true, count: allLanguages.length, data: allLanguages });

/** GET /api/countries/all — all countries nested */
const getAllCountriesStructured = (req, res) =>
  res.status(200).json({ success: true, count: structuredCountries.length, data: structuredCountries });

/** GET /api/countries/:country — single country e.g. /api/countries/India */
const getCountryByName = (req, res) => {
  const country = findCountry(req.params.country);
  if (!country) return res.status(404).json({ success: false, message: 'Country not found' });
  return res.status(200).json({ success: true, data: country });
};

/** GET /api/countries/:country/states */
const getStatesByCountry = (req, res) => {
  const country = findCountry(req.params.country);
  if (!country) return res.status(404).json({ success: false, message: 'Country not found' });
  return res.status(200).json({
    success: true,
    country: country.country,
    count: country.states.length,
    data: country.states,
  });
};

/** GET /api/countries/:country/states/:state/cities */
const getCitiesByState = (req, res) => {
  const country = findCountry(req.params.country);
  if (!country) return res.status(404).json({ success: false, message: 'Country not found' });
  const state = country.states.find(
    (s) => s.state.toLowerCase() === req.params.state.toLowerCase()
  );
  if (!state) return res.status(404).json({ success: false, message: 'State not found' });
  return res.status(200).json({
    success: true,
    country: country.country,
    state: state.state,
    count: state.cities.length,
    data: state.cities,
  });
};

/** GET /api/countries/:country/languages */
const getLanguagesByCountry = (req, res) => {
  const country = findCountry(req.params.country);
  if (!country) return res.status(404).json({ success: false, message: 'Country not found' });
  return res.status(200).json({
    success: true,
    country: country.country,
    count: country.languages.length,
    data: country.languages,
  });
};

module.exports = {
  getAllCountries, getAllStates, getAllCities, getAllLanguages,
  getAllCountriesStructured, getCountryByName, getStatesByCountry,
  getCitiesByState, getLanguagesByCountry,
};