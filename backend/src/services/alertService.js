const Alert = require('../models/Alert');
const AnalyticsSnapshot = require('../models/AnalyticsSnapshot');
const SearchConsoleSnapshot = require('../models/SearchConsoleSnapshot');
const { calcGrowth } = require('./metricsService');

// Only create an alert if no identical alert exists within the last 24 hours
const shouldCreateAlert = async (websiteId, type) => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const exists = await Alert.findOne({ websiteId, type, createdAt: { $gte: cutoff } });
  return !exists;
};

const createAlert = async (data) => {
  if (!(await shouldCreateAlert(data.websiteId, data.type))) return null;
  return Alert.create(data);
};

// ── Alert detection rules ──────────────────────────────────────────────────────

const checkAnalyticsAlerts = async (websiteId, userId) => {
  const snapshots = await AnalyticsSnapshot.find({ websiteId, userId })
    .sort({ date: -1 })
    .limit(31)
    .select('date overview')
    .lean();

  if (snapshots.length < 2) return [];

  const current  = snapshots[0].overview;
  const previous = snapshots[1]?.overview;  // yesterday's 30-day window
  const monthAgo = snapshots[30]?.overview; // a month ago's 30-day window

  const created = [];

  // Traffic drop > 20% week-over-week
  if (previous) {
    const sessionChange = calcGrowth(current.sessions, previous.sessions);
    if (sessionChange < -20) {
      const alert = await createAlert({
        websiteId, userId,
        type:          'traffic_drop',
        severity:      sessionChange < -40 ? 'critical' : 'warning',
        title:         `Traffic dropped ${Math.abs(Math.round(sessionChange))}%`,
        message:       `Organic sessions dropped from ${previous.sessions.toLocaleString()} to ${current.sessions.toLocaleString()} compared to yesterday's 30-day window.`,
        metric:        'sessions',
        currentValue:  current.sessions,
        previousValue: previous.sessions,
        changePercent: sessionChange,
      });
      if (alert) created.push(alert);
    }

    // Positive spike > 50%
    if (sessionChange > 50) {
      const alert = await createAlert({
        websiteId, userId,
        type:          'traffic_spike',
        severity:      'info',
        title:         `Traffic spike +${Math.round(sessionChange)}%`,
        message:       `Organic sessions increased from ${previous.sessions.toLocaleString()} to ${current.sessions.toLocaleString()}.`,
        metric:        'sessions',
        currentValue:  current.sessions,
        previousValue: previous.sessions,
        changePercent: sessionChange,
      });
      if (alert) created.push(alert);
    }
  }

  return created;
};

const checkGSCAlerts = async (websiteId, userId) => {
  const snapshots = await SearchConsoleSnapshot.find({ websiteId, userId })
    .sort({ date: -1 })
    .limit(8)
    .select('date overview')
    .lean();

  if (snapshots.length < 2) return [];

  const current  = snapshots[0].overview;
  const previous = snapshots[7]?.overview;  // 7 days ago

  if (!previous) return [];

  const created = [];

  // Click drop > 20%
  const clickChange = calcGrowth(current.clicks, previous.clicks);
  if (clickChange < -20) {
    const alert = await createAlert({
      websiteId, userId,
      type:          'clicks_drop',
      severity:      clickChange < -40 ? 'critical' : 'warning',
      title:         `Clicks dropped ${Math.abs(Math.round(clickChange))}%`,
      message:       `Organic clicks dropped from ${previous.clicks.toLocaleString()} to ${current.clicks.toLocaleString()} vs 7 days ago.`,
      metric:        'clicks',
      currentValue:  current.clicks,
      previousValue: previous.clicks,
      changePercent: clickChange,
    });
    if (alert) created.push(alert);
  }

  // CTR drop > 15% (only flag if impressions are stable)
  const ctrChange         = calcGrowth(current.ctr, previous.ctr);
  const impressionsChange = calcGrowth(current.impressions, previous.impressions);
  if (ctrChange < -15 && impressionsChange > -10) {
    const alert = await createAlert({
      websiteId, userId,
      type:          'ctr_drop',
      severity:      'warning',
      title:         `CTR dropped ${Math.abs(Math.round(ctrChange))}%`,
      message:       `Click-through rate fell from ${previous.ctr}% to ${current.ctr}% while impressions stayed stable. Titles/descriptions may need updating.`,
      metric:        'ctr',
      currentValue:  current.ctr,
      previousValue: previous.ctr,
      changePercent: ctrChange,
    });
    if (alert) created.push(alert);
  }

  // Position decline (higher number = worse rank)
  const positionChange = calcGrowth(current.position, previous.position);
  if (positionChange > 15) {
    const alert = await createAlert({
      websiteId, userId,
      type:          'ranking_drop',
      severity:      positionChange > 30 ? 'critical' : 'warning',
      title:         `Average position dropped from #${previous.position} to #${current.position}`,
      message:       `Your average search position worsened by ${Math.round(positionChange)}% over the last 7 days. Review recent site changes.`,
      metric:        'position',
      currentValue:  current.position,
      previousValue: previous.position,
      changePercent: positionChange,
    });
    if (alert) created.push(alert);
  }

  return created;
};

// ── Public API ─────────────────────────────────────────────────────────────────

const runAlertChecks = async (websiteId, userId) => {
  const [analyticsAlerts, gscAlerts] = await Promise.all([
    checkAnalyticsAlerts(websiteId, userId),
    checkGSCAlerts(websiteId, userId),
  ]);
  return [...analyticsAlerts, ...gscAlerts];
};

const getAlerts = async (userId, websiteId, { unreadOnly = false, limit = 20 } = {}) => {
  const filter = { userId, isDismissed: false };
  if (websiteId) filter.websiteId = websiteId;
  if (unreadOnly) filter.isRead = false;

  const [items, unreadCount] = await Promise.all([
    Alert.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    Alert.countDocuments({ userId, isRead: false, isDismissed: false }),
  ]);

  return { items, unreadCount };
};

const markAlertsRead = (userId, alertIds) =>
  Alert.updateMany(
    { userId, _id: { $in: alertIds } },
    { $set: { isRead: true, readAt: new Date() } }
  );

const dismissAlert = (userId, alertId) =>
  Alert.findOneAndUpdate(
    { _id: alertId, userId },
    { $set: { isDismissed: true, dismissedAt: new Date() } }
  );

const createAuditAlert = (websiteId, userId, message) =>
  createAlert({
    websiteId, userId,
    type:     'new_critical_issue',
    severity: 'warning',
    title:    'New critical SEO issue detected',
    message,
    metric:   'seo_score',
  });

module.exports = {
  runAlertChecks,
  getAlerts,
  markAlertsRead,
  dismissAlert,
  createAuditAlert,
};
