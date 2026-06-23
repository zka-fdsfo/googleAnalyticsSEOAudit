const express = require('express');
const { getAccounts, getProperties, getReport, getTimeseries } = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

/** GET /api/analytics/accounts — list GA4 accounts */
router.get('/accounts', getAccounts);

/** GET /api/analytics/properties — list all GA4 properties via accountSummaries */
router.get('/properties', getProperties);

/** GET /api/analytics/report — GA4 report for a property */
router.get('/report', getReport);

/** GET /api/analytics/timeseries — daily sessions + users */
router.get('/timeseries', getTimeseries);

module.exports = router;
