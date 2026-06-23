const express = require('express');
const { getSites, getReport, getTimeseries, checkIndexing } = require('../controllers/searchConsoleController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

/**
 * @route   GET /api/search-console/sites
 * @desc    List verified Search Console sites
 * @access  Private
 */
router.get('/sites', getSites);

/**
 * @route   GET /api/search-console/report
 * @desc    Get Search Console performance report
 * @access  Private
 */
router.get('/report', getReport);

/**
 * @route   GET /api/search-console/timeseries
 * @desc    Get Search Console daily timeseries
 * @access  Private
 */
router.get('/timeseries', getTimeseries);

/**
 * @route   GET /api/search-console/indexing
 * @desc    Check URL indexing status
 * @access  Private
 */
router.get('/indexing', checkIndexing);

module.exports = router;
