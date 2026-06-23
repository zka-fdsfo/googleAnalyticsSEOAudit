const express = require('express');
const { getLive, exportLive } = require('../controllers/liveMetricsController');
const { authenticate }        = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
router.use(authenticate);

// GET /api/websites/:id/live-metrics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/',       getLive);

// GET /api/websites/:id/live-metrics/export?startDate=&endDate=
router.get('/export', exportLive);

module.exports = router;