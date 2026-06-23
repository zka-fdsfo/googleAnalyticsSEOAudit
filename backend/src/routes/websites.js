const express = require('express');
const {
  listWebsites, getOne, discover, update, remove, sync,
  getAnalytics, getAnalyticsTrendHandler, getGSC, getGSCTrendHandler,
} = require('../controllers/websiteController');
const { authenticate } = require('../middleware/auth');
const intelligenceRouter = require('./intelligence');

const router = express.Router();
router.use(authenticate);

router.get('/',          listWebsites);
router.post('/discover', discover);
router.get('/:id',       getOne);
router.put('/:id',       update);
router.delete('/:id',    remove);
router.post('/:id/sync', sync);

// Snapshot endpoints
router.get('/:id/analytics',       getAnalytics);
router.get('/:id/analytics/trend', getAnalyticsTrendHandler);
router.get('/:id/gsc',             getGSC);
router.get('/:id/gsc/trend',       getGSCTrendHandler);

// Intelligence endpoints (mergeParams lets intelligence routes see :id)
router.use('/:id', intelligenceRouter);

module.exports = router;
