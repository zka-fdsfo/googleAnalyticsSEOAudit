const express = require('express');
const { debugGSC, debugGSCByWebsite, rawGSCQuery } = require('../controllers/gscDebugController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/debug/gsc
router.get('/', debugGSC);

// GET /api/debug/gsc/:websiteId/raw
//   Calls searchanalytics.query directly and returns the raw Google response.
//   No transformation, no zero-filling, no chart processing.
//   Query params: startDate, endDate (optional — defaults to last 30 completed days)
router.get('/:websiteId/raw', rawGSCQuery);

// GET /api/debug/gsc/:websiteId
router.get('/:websiteId', debugGSCByWebsite);

module.exports = router;