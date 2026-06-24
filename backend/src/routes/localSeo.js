const express = require('express');
const {
  overview, rankings, addRankingHandler,
  keywordsList, addKeywordHandler, deleteKeywordHandler,
  trends, visibility, insights,
} = require('../controllers/localSeoController');
const { authenticate } = require('../middleware/auth');

const router = express.Router({ mergeParams: true }); // inherits :websiteId from parent
router.use(authenticate);

// Overview (KPIs + summaries + insights combined)
router.get('/overview',   overview);

// Rankings
router.get('/rankings',   rankings);
router.post('/rankings',  addRankingHandler);

// Keywords
router.get('/keywords',   keywordsList);
router.post('/keywords',  addKeywordHandler);
router.delete('/keywords/:keywordId', deleteKeywordHandler);

// Charts data
router.get('/trends',     trends);
router.get('/visibility', visibility);

// Insights
router.get('/insights',   insights);

module.exports = router;