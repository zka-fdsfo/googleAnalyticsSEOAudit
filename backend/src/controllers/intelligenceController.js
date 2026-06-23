const Website = require('../models/Website');
const KeywordHistory = require('../models/KeywordHistory');
const { getAnalyticsComparison, getGSCComparison, getKeywordChanges, buildAnalyticsTrendSeries, buildGSCTrendSeries, getExecutiveSummary } = require('../services/metricsService');
const { getRecommendations, updateRecommendationStatus, getRecommendationSummary } = require('../services/recommendationEngine');
const { getOpportunities, updateOpportunityStatus } = require('../services/opportunityEngine');
const { getAlerts, markAlertsRead, dismissAlert } = require('../services/alertService');
const { getLatestGeoSnapshot, getGeoTrend } = require('../services/geoService');
const { getKeywordDistribution, getPageIntelligence, getSEOScoreHistory, generateReport } = require('../services/pageIntelligenceService');
const { getBusinessProfile, listGBPAccounts, listGBPLocations, linkBusinessProfile, syncGBPInsights } = require('../services/businessProfileService');
const User = require('../models/User');

const verifyWebsite = async (websiteId, userId) => {
  const website = await Website.findOne({ _id: websiteId, userId });
  if (!website) throw Object.assign(new Error('Website not found.'), { statusCode: 404 });
  return website;
};

// ── Executive Summary ─────────────────────────────────────────────────────────

const executive = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const days = parseInt(req.query.days) || 30;
    const summary = await getExecutiveSummary(req.params.id, req.user._id, days);
    const [recSummary, alerts] = await Promise.all([
      getRecommendationSummary(req.params.id),
      getAlerts(req.user._id, req.params.id, { unreadOnly: false, limit: 5 }),
    ]);
    res.json({ summary, recommendations: recSummary, alerts: alerts.items, unreadAlerts: alerts.unreadCount });
  } catch (err) { next(err); }
};

// ── Period comparison ─────────────────────────────────────────────────────────

const compareAnalytics = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const days = parseInt(req.query.days) || 30;
    const data = await getAnalyticsComparison(req.params.id, req.user._id, days);
    res.json(data);
  } catch (err) { next(err); }
};

const compareGSC = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const days = parseInt(req.query.days) || 28;
    const data = await getGSCComparison(req.params.id, req.user._id, days);
    res.json(data);
  } catch (err) { next(err); }
};

// ── Trend series ──────────────────────────────────────────────────────────────

const analyticsTrend = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const days = parseInt(req.query.days) || 30;
    const series = await buildAnalyticsTrendSeries(req.params.id, req.user._id, days);
    res.json({ series, days });
  } catch (err) { next(err); }
};

const gscTrend = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const days = parseInt(req.query.days) || 28;
    const series = await buildGSCTrendSeries(req.params.id, req.user._id, days);
    res.json({ series, days });
  } catch (err) { next(err); }
};

// ── Keywords ──────────────────────────────────────────────────────────────────

const keywords = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const days = parseInt(req.query.lookback) || 7;
    const data = await getKeywordChanges(req.params.id, req.user._id, days);
    res.json(data);
  } catch (err) { next(err); }
};

const keywordHistory = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const { keyword } = req.params;
    const days = parseInt(req.query.days) || 90;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const history = await KeywordHistory.find({
      websiteId: req.params.id,
      userId: req.user._id,
      keyword: decodeURIComponent(keyword),
      date: { $gte: cutoff },
    })
      .sort({ date: 1 })
      .select('date position clicks impressions ctr positionChange')
      .lean();
    res.json({ keyword, history, days });
  } catch (err) { next(err); }
};

// ── Recommendations ───────────────────────────────────────────────────────────

const listRecommendations = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const { status, category, limit = 50, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const data = await getRecommendations(req.params.id, {
      status: status || 'open',
      category,
      limit: parseInt(limit),
      skip,
    });
    const summary = await getRecommendationSummary(req.params.id);
    res.json({ ...data, summary });
  } catch (err) { next(err); }
};

const patchRecommendation = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const rec = await updateRecommendationStatus(
      req.params.recId,
      req.user._id,
      { status: req.body.status, notes: req.body.notes }
    );
    if (!rec) return res.status(404).json({ error: 'Recommendation not found.' });
    res.json({ recommendation: rec });
  } catch (err) { next(err); }
};

// ── Opportunities ─────────────────────────────────────────────────────────────

const listOpportunities = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const { status, limit = 30, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const data = await getOpportunities(req.params.id, { status, limit: parseInt(limit), skip });
    res.json(data);
  } catch (err) { next(err); }
};

const patchOpportunity = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const opp = await updateOpportunityStatus(req.params.oppId, req.user._id, req.body.status);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });
    res.json({ opportunity: opp });
  } catch (err) { next(err); }
};

// ── Alerts ────────────────────────────────────────────────────────────────────

const listAlerts = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const data = await getAlerts(req.user._id, req.params.id, {
      unreadOnly: req.query.unread === 'true',
      limit: parseInt(req.query.limit) || 20,
    });
    res.json(data);
  } catch (err) { next(err); }
};

const readAlerts = async (req, res, next) => {
  try {
    const ids = req.body.ids || [];
    await markAlertsRead(req.user._id, ids);
    res.json({ message: 'Marked as read.' });
  } catch (err) { next(err); }
};

const dismissAlertHandler = async (req, res, next) => {
  try {
    await dismissAlert(req.user._id, req.params.alertId);
    res.json({ message: 'Alert dismissed.' });
  } catch (err) { next(err); }
};

// ── Geo ───────────────────────────────────────────────────────────────────────

const geo = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const days = parseInt(req.query.days) || 30;
    const snapshot = await getLatestGeoSnapshot(req.params.id, req.user._id, days);
    res.json({ snapshot });
  } catch (err) { next(err); }
};

const geoTrend = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const { countryCode } = req.params;
    const days = parseInt(req.query.days) || 30;
    const trend = await getGeoTrend(req.params.id, req.user._id, countryCode, days);
    res.json({ trend, countryCode, days });
  } catch (err) { next(err); }
};

// ── Keyword distribution ───────────────────────────────────────────────────────

const keywordDistribution = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const data = await getKeywordDistribution(req.params.id, req.user._id);
    res.json(data);
  } catch (err) { next(err); }
};

// ── Page intelligence ──────────────────────────────────────────────────────────

const pageIntelligence = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const lookback = parseInt(req.query.lookback) || 7;
    const data = await getPageIntelligence(req.params.id, req.user._id, lookback);
    res.json(data);
  } catch (err) { next(err); }
};

// ── SEO Score ──────────────────────────────────────────────────────────────────

const seoScore = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const data = await getSEOScoreHistory(req.params.id);
    res.json(data);
  } catch (err) { next(err); }
};

// ── Reports ───────────────────────────────────────────────────────────────────

const createReport = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const type = req.body.type || 'monthly';
    const report = await generateReport(req.params.id, req.user._id, type);
    res.json({ report });
  } catch (err) { next(err); }
};

const listReports = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const Report = require('../models/Report');
    const reports = await Report.find({ websiteId: req.params.id, userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({ reports });
  } catch (err) { next(err); }
};

// ── Google Business Profile ────────────────────────────────────────────────────

const gbpStatus = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const profile = await getBusinessProfile(req.params.id, req.user._id);
    res.json({ profile });
  } catch (err) { next(err); }
};

const gbpAccounts = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const user = await User.findById(req.user._id).select('+google.accessToken +google.refreshToken +google.expiresAt');
    const accounts = await listGBPAccounts(user);
    res.json({ accounts });
  } catch (err) { next(err); }
};

const gbpLocations = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const user = await User.findById(req.user._id).select('+google.accessToken +google.refreshToken +google.expiresAt');
    const locations = await listGBPLocations(user, req.params.accountId);
    res.json({ locations });
  } catch (err) { next(err); }
};

const gbpLink = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const profile = await linkBusinessProfile(req.params.id, req.user._id, req.body);
    res.json({ profile });
  } catch (err) { next(err); }
};

const gbpSync = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    syncGBPInsights(req.params.id).catch((e) =>
      console.error('[GBP sync]', e.message)
    );
    res.json({ message: 'GBP sync started.' });
  } catch (err) { next(err); }
};

// ── Competitors (future-ready) ────────────────────────────────────────────────

const listCompetitors = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const Competitor = require('../models/Competitor');
    const competitors = await Competitor.find({ websiteId: req.params.id, userId: req.user._id, isActive: true }).lean();
    res.json({ competitors });
  } catch (err) { next(err); }
};

const addCompetitor = async (req, res, next) => {
  try {
    await verifyWebsite(req.params.id, req.user._id);
    const Competitor = require('../models/Competitor');
    const competitor = await Competitor.findOneAndUpdate(
      { websiteId: req.params.id, domain: req.body.domain?.toLowerCase() },
      { $set: { ...req.body, websiteId: req.params.id, userId: req.user._id, isActive: true } },
      { upsert: true, new: true }
    );
    res.json({ competitor });
  } catch (err) { next(err); }
};

const removeCompetitor = async (req, res, next) => {
  try {
    const Competitor = require('../models/Competitor');
    await Competitor.findOneAndUpdate(
      { _id: req.params.competitorId, userId: req.user._id },
      { $set: { isActive: false } }
    );
    res.json({ message: 'Competitor removed.' });
  } catch (err) { next(err); }
};

module.exports = {
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
};
