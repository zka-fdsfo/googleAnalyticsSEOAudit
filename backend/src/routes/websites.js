const express = require('express');
const {
  listWebsites, getOne, discover, update, remove, sync, getSyncStatus,
  getAnalytics, getAnalyticsTrendHandler, getGSC, getGSCTrendHandler,
} = require('../controllers/websiteController');
const { manualGSCLink, listAvailableGSCSites } = require('../controllers/gscDebugController');
const { authenticate } = require('../middleware/auth');
const intelligenceRouter  = require('./intelligence');
const liveMetricsRouter   = require('./liveMetrics');

const router = express.Router();
router.use(authenticate);

// ── Static routes first — must come before /:id to avoid shadowing ────────────
router.get('/',          listWebsites);
router.post('/discover', discover);
// Lists all Search Console sites in the user's Google account (no website ID needed)
router.get('/gsc-sites', listAvailableGSCSites);

// ── Dynamic :id routes ────────────────────────────────────────────────────────
router.get('/:id',       getOne);
router.put('/:id',       update);
router.delete('/:id',    remove);
router.post('/:id/sync',        sync);
router.get('/:id/sync/status', getSyncStatus);

// Snapshot endpoints
router.get('/:id/analytics',       getAnalytics);
router.get('/:id/analytics/trend', getAnalyticsTrendHandler);
router.get('/:id/gsc',             getGSC);
router.get('/:id/gsc/trend',       getGSCTrendHandler);

// Manually link a Search Console siteUrl to a specific website document
router.put('/:id/gsc-link', manualGSCLink);

// Live direct-query metrics (fresh from Google APIs, no snapshots)
router.use('/:id/live-metrics', liveMetricsRouter);

// Intelligence endpoints (mergeParams lets intelligence routes see :id)
router.use('/:id', intelligenceRouter);

module.exports = router;
