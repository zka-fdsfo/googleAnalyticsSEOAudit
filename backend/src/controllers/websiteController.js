const Website = require('../models/Website');
const { discoverWebsites, getUserWebsites, getWebsite, updateWebsite, deleteWebsite } = require('../services/websiteService');
const { syncWebsite, getLatestAnalyticsSnapshot, getLatestGSCSnapshot, getAnalyticsTrend, getGSCTrend } = require('../services/snapshotService');
const User = require('../models/User');

// GET /api/websites
const listWebsites = async (req, res, next) => {
  try {
    const websites = await getUserWebsites(req.user._id);
    res.json({ websites });
  } catch (err) { next(err); }
};

// GET /api/websites/:id
const getOne = async (req, res, next) => {
  try {
    const website = await getWebsite(req.params.id, req.user._id);
    if (!website) return res.status(404).json({ error: 'Website not found.' });
    res.json({ website });
  } catch (err) { next(err); }
};

// POST /api/websites/discover — auto-discover from Google properties
const discover = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select('+google.accessToken +google.refreshToken +google.expiresAt');
    if (!user?.isGoogleConnected) {
      return res.status(403).json({ error: 'Google account not connected.' });
    }
    const result = await discoverWebsites(user);
    const websites = await getUserWebsites(req.user._id);
    res.json({ ...result, websites });
  } catch (err) { next(err); }
};

// PUT /api/websites/:id
const update = async (req, res, next) => {
  try {
    const website = await updateWebsite(req.params.id, req.user._id, req.body);
    if (!website) return res.status(404).json({ error: 'Website not found.' });

    if (req.body.isDefault) {
      await Website.setDefault(req.user._id, website._id);
    }
    res.json({ website });
  } catch (err) { next(err); }
};

// DELETE /api/websites/:id
const remove = async (req, res, next) => {
  try {
    await deleteWebsite(req.params.id, req.user._id);
    res.json({ message: 'Website removed.' });
  } catch (err) { next(err); }
};

// POST /api/websites/:id/sync — trigger immediate data sync
const sync = async (req, res, next) => {
  try {
    const website = await getWebsite(req.params.id, req.user._id);
    if (!website) return res.status(404).json({ error: 'Website not found.' });

    if (website.syncStatus === 'syncing') {
      return res.status(409).json({ error: 'Sync already in progress.' });
    }

    // Run sync in background and respond immediately
    syncWebsite(website._id).catch((err) =>
      console.error(`[Manual sync] ${website.domain}:`, err.message)
    );

    res.json({ message: 'Sync started.', websiteId: website._id });
  } catch (err) { next(err); }
};

// GET /api/websites/:id/analytics — latest snapshot
const getAnalytics = async (req, res, next) => {
  try {
    const website = await getWebsite(req.params.id, req.user._id);
    if (!website) return res.status(404).json({ error: 'Website not found.' });

    const { snapshot, stale } = await getLatestAnalyticsSnapshot(website._id, req.user._id);

    // If no snapshot exists at all, trigger a live sync and wait
    if (!snapshot && website.ga4?.propertyId) {
      syncWebsite(website._id).catch(() => {});
      return res.json({ snapshot: null, stale: true, syncing: true });
    }

    res.json({ snapshot, stale, website });
  } catch (err) { next(err); }
};

// GET /api/websites/:id/analytics/trend
const getAnalyticsTrendHandler = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const trend = await getAnalyticsTrend(req.params.id, req.user._id, days);
    res.json({ trend: trend.reverse() }); // chronological order
  } catch (err) { next(err); }
};

// GET /api/websites/:id/gsc — latest GSC snapshot
const getGSC = async (req, res, next) => {
  try {
    const website = await getWebsite(req.params.id, req.user._id);
    if (!website) return res.status(404).json({ error: 'Website not found.' });

    const { snapshot, stale } = await getLatestGSCSnapshot(website._id, req.user._id);

    if (!snapshot && website.gsc?.siteUrl) {
      syncWebsite(website._id).catch(() => {});
      return res.json({ snapshot: null, stale: true, syncing: true });
    }

    res.json({ snapshot, stale, website });
  } catch (err) { next(err); }
};

// GET /api/websites/:id/gsc/trend
const getGSCTrendHandler = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 28;
    const trend = await getGSCTrend(req.params.id, req.user._id, days);
    res.json({ trend: trend.reverse() });
  } catch (err) { next(err); }
};

module.exports = { listWebsites, getOne, discover, update, remove, sync, getAnalytics, getAnalyticsTrendHandler, getGSC, getGSCTrendHandler };
