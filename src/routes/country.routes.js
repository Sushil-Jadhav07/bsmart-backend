const express = require('express');
const router  = express.Router();
const { getAllCountries, getAllStates, getAllCities, getAllLanguages } = require('../controllers/country.controller');

/**
 * @swagger
 * tags:
 *   name: Countries
 *   description: Flat data endpoints — apply filtering on the frontend
 */

/**
 * @swagger
 * /api/countries:
 *   get:
 *     summary: Get all countries (250)
 *     tags: [Countries]
 *     security: []
 *     responses:
 *       200:
 *         description: All countries with isoCode, flag, currency, languages, timezones
 */
router.get('/', getAllCountries);

/**
 * @swagger
 * /api/states:
 *   get:
 *     summary: Get all states (4963)
 *     tags: [Countries]
 *     security: []
 *     responses:
 *       200:
 *         description: All states with countryCode, countryName, isoCode, languages
 */
router.get('/states', getAllStates);

/**
 * @swagger
 * /api/cities:
 *   get:
 *     summary: Get all cities (148038)
 *     tags: [Countries]
 *     security: []
 *     responses:
 *       200:
 *         description: All cities with stateName, stateCode, countryName, countryCode
 */
router.get('/cities', getAllCities);

/**
 * @swagger
 * /api/languages:
 *   get:
 *     summary: Get all unique languages
 *     tags: [Countries]
 *     security: []
 *     responses:
 *       200:
 *         description: Sorted array of all unique language names
 */
router.get('/languages', getAllLanguages);

module.exports = router;