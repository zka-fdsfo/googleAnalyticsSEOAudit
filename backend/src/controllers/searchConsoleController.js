const User = require('../models/User');
const {
  listSearchConsoleSites,
  getSearchConsoleReport,
  getSearchConsoleTimeseries,
  getIndexingStatus,
} = require('../services/searchConsoleService');

const getSites = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+google.accessToken +google.refreshToken');
    if (!user?.isGoogleConnected) {
      return res.status(403).json({ error: 'Google account not connected.' });
    }
    const sites = await listSearchConsoleSites(user);
    res.json({ sites });
  } catch (err) {
    if (err.message?.includes('invalid_grant')) {
      return res.status(401).json({ error: 'Google session expired. Please reconnect.' });
    }
    next(err);
  }
};

const getReport = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+google.accessToken +google.refreshToken +google.searchConsole');
    if (!user?.isGoogleConnected) {
      return res.status(403).json({ error: 'Google account not connected.' });
    }

    const siteUrl = req.query.siteUrl || user.google?.searchConsole?.siteUrl;
    if (!siteUrl) {
      return res.status(400).json({ error: 'No Search Console site selected. Please select a site in Settings.' });
    }

    const report = await getSearchConsoleReport(user, siteUrl);
    res.json({ report, siteUrl });
  } catch (err) {
    if (err.message?.includes('invalid_grant')) {
      return res.status(401).json({ error: 'Google session expired. Please reconnect.' });
    }
    next(err);
  }
};

const getTimeseries = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+google.accessToken +google.refreshToken +google.searchConsole');
    if (!user?.isGoogleConnected) {
      return res.status(403).json({ error: 'Google account not connected.' });
    }

    const siteUrl = req.query.siteUrl || user.google?.searchConsole?.siteUrl;
    if (!siteUrl) {
      return res.status(400).json({ error: 'No site selected.' });
    }

    const days = parseInt(req.query.days) || 28;
    const data = await getSearchConsoleTimeseries(user, siteUrl, days);
    res.json({ data, siteUrl, days });
  } catch (err) {
    next(err);
  }
};

const checkIndexing = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+google.accessToken +google.refreshToken +google.searchConsole');
    if (!user?.isGoogleConnected) {
      return res.status(403).json({ error: 'Google account not connected.' });
    }

    const { pageUrl, siteUrl } = req.query;
    if (!pageUrl || !siteUrl) {
      return res.status(400).json({ error: 'pageUrl and siteUrl are required.' });
    }

    const status = await getIndexingStatus(user, siteUrl, pageUrl);
    res.json({ status });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSites, getReport, getTimeseries, checkIndexing };
