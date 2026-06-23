/**
 * metricsService.js
 *
 * Period comparison engine: all KPI values and growth % are derived from the
 * daily `timeseries` rows stored inside each snapshot, NOT from snapshot.overview.
 *
 * Why timeseries, not snapshot.overview?
 *   snapshot.overview is a fixed 28/30-day aggregate baked in at sync time.
 *   It never changes for a given snapshot, so comparing it for "7D vs 30D"
 *   always returns the same value. The timeseries rows are per-day data that
 *   can be filtered and summed for any arbitrary window.
 *
 * Comparison model:
 *   For a period of N days:
 *     current  = rows in [today-N, today]
 *     previous = rows in [today-2N, today-N]
 *   Growth = ((current - previous) / |previous|) * 100
 */

const AnalyticsSnapshot     = require('../models/AnalyticsSnapshot');
const SearchConsoleSnapshot = require('../models/SearchConsoleSnapshot');

// ── Shared utilities ──────────────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD. */
const fmtISO = (d) => d.toISOString().split('T')[0];

/**
 * GSC API stores date dimension as YYYY-MM-DD.
 * GA4  API stores date dimension as YYYYMMDD (no hyphens).
 * Convert to ISO (YYYY-MM-DD) for uniform comparison.
 */
const toISO = (dateStr) =>
  dateStr && dateStr.length === 8
    ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
    : dateStr;

// ── GSC timeseries collector ──────────────────────────────────────────────────

/**
 * Collects deduplicated daily GSC rows from all snapshots that might contain
 * data for the requested date range. GSC dates are stored as YYYY-MM-DD.
 * Returns a Map<dateStr, row>.
 */
const collectGSCRows = async (websiteId, userId, sinceDate) => {
  const snapshots = await SearchConsoleSnapshot.find({
    websiteId,
    userId,
    date: { $gte: sinceDate },
  })
    .sort({ date: 1 })
    .select('timeseries')
    .lean();

  const map = new Map();
  for (const snap of snapshots) {
    for (const row of snap.timeseries || []) {
      if (row.date && !map.has(row.date)) {
        map.set(row.date, row);
      }
    }
  }
  return map;
};

/** Aggregate GSC rows in [startISO, endISO] inclusive. Returns null if no rows. */
const aggGSC = (rowMap, startISO, endISO) => {
  const rows = [];
  rowMap.forEach((row, date) => {
    if (date >= startISO && date <= endISO) rows.push(row);
  });
  if (!rows.length) return null;

  const totalClicks      = rows.reduce((s, r) => s + (r.clicks      || 0), 0);
  const totalImpressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);

  // Impression-weighted average position — matches Google Search Console's calculation.
  // Simple arithmetic average would always diverge from Google's displayed value.
  const posRows        = rows.filter((r) => (r.position || 0) > 0);
  const weightedPosSum = posRows.reduce((s, r) => s + r.position * (r.impressions || 1), 0);
  const weightSum      = posRows.reduce((s, r) => s + (r.impressions || 1), 0);
  const avgPosition    = weightSum > 0 ? weightedPosSum / weightSum : 0;

  return {
    clicks:      totalClicks,
    impressions: totalImpressions,
    ctr:         totalImpressions > 0
      ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2))
      : 0,
    position: parseFloat(avgPosition.toFixed(1)),
  };
};

// ── Analytics timeseries collector ───────────────────────────────────────────

/**
 * Collects deduplicated daily Analytics rows. GA4 dates are YYYYMMDD;
 * we normalise to YYYY-MM-DD for comparison.
 * Returns a Map<YYYY-MM-DD, row>.
 */
const collectAnalyticsRows = async (websiteId, userId, sinceDate) => {
  const snapshots = await AnalyticsSnapshot.find({
    websiteId,
    userId,
    date: { $gte: sinceDate },
  })
    .sort({ date: 1 })
    .select('timeseries')
    .lean();

  const map = new Map();
  for (const snap of snapshots) {
    for (const row of snap.timeseries || []) {
      if (!row.date) continue;
      const isoDate = toISO(row.date); // normalise YYYYMMDD → YYYY-MM-DD
      if (!map.has(isoDate)) {
        map.set(isoDate, { ...row, date: isoDate });
      }
    }
  }
  return map;
};

/** Aggregate Analytics rows in [startISO, endISO] inclusive. Returns null if no rows. */
const aggAnalytics = (rowMap, startISO, endISO) => {
  const rows = [];
  rowMap.forEach((row, date) => {
    if (date >= startISO && date <= endISO) rows.push(row);
  });
  if (!rows.length) return null;

  return {
    sessions:  rows.reduce((s, r) => s + (r.sessions  || 0), 0),
    users:     rows.reduce((s, r) => s + (r.users      || 0), 0),
    pageViews: rows.reduce((s, r) => s + (r.pageViews  || 0), 0),
  };
};

// ── Growth calculation ────────────────────────────────────────────────────────

const calcGrowth = (current, previous) => {
  if (previous === null || previous === undefined || previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return parseFloat(((current - previous) / Math.abs(previous)) * 100);
};

const roundGrowth = (g) => parseFloat(g.toFixed(1));

// ── GSC period comparison ─────────────────────────────────────────────────────

/**
 * Returns KPI values and growth % for a GSC period by aggregating timeseries rows.
 *
 * current  = rows in [today-periodDays, today]
 * previous = rows in [today-2*periodDays, today-periodDays]
 *
 * Falls back to snapshot.overview when timeseries is not yet populated.
 */
const getGSCComparison = async (websiteId, userId, periodDays = 28) => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const curEnd   = fmtISO(today);
  // Current period: [today - periodDays + 1, today]  → exactly periodDays days inclusive
  const curStart = (() => { const d = new Date(today); d.setDate(d.getDate() - periodDays + 1); return fmtISO(d); })();
  // Previous period: same length, immediately before current
  // prevEnd  = curStart - 1 day
  // prevStart= prevEnd  - periodDays + 1   → same window size, no off-by-one
  const prevEnd  = (() => { const d = new Date(today); d.setDate(d.getDate() - periodDays);         return fmtISO(d); })();
  const prevStart= (() => { const d = new Date(today); d.setDate(d.getDate() - periodDays * 2 + 1); return fmtISO(d); })();

  const since = new Date(today);
  since.setDate(since.getDate() - periodDays * 2 - 30);

  const rowMap = await collectGSCRows(websiteId, userId, since);

  const currentOverview  = aggGSC(rowMap, curStart, curEnd);
  const previousOverview = aggGSC(rowMap, prevStart, prevEnd);

  // If no timeseries data at all, fall back to the snapshot overview.
  if (!currentOverview) {
    const snap = await SearchConsoleSnapshot.findOne({ websiteId, userId })
      .sort({ date: -1 })
      .lean();
    if (!snap) return { current: null, previous: null, changes: null, periodDays };
    const ov = deriveGSCOverview(snap);
    return { current: ov, previous: null, changes: null, periodDays };
  }

  const changes = previousOverview
    ? {
        clicks:      roundGrowth(calcGrowth(currentOverview.clicks,      previousOverview.clicks)),
        impressions: roundGrowth(calcGrowth(currentOverview.impressions,  previousOverview.impressions)),
        ctr:         roundGrowth(calcGrowth(currentOverview.ctr,          previousOverview.ctr)),
        // position: lower is better — invert sentiment at the display layer
        position:    roundGrowth(calcGrowth(currentOverview.position,     previousOverview.position)),
      }
    : null;

  return {
    current:    currentOverview,
    previous:   previousOverview,
    changes,
    periodDays,
    periods: {
      current:  { start: curStart,  end: curEnd  },
      previous: { start: prevStart, end: prevEnd },
    },
  };
};

// ── Analytics period comparison ───────────────────────────────────────────────

/**
 * Returns KPI values and growth % for an Analytics period.
 *
 * Volume metrics (sessions, users, pageViews) come from timeseries aggregation.
 * Rate metrics (bounceRate, engagementRate, etc.) come from the latest snapshot
 * overview because GA4 doesn't provide them in the daily timeseries.
 */
const getAnalyticsComparison = async (websiteId, userId, periodDays = 30) => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const curEnd   = fmtISO(today);
  const curStart = (() => { const d = new Date(today); d.setDate(d.getDate() - periodDays + 1);     return fmtISO(d); })();
  const prevEnd  = (() => { const d = new Date(today); d.setDate(d.getDate() - periodDays);         return fmtISO(d); })();
  const prevStart= (() => { const d = new Date(today); d.setDate(d.getDate() - periodDays * 2 + 1); return fmtISO(d); })();

  const since = new Date(today);
  since.setDate(since.getDate() - periodDays * 2 - 35);

  const rowMap = await collectAnalyticsRows(websiteId, userId, since);

  const currentAgg  = aggAnalytics(rowMap, curStart, curEnd);
  const previousAgg = aggAnalytics(rowMap, prevStart, prevEnd);

  // Always fetch latest snapshot for rate metrics (not in timeseries).
  const latestSnap = await AnalyticsSnapshot.findOne({ websiteId, userId })
    .sort({ date: -1 })
    .lean();
  const snapOv = latestSnap?.overview || {};

  if (!currentAgg) {
    // No timeseries — return snapshot overview as fallback.
    if (!latestSnap) return { current: null, previous: null, changes: null, periodDays };
    return { current: snapOv, previous: null, changes: null, periodDays };
  }

  // Merge timeseries aggregates with snapshot rates.
  const currentOverview = {
    sessions:           currentAgg.sessions,
    users:              currentAgg.users,
    pageViews:          currentAgg.pageViews,
    // Rate/average metrics: show the latest-30d window value (not period-specific).
    bounceRate:         snapOv.bounceRate         ?? 0,
    engagementRate:     snapOv.engagementRate     ?? 0,
    avgSessionDuration: snapOv.avgSessionDuration ?? 0,
    engagedSessions:    snapOv.engagedSessions    ?? 0,
    newUsers:           snapOv.newUsers           ?? 0,
  };

  const changes = previousAgg
    ? {
        sessions:           roundGrowth(calcGrowth(currentAgg.sessions,  previousAgg.sessions)),
        users:              roundGrowth(calcGrowth(currentAgg.users,      previousAgg.users)),
        pageViews:          roundGrowth(calcGrowth(currentAgg.pageViews,  previousAgg.pageViews)),
        // Rate metrics: null = no comparison available from timeseries.
        bounceRate:         null,
        engagementRate:     null,
        avgSessionDuration: null,
        engagedSessions:    null,
        newUsers:           null,
      }
    : null;

  return {
    current:    currentOverview,
    previous:   previousAgg ? { ...previousAgg } : null,
    changes,
    periodDays,
    periods: {
      current:  { start: curStart,  end: curEnd  },
      previous: { start: prevStart, end: prevEnd },
    },
  };
};

// ── Keyword movement ──────────────────────────────────────────────────────────

const getKeywordChanges = async (websiteId, userId, lookbackDays = 7) => {
  const current = await SearchConsoleSnapshot.findOne({ websiteId, userId })
    .sort({ date: -1 })
    .lean();

  if (!current) return { rising: [], falling: [], newKeywords: [], lostKeywords: [], unchanged: [] };

  const cutoff = new Date(current.date);
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const previous = await SearchConsoleSnapshot.findOne({
    websiteId,
    userId,
    date: { $lte: cutoff },
  })
    .sort({ date: -1 })
    .lean();

  const currentKws  = current.topKeywords  || [];
  const previousKws = previous?.topKeywords || [];

  const prevMap = new Map(previousKws.map((k) => [k.query, k]));
  const currMap = new Map(currentKws.map((k)  => [k.query, k]));

  const rising       = [];
  const falling      = [];
  const unchanged    = [];
  const newKeywords  = [];
  const lostKeywords = [];

  for (const kw of currentKws) {
    const prev = prevMap.get(kw.query);
    if (!prev) { newKeywords.push({ ...kw, positionChange: null }); continue; }
    const posChange = parseFloat((prev.position - kw.position).toFixed(1));
    const enriched  = { ...kw, prevPosition: prev.position, positionChange: posChange, prevClicks: prev.clicks };
    if      (posChange >= 3)  rising.push(enriched);
    else if (posChange <= -3) falling.push(enriched);
    else                      unchanged.push(enriched);
  }
  for (const kw of previousKws) {
    if (!currMap.has(kw.query)) lostKeywords.push({ ...kw, positionChange: null });
  }

  rising.sort((a, b) => b.positionChange - a.positionChange);
  falling.sort((a, b) => a.positionChange - b.positionChange);
  newKeywords.sort((a, b) => b.clicks - a.clicks);
  lostKeywords.sort((a, b) => b.clicks - a.clicks);

  return {
    rising:       rising.slice(0, 50),
    falling:      falling.slice(0, 50),
    newKeywords:  newKeywords.slice(0, 50),
    lostKeywords: lostKeywords.slice(0, 50),
    unchanged:    unchanged.slice(0, 20),
    lookbackDays,
    currentDate:  current.date,
    previousDate: previous?.date || null,
  };
};

// ── Chart series builders ─────────────────────────────────────────────────────

const buildAnalyticsTrendSeries = async (websiteId, userId, days = 30) => {
  const snapshots = await AnalyticsSnapshot.find({ websiteId, userId })
    .sort({ date: -1 })
    .limit(days)
    .select('date overview timeseries')
    .lean();

  if (days <= 30 && snapshots.length > 0) {
    const ts = snapshots[0].timeseries || [];
    return days < ts.length ? ts.slice(-days) : ts;
  }

  return snapshots
    .reverse()
    .map((s) => ({
      date:      s.date.toISOString().split('T')[0],
      sessions:  s.overview.sessions,
      users:     s.overview.users,
      pageViews: s.overview.pageViews,
    }));
};

const buildGSCTrendSeries = async (websiteId, userId, days = 28) => {
  const snapshots = await SearchConsoleSnapshot.find({ websiteId, userId })
    .sort({ date: -1 })
    .limit(days)
    .select('date overview timeseries')
    .lean();

  if (days <= 28 && snapshots.length > 0) {
    const ts = snapshots[0].timeseries || [];
    return days < ts.length ? ts.slice(-days) : ts;
  }

  return snapshots
    .reverse()
    .map((s) => {
      const ov = deriveGSCOverview(s);
      return {
        date:        s.date.toISOString().split('T')[0],
        clicks:      ov.clicks,
        impressions: ov.impressions,
        ctr:         ov.ctr,
        position:    ov.position,
      };
    });
};

// ── GSC overview fallback (used by snapshot endpoints) ───────────────────────

const deriveGSCOverview = (snapshot) => {
  if (!snapshot) return null;
  const ov = snapshot.overview || {};
  if (ov.clicks > 0 || ov.impressions > 0) return ov;
  const ts = snapshot.timeseries || [];
  if (!ts.length) return ov;
  const totalClicks      = ts.reduce((s, r) => s + (r.clicks      || 0), 0);
  const totalImpressions = ts.reduce((s, r) => s + (r.impressions || 0), 0);
  const avgPosition      = ts.reduce((s, r) => s + (r.position    || 0), 0) / ts.length;
  return {
    clicks:      totalClicks,
    impressions: totalImpressions,
    ctr:         totalImpressions > 0 ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0,
    position:    parseFloat(avgPosition.toFixed(1)),
  };
};

// ── Executive summary ─────────────────────────────────────────────────────────

const getExecutiveSummary = async (websiteId, userId, days = 30) => {
  const [analyticsComp, gscComp, keywordChanges] = await Promise.all([
    getAnalyticsComparison(websiteId, userId, days),
    getGSCComparison(websiteId, userId, days),
    getKeywordChanges(websiteId, userId, 7),
  ]);

  const gscSnap = await SearchConsoleSnapshot.findOne({ websiteId, userId })
    .sort({ date: -1 })
    .select('topKeywords topPages countries devices')
    .lean();

  return {
    analytics:   analyticsComp,
    gsc:         gscComp,
    keywords:    keywordChanges,
    topKeywords: gscSnap?.topKeywords?.slice(0, 10) || [],
    topPages:    gscSnap?.topPages?.slice(0, 5)     || [],
  };
};

module.exports = {
  calcGrowth,
  deriveGSCOverview,
  getAnalyticsComparison,
  getGSCComparison,
  getKeywordChanges,
  buildAnalyticsTrendSeries,
  buildGSCTrendSeries,
  getExecutiveSummary,
};