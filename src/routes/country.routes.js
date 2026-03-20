const express = require('express');
const router  = express.Router();
const {
  getAllCountries,
  getAllStates,
  getAllCities,
  getAllLanguages,
  getAllCountriesStructured,
  getCountryByName,
  getStatesByCountry,
  getCitiesByState,
  getLanguagesByCountry,
} = require('../controllers/country.controller');

/**
 * @swagger
 * tags:
 *   name: Countries
 *   description: Country, State, City and Language data endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     StateNested:
 *       type: object
 *       properties:
 *         state:
 *           type: string
 *           example: "Maharashtra"
 *         languages:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Marathi", "Hindi", "English"]
 *         cities:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Mumbai", "Pune", "Nagpur"]
 *
 *     CountryNested:
 *       type: object
 *       properties:
 *         country:
 *           type: string
 *           example: "India"
 *         flag:
 *           type: string
 *           example: "🇮🇳"
 *         phonecode:
 *           type: string
 *           example: "91"
 *         currency:
 *           type: string
 *           example: "INR"
 *         languages:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Hindi", "English"]
 *         states:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/StateNested'
 *
 *     CountryFlat:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: "India"
 *         flag:
 *           type: string
 *           example: "🇮🇳"
 *         phonecode:
 *           type: string
 *           example: "91"
 *         currency:
 *           type: string
 *           example: "INR"
 *         languages:
 *           type: array
 *           items:
 *             type: string
 *
 *     StateFlat:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: "Maharashtra"
 *         countryName:
 *           type: string
 *           example: "India"
 *         languages:
 *           type: array
 *           items:
 *             type: string
 *
 *     CityFlat:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: "Mumbai"
 *         stateName:
 *           type: string
 *           example: "Maharashtra"
 *         countryName:
 *           type: string
 *           example: "India"
 */

// ─── NEW: Structured / Nested Endpoints ───────────────────────────────────

/**
 * @swagger
 * /api/countries/all:
 *   get:
 *     summary: Get all countries with nested states, cities and languages
 *     description: Returns every country with full nested structure — country → states → cities + languages at each level.
 *     tags: [Countries]
 *     security: []
 *     responses:
 *       200:
 *         description: All countries nested
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 250
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CountryNested'
 *             example:
 *               success: true
 *               count: 250
 *               data:
 *                 - country: "India"
 *                   flag: "🇮🇳"
 *                   phonecode: "91"
 *                   currency: "INR"
 *                   languages: ["Hindi", "English"]
 *                   states:
 *                     - state: "Maharashtra"
 *                       languages: ["Marathi", "Hindi", "English"]
 *                       cities: ["Mumbai", "Pune", "Nagpur"]
 */
router.get('/all', getAllCountriesStructured);

/**
 * @swagger
 * /api/countries/{country}:
 *   get:
 *     summary: Get a single country by name with nested states and cities
 *     tags: [Countries]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: country
 *         required: true
 *         schema:
 *           type: string
 *         description: Country name (case-insensitive)
 *         example: India
 *     responses:
 *       200:
 *         description: Country with nested states and cities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CountryNested'
 *             example:
 *               success: true
 *               data:
 *                 country: "India"
 *                 flag: "🇮🇳"
 *                 phonecode: "91"
 *                 currency: "INR"
 *                 languages: ["Hindi", "English"]
 *                 states:
 *                   - state: "Maharashtra"
 *                     languages: ["Marathi", "Hindi", "English"]
 *                     cities: ["Mumbai", "Pune", "Nagpur"]
 *       404:
 *         description: Country not found
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Country not found"
 */
router.get('/:country', getCountryByName);

/**
 * @swagger
 * /api/countries/{country}/states:
 *   get:
 *     summary: Get all states of a country with their cities and languages
 *     tags: [Countries]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: country
 *         required: true
 *         schema:
 *           type: string
 *         description: Country name (case-insensitive)
 *         example: India
 *     responses:
 *       200:
 *         description: States with cities and languages
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               country: "India"
 *               count: 36
 *               data:
 *                 - state: "Maharashtra"
 *                   languages: ["Marathi", "Hindi", "English"]
 *                   cities: ["Mumbai", "Pune", "Nagpur"]
 *       404:
 *         description: Country not found
 */
router.get('/:country/states', getStatesByCountry);

/**
 * @swagger
 * /api/countries/{country}/states/{state}/cities:
 *   get:
 *     summary: Get all cities of a specific state
 *     tags: [Countries]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: country
 *         required: true
 *         schema:
 *           type: string
 *         example: India
 *       - in: path
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *         description: State name (case-insensitive)
 *         example: Maharashtra
 *     responses:
 *       200:
 *         description: List of city names
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               country: "India"
 *               state: "Maharashtra"
 *               count: 534
 *               data: ["Mumbai", "Pune", "Nagpur", "Aurangabad"]
 *       404:
 *         description: Country or State not found
 */
router.get('/:country/states/:state/cities', getCitiesByState);

/**
 * @swagger
 * /api/countries/{country}/languages:
 *   get:
 *     summary: Get languages spoken in a specific country
 *     tags: [Countries]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: country
 *         required: true
 *         schema:
 *           type: string
 *         example: India
 *     responses:
 *       200:
 *         description: List of language names
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               country: "India"
 *               count: 2
 *               data: ["Hindi", "English"]
 *       404:
 *         description: Country not found
 */
router.get('/:country/languages', getLanguagesByCountry);

// ─── Original Flat Endpoints (backward compatible) ────────────────────────

/**
 * @swagger
 * /api/countries:
 *   get:
 *     summary: Get all countries — flat list (250 countries)
 *     tags: [Countries]
 *     security: []
 *     responses:
 *       200:
 *         description: Flat list of all countries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                   example: 250
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CountryFlat'
 */
router.get('/', getAllCountries);

/**
 * @swagger
 * /api/states:
 *   get:
 *     summary: Get all states — flat list (4963 states)
 *     tags: [Countries]
 *     security: []
 *     responses:
 *       200:
 *         description: Flat list of all states
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                   example: 4963
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/StateFlat'
 */
router.get('/states', getAllStates);

/**
 * @swagger
 * /api/cities:
 *   get:
 *     summary: Get all cities — flat list (148,038 cities)
 *     tags: [Countries]
 *     security: []
 *     responses:
 *       200:
 *         description: Flat list of all cities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                   example: 148038
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CityFlat'
 */
router.get('/cities', getAllCities);

/**
 * @swagger
 * /api/languages:
 *   get:
 *     summary: Get all unique languages (sorted A–Z)
 *     tags: [Countries]
 *     security: []
 *     responses:
 *       200:
 *         description: Sorted array of all unique language names
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               count: 312
 *               data: ["Afar", "Afrikaans", "Albanian", "Arabic", "Bengali"]
 */
router.get('/languages', getAllLanguages);

module.exports = router;