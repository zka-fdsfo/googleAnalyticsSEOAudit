const express = require('express');
const {
  executive, compareAnalytics, compareGSC, analyticsTrend, gscTrend,
  keywords, keywordHistory, keywordDistribution,
  pageIntelligence, seoScore,
  listRecommendations, patchRecommendation,
  listOpportunities, patchOpportunity,
  listAlerts, readAlerts, dismissAlertHandler,
  geo, geoTrend,
  createReport, listReports,
  gbpStatus, gbpAccounts, gbpLocations, gbpLink, gbpSync,
  listCompetitors, addCompetitor, removeCompetitor,
} = require('../controllers/intelligenceController');
const { authenticate } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
router.use(authenticate);

// ── Executive ────────────────────────────────────────────────────────────────
router.get('/executive',                  executive);

// ── Period comparison & trend series ────────────────────────────────────────
router.get('/analytics/compare',          compareAnalytics);
router.get('/gsc/compare',                compareGSC);
router.get('/analytics/series',           analyticsTrend);
router.get('/gsc/series',                 gscTrend);

// ── Keyword intelligence ─────────────────────────────────────────────────────
router.get('/keywords',                           keywords);
router.get('/keywords/distribution',              keywordDistribution);
router.get('/keywords/:keyword/history',          keywordHistory);

// ── Page intelligence ────────────────────────────────────────────────────────
router.get('/pages/intelligence',                 pageIntelligence);

// ── SEO Score ────────────────────────────────────────────────────────────────
router.get('/seo-score',                          seoScore);

// ── Recommendations ──────────────────────────────────────────────────────────
router.get('/recommendations',            listRecommendations);
router.patch('/recommendations/:recId',   patchRecommendation);

// ── Opportunities ────────────────────────────────────────────────────────────
router.get('/opportunities',              listOpportunities);
router.patch('/opportunities/:oppId',     patchOpportunity);

// ── Alerts ───────────────────────────────────────────────────────────────────
router.get('/alerts',                     listAlerts);
router.post('/alerts/read',               readAlerts);
router.patch('/alerts/:alertId/dismiss',  dismissAlertHandler);

// ── Geo analytics ────────────────────────────────────────────────────────────
router.get('/geo',                        geo);
router.get('/geo/:countryCode/trend',     geoTrend);

// ── Reports ──────────────────────────────────────────────────────────────────
router.get('/reports',                    listReports);
router.post('/reports',                   createReport);

// ── Google Business Profile ──────────────────────────────────────────────────
router.get('/gbp',                              gbpStatus);
router.get('/gbp/accounts',                     gbpAccounts);
router.get('/gbp/accounts/:accountId/locations',gbpLocations);
router.post('/gbp/link',                        gbpLink);
router.post('/gbp/sync',                        gbpSync);

// ── Competitors (future-ready) ───────────────────────────────────────────────
router.get('/competitors',                listCompetitors);
router.post('/competitors',               addCompetitor);
router.delete('/competitors/:competitorId', removeCompetitor);

module.exports = router;