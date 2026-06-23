const User = require('../models/User');
const { listGA4Accounts, listGA4Properties, getGA4Report, getGA4Timeseries } = require('../services/googleAnalyticsService');

const requireGoogleUser = async (userId) => {
  const user = await User.findById(userId).select(
    '+google.accessToken +google.refreshToken +google.expiresAt +google.analytics'
  );
  if (!user?.isGoogleConnected) {
    const err = new Error('Google account not connected. Please connect your Google account in Settings.');
    err.statusCode = 403;
    throw err;
  }

  return user;
};

const getAccounts = async (req, res, next) => {
  try {
    const user = await requireGoogleUser(req.user._id);
    const accounts = await listGA4Accounts(user);
    res.json({ accounts });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (isExpiredToken(err)) return res.status(401).json({ error: 'Google session expired. Please reconnect your Google account.' });
    next(err);
  }
};

const getProperties = async (req, res, next) => {
  try {
    const user = await requireGoogleUser(req.user._id);
    const properties = await listGA4Properties(user);
    res.json({ properties });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (isExpiredToken(err)) return res.status(401).json({ error: 'Google session expired. Please reconnect your Google account.' });
    next(err);
  }
};

const getReport = async (req, res, next) => {
  try {
    const user = await requireGoogleUser(req.user._id);
    const propertyId = req.query.propertyId || user.google?.analytics?.propertyId;
    if (!propertyId) {
      return res.status(400).json({ error: 'No GA4 property selected. Please select a property in Settings.' });
    }

    const dateRange = {
      startDate: req.query.startDate || '30daysAgo',
      endDate:   req.query.endDate   || 'today',
    };
    const report = await getGA4Report(user, propertyId, dateRange);
    res.json({ report, propertyId });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (isExpiredToken(err)) return res.status(401).json({ error: 'Google session expired. Please reconnect.' });
    next(err);
  }
};

const getTimeseries = async (req, res, next) => {
  try {
    const user = await requireGoogleUser(req.user._id);
    const propertyId = req.query.propertyId || user.google?.analytics?.propertyId;
    if (!propertyId) {
      return res.status(400).json({ error: 'No GA4 property selected.' });
    }

    const days = parseInt(req.query.days) || 30;
    const data = await getGA4Timeseries(user, propertyId, days);
    res.json({ data, propertyId, days });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
};

const isExpiredToken = (err) =>
  err.message?.includes('invalid_grant') ||
  err.message?.includes('Token has been expired') ||
  err.message?.includes('Invalid Credentials');

module.exports = { getAccounts, getProperties, getReport, getTimeseries };
