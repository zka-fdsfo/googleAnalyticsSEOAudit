const Website = require('../models/Website');
const AnalyticsSnapshot = require('../models/AnalyticsSnapshot');
const SearchConsoleSnapshot = require('../models/SearchConsoleSnapshot');
const User = require('../models/User');
const { google } = require('googleapis');
const { createOAuth2Client } = require('../utils/googleAuth');

const dayStart = (d = new Date()) => {
  const date = new Date(d);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

// ── Google Analytics Snapshot ─────────────────────────────────────────────────

const syncAnalyticsSnapshot = async (website, user) => {
  if (!website.ga4?.propertyId) return null;

  const auth = createOAuth2Client(user);
  const analyticsData = google.analyticsdata({ version: 'v1beta', auth });
  const propertyId = website.ga4.propertyId;
  const prop = `properties/${propertyId}`;
  const base = { dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }] };

  const run = (requestBody) =>
    analyticsData.properties.runReport({ property: prop, requestBody: { ...base, ...requestBody } });

  // ── CORE: must succeed — if these fail, the whole snapshot is invalid ────────
  const [mainReport, timeseriesReport] = await Promise.all([
    run({
      metrics: [
        { name: 'activeUsers' }, { name: 'newUsers' },   { name: 'sessions' },
        { name: 'engagedSessions' }, { name: 'bounceRate' }, { name: 'engagementRate' },
        { name: 'averageSessionDuration' }, { name: 'screenPageViews' },
      ],
    }),
    run({
      dimensions: [{ name: 'date' }],
      metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }],
      orderBys:   [{ dimension: { dimensionName: 'date' } }],
    }),
  ]);

  // ── OPTIONAL: fail silently — not all GA4 property types support every dimension ──
  const [
    trafficRes, pageRes, deviceRes, countryRes,
    browserRes, landingRes, exitRes, cityRes, conversionRes,
  ] = await Promise.allSettled([
    // Traffic sources
    run({
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }),
    // Top pages
    run({
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics:    [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'bounceRate' }],
      orderBys:   [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 20,
    }),
    // Devices
    run({
      dimensions: [{ name: 'deviceCategory' }],
      metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
    }),
    // Countries
    run({
      dimensions: [{ name: 'country' }],
      metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 20,
    }),
    // Browsers — may be unsupported for pure app properties
    run({
      dimensions: [{ name: 'browser' }],
      metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }),
    // Landing pages — not available for app-only properties
    run({
      dimensions: [{ name: 'landingPagePlusQueryString' }],
      metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'bounceRate' }],
      orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 20,
    }),
    // Exit pages — 'exits' metric not supported by some property types
    run({
      dimensions: [{ name: 'exitPage' }],
      metrics:    [{ name: 'exits' }, { name: 'screenPageViews' }],
      orderBys:   [{ metric: { metricName: 'exits' }, desc: true }],
      limit: 20,
    }),
    // Cities
    run({
      dimensions: [{ name: 'city' }, { name: 'country' }],
      metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 30,
    }),
    // Conversions — empty or missing for properties with no key events configured
    run({
      dimensions: [{ name: 'eventName' }],
      metrics:    [{ name: 'eventCount' }, { name: 'conversions' }],
      orderBys:   [{ metric: { metricName: 'conversions' }, desc: true }],
      limit: 10,
    }),
  ]);

  // Helper: extract rows from an allSettled result, defaulting to [] on rejection
  const rows = (settled) =>
    settled.status === 'fulfilled' ? (settled.value?.data?.rows || []) : [];

  // Log any optional failures for debugging without crashing the sync
  [
    [trafficRes, 'trafficSources'], [pageRes, 'topPages'], [deviceRes, 'devices'],
    [countryRes, 'countries'], [browserRes, 'browsers'], [landingRes, 'landingPages'],
    [exitRes, 'exitPages'], [cityRes, 'cities'], [conversionRes, 'conversions'],
  ].forEach(([r, name]) => {
    if (r.status === 'rejected') {
      console.warn(`[Snapshot] GA4 optional report skipped for ${website.domain} (${name}): ${r.reason?.message}`);
    }
  });

  const mv = (idx) => parseFloat(mainReport.data?.rows?.[0]?.metricValues?.[idx]?.value) || 0;

  const users    = Math.round(mv(0));
  const newUsers = Math.round(mv(1));
  const sessions = Math.round(mv(2));
  const pageViews= Math.round(mv(7));

  const convRows = rows(conversionRes);
  const totalConversions = convRows.reduce((s, r) => s + (parseFloat(r.metricValues[1]?.value) || 0), 0);
  const totalEvents      = convRows.reduce((s, r) => s + (parseInt(r.metricValues[0]?.value)  || 0), 0);

  const snapshot = {
    websiteId: website._id,
    userId:    website.userId,
    date:      dayStart(),
    overview: {
      users,
      newUsers,
      returningUsers:     Math.max(0, users - newUsers),
      sessions,
      engagedSessions:    Math.round(mv(3)),
      bounceRate:         parseFloat((mv(4) * 100).toFixed(2)),
      engagementRate:     parseFloat((mv(5) * 100).toFixed(2)),
      avgSessionDuration: Math.round(mv(6)),
      pageViews,
      pagesPerSession:    sessions > 0 ? parseFloat((pageViews / sessions).toFixed(2)) : 0,
      conversions:        Math.round(totalConversions),
      conversionRate:     sessions > 0 ? parseFloat((totalConversions / sessions * 100).toFixed(2)) : 0,
      totalEvents:        Math.round(totalEvents),
    },
    trafficSources: rows(trafficRes).map((r) => ({
      channel:  r.dimensionValues[0]?.value || 'Other',
      sessions: parseInt(r.metricValues[0]?.value) || 0,
      users:    parseInt(r.metricValues[1]?.value) || 0,
    })),
    topPages: rows(pageRes).map((r) => ({
      path:       r.dimensionValues[0]?.value || '/',
      title:      r.dimensionValues[1]?.value || '',
      pageViews:  parseInt(r.metricValues[0]?.value) || 0,
      users:      parseInt(r.metricValues[1]?.value) || 0,
      bounceRate: parseFloat(r.metricValues[2]?.value || 0),
    })),
    devices: rows(deviceRes).map((r) => ({
      device:   r.dimensionValues[0]?.value || 'Other',
      sessions: parseInt(r.metricValues[0]?.value) || 0,
      users:    parseInt(r.metricValues[1]?.value) || 0,
    })),
    countries: rows(countryRes).map((r) => ({
      country:  r.dimensionValues[0]?.value || 'Unknown',
      sessions: parseInt(r.metricValues[0]?.value) || 0,
      users:    parseInt(r.metricValues[1]?.value) || 0,
    })),
    timeseries: (timeseriesReport.data?.rows || []).map((r) => ({
      date:      r.dimensionValues[0]?.value,
      sessions:  parseInt(r.metricValues[0]?.value) || 0,
      users:     parseInt(r.metricValues[1]?.value) || 0,
      pageViews: parseInt(r.metricValues[2]?.value) || 0,
    })),
    browsers: rows(browserRes).map((r) => ({
      browser:  r.dimensionValues[0]?.value || 'Other',
      sessions: parseInt(r.metricValues[0]?.value) || 0,
      users:    parseInt(r.metricValues[1]?.value) || 0,
    })),
    landingPages: rows(landingRes).map((r) => ({
      path:       r.dimensionValues[0]?.value || '/',
      sessions:   parseInt(r.metricValues[0]?.value) || 0,
      users:      parseInt(r.metricValues[1]?.value) || 0,
      bounceRate: parseFloat((parseFloat(r.metricValues[2]?.value || 0) * 100).toFixed(2)),
    })),
    exitPages: rows(exitRes).map((r) => ({
      path:      r.dimensionValues[0]?.value || '/',
      exits:     parseInt(r.metricValues[0]?.value) || 0,
      pageViews: parseInt(r.metricValues[1]?.value) || 0,
    })),
    cities: rows(cityRes).map((r) => ({
      city:     r.dimensionValues[0]?.value || 'Unknown',
      country:  r.dimensionValues[1]?.value || 'Unknown',
      sessions: parseInt(r.metricValues[0]?.value) || 0,
      users:    parseInt(r.metricValues[1]?.value) || 0,
    })),
    conversionEvents: convRows
      .filter((r) => parseFloat(r.metricValues[1]?.value) > 0)
      .map((r) => ({
        eventName:   r.dimensionValues[0]?.value,
        eventCount:  parseInt(r.metricValues[0]?.value) || 0,
        conversions: parseFloat(r.metricValues[1]?.value) || 0,
      })),
    fetchedAt: new Date(),
  };

  return AnalyticsSnapshot.findOneAndUpdate(
    { websiteId: website._id, date: snapshot.date },
    { $set: snapshot },
    { upsert: true, new: true }
  );
};

// ── Search Console Snapshot ───────────────────────────────────────────────────

const syncSearchConsoleSnapshot = async (website, user) => {
  if (!website.gsc?.siteUrl) return null;

  const auth = createOAuth2Client(user);
  const searchconsole = google.searchconsole({ version: 'v1', auth });
  const siteUrl = website.gsc.siteUrl;  // always the exact API value, never user-typed

  const endDate   = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 28);
  const fmt = (d) => d.toISOString().split('T')[0];

  // dataState omitted → defaults to 'all', which matches what Google Search Console UI shows.
  // 'final' would exclude the last 2-3 days of data, making our numbers lower than Google's.
  const base = { startDate: fmt(startDate), endDate: fmt(endDate), searchType: 'web' };

  const gscQuery = (requestBody) =>
    searchconsole.searchanalytics.query({ siteUrl, requestBody });

  // CORE: must succeed
  const [overviewRes, timeseriesRes] = await Promise.all([
    gscQuery(base),
    gscQuery({ ...base, dimensions: ['date'] }),
  ]);

  // OPTIONAL: secondary breakdowns — fail silently
  const [keywordsSettled, pagesSettled, devicesSettled, countriesSettled] =
    await Promise.allSettled([
      gscQuery({ ...base, dimensions: ['query'],   rowLimit: 500 }),
      gscQuery({ ...base, dimensions: ['page'],    rowLimit: 100 }),
      gscQuery({ ...base, dimensions: ['device']               }),
      gscQuery({ ...base, dimensions: ['country'], rowLimit: 30  }),
    ]);

  const gscRows = (settled) =>
    settled.status === 'fulfilled' ? (settled.value?.data?.rows || []) : [];

  [
    [keywordsSettled, 'keywords'], [pagesSettled, 'pages'],
    [devicesSettled, 'devices'],   [countriesSettled, 'countries'],
  ].forEach(([r, name]) => {
    if (r.status === 'rejected') {
      console.warn(`[Snapshot] GSC optional report skipped for ${website.domain} (${name}): ${r.reason?.message}`);
    }
  });

  // GSC searchanalytics.query (no dimensions) returns totals in rows[0], NOT at data root.
  let ov = overviewRes.data?.rows?.[0] || {};

  // Fallback: if the aggregate row is missing, derive totals from daily timeseries.
  const timeseriesRows = timeseriesRes.data?.rows || [];
  if (!ov.clicks && !ov.impressions && timeseriesRows.length > 0) {
    const totalClicks      = timeseriesRows.reduce((s, r) => s + (r.clicks      || 0), 0);
    const totalImpressions = timeseriesRows.reduce((s, r) => s + (r.impressions || 0), 0);
    const avgPosition      = timeseriesRows.reduce((s, r) => s + (r.position    || 0), 0) / timeseriesRows.length;
    ov = {
      clicks:      totalClicks,
      impressions: totalImpressions,
      ctr:         totalImpressions > 0 ? totalClicks / totalImpressions : 0,
      position:    avgPosition,
    };
  }

  const mapRow = (row, keys) => {
    const obj = {};
    keys.forEach((k, i) => (obj[k] = row.keys ? row.keys[i] : undefined));
    obj.clicks      = row.clicks      || 0;
    obj.impressions = row.impressions || 0;
    obj.ctr         = parseFloat(((row.ctr || 0) * 100).toFixed(2));
    obj.position    = parseFloat((row.position || 0).toFixed(1));
    return obj;
  };

  const snapshot = {
    websiteId: website._id,
    userId:    website.userId,
    date:      dayStart(),
    overview: {
      clicks:      ov.clicks      || 0,
      impressions: ov.impressions || 0,
      ctr:         parseFloat(((ov.ctr || 0) * 100).toFixed(2)),
      position:    parseFloat((ov.position || 0).toFixed(1)),
    },
    topKeywords: gscRows(keywordsSettled).map((r) => mapRow(r, ['query'])),
    topPages:    gscRows(pagesSettled).map((r)    => mapRow(r, ['page'])),
    devices:     gscRows(devicesSettled).map((r)  => mapRow(r, ['device'])),
    countries:   gscRows(countriesSettled).map((r) => ({
      country:     r.keys[0],
      clicks:      r.clicks      || 0,
      impressions: r.impressions || 0,
    })),
    timeseries: (timeseriesRes.data?.rows || []).map((r) => mapRow(r, ['date'])),
    fetchedAt:  new Date(),
  };

  return SearchConsoleSnapshot.findOneAndUpdate(
    { websiteId: website._id, date: snapshot.date },
    { $set: snapshot },
    { upsert: true, new: true }
  );
};

// ── Keyword history population ────────────────────────────────────────────────

const populateKeywordHistory = async (websiteId, userId, keywords) => {
  if (!keywords?.length) return;
  const KeywordHistory = require('../models/KeywordHistory');
  const date = dayStart();

  // Get yesterday's data for position change calculation
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  const prevSnap = await SearchConsoleSnapshot.findOne({
    websiteId,
    date: { $gte: yesterday, $lt: date },
  }).lean();
  const prevMap = new Map((prevSnap?.topKeywords || []).map((k) => [k.query, k]));

  const ops = keywords.map((kw) => {
    const prev = prevMap.get(kw.query);
    const positionChange = prev ? parseFloat((prev.position - kw.position).toFixed(1)) : null;
    const clicksChange   = prev ? kw.clicks - prev.clicks : null;

    return {
      updateOne: {
        filter: { websiteId, keyword: kw.query, date },
        update: {
          $set: {
            userId, position: kw.position, clicks: kw.clicks,
            impressions: kw.impressions, ctr: kw.ctr,
            positionChange, clicksChange,
          },
        },
        upsert: true,
      },
    };
  });

  if (ops.length > 0) {
    await KeywordHistory.bulkWrite(ops, { ordered: false });
  }
};

// ── Sync one website ──────────────────────────────────────────────────────────

const syncWebsite = async (websiteId) => {
  const website = await Website.findById(websiteId);
  if (!website) throw new Error(`Website ${websiteId} not found`);

  const user = await User.findById(website.userId).select(
    '+google.accessToken +google.refreshToken +google.expiresAt'
  );
  if (!user?.isGoogleConnected) throw new Error('User Google account not connected');

  await Website.findByIdAndUpdate(websiteId, { syncStatus: 'syncing', syncError: null });

  const results = { analytics: null, searchConsole: null, geo: null, errors: [] };

  try {
    results.analytics = await syncAnalyticsSnapshot(website, user);
  } catch (err) {
    results.errors.push(`Analytics: ${err.message}`);
    console.error(`[Snapshot] Analytics sync failed for ${website.domain}:`, err.message);
  }

  try {
    results.searchConsole = await syncSearchConsoleSnapshot(website, user);
    // Populate keyword history from the GSC snapshot
    if (results.searchConsole?.topKeywords?.length) {
      await populateKeywordHistory(website._id, website.userId, results.searchConsole.topKeywords)
        .catch((e) => console.error('[Snapshot] KeywordHistory write failed:', e.message));
    }
  } catch (err) {
    results.errors.push(`SearchConsole: ${err.message}`);
    console.error(`[Snapshot] GSC sync failed for ${website.domain}:`, err.message);
  }

  try {
    const { syncGeoSnapshot } = require('./geoService');
    results.geo = await syncGeoSnapshot(website, user);
  } catch (err) {
    results.errors.push(`Geo: ${err.message}`);
    console.error(`[Snapshot] Geo sync failed for ${website.domain}:`, err.message);
  }

  const nextSync = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h cooldown
  await Website.findByIdAndUpdate(websiteId, {
    syncStatus:   results.errors.length > 0 ? 'error' : 'idle',
    syncError:    results.errors.length > 0 ? results.errors.join('; ') : null,
    lastSyncedAt: new Date(),
    nextSyncAt:   nextSync,
  });

  // Post-sync intelligence: detect opportunities + alerts in background
  setImmediate(async () => {
    try {
      const { detectOpportunities } = require('./opportunityEngine');
      const { runAlertChecks }      = require('./alertService');
      await Promise.all([
        detectOpportunities(website._id, website.userId),
        runAlertChecks(website._id, website.userId),
      ]);
    } catch (e) {
      console.error(`[PostSync Intelligence] ${website.domain}:`, e.message);
    }
  });

  return results;
};

// ── Sync all websites for all users ──────────────────────────────────────────
// Used by the daily cron job. Staggers execution to avoid API quota bursts.

const syncAllWebsites = async () => {
  const now = new Date();
  const websites = await Website.find({
    $or: [{ nextSyncAt: { $lte: now } }, { nextSyncAt: null }, { syncStatus: 'never' }],
  }).limit(200); // process max 200 at a time per cron run

  console.log(`[Scheduler] Syncing ${websites.length} websites`);
  let success = 0;
  let failed  = 0;

  for (const website of websites) {
    try {
      await syncWebsite(website._id);
      success++;
      // Stagger: 2s between each website to respect API quotas
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      failed++;
      console.error(`[Scheduler] Failed to sync ${website.domain}:`, err.message);
    }
  }

  console.log(`[Scheduler] Done — ${success} success, ${failed} failed`);
  return { success, failed, total: websites.length };
};

// ── Get latest snapshot or trigger live fetch if stale ───────────────────────

const getLatestAnalyticsSnapshot = async (websiteId, userId) => {
  const snapshot = await AnalyticsSnapshot.findOne({ websiteId, userId })
    .sort({ date: -1 })
    .lean();

  // If snapshot is older than 12 hours, it's stale but still usable while background sync runs
  const stale = !snapshot || (Date.now() - new Date(snapshot.fetchedAt).getTime() > 12 * 60 * 60 * 1000);
  return { snapshot, stale };
};

const getLatestGSCSnapshot = async (websiteId, userId) => {
  const snapshot = await SearchConsoleSnapshot.findOne({ websiteId, userId })
    .sort({ date: -1 })
    .lean();

  // Backfill overview from timeseries for snapshots saved before the zero-overview bug was fixed.
  if (snapshot && !(snapshot.overview?.clicks > 0) && !(snapshot.overview?.impressions > 0)) {
    const ts = snapshot.timeseries || [];
    if (ts.length > 0) {
      const totalClicks      = ts.reduce((s, r) => s + (r.clicks      || 0), 0);
      const totalImpressions = ts.reduce((s, r) => s + (r.impressions || 0), 0);
      const avgPosition      = ts.reduce((s, r) => s + (r.position    || 0), 0) / ts.length;
      snapshot.overview = {
        clicks:      totalClicks,
        impressions: totalImpressions,
        ctr:         totalImpressions > 0 ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0,
        position:    parseFloat(avgPosition.toFixed(1)),
      };
    }
  }

  const stale = !snapshot || (Date.now() - new Date(snapshot.fetchedAt).getTime() > 12 * 60 * 60 * 1000);
  return { snapshot, stale };
};

// ── Trend data: last N snapshots' overview ────────────────────────────────────

const getAnalyticsTrend = (websiteId, userId, days = 30) =>
  AnalyticsSnapshot.find({ websiteId, userId })
    .sort({ date: -1 })
    .limit(days)
    .select('date overview')
    .lean();

const getGSCTrend = (websiteId, userId, days = 28) =>
  SearchConsoleSnapshot.find({ websiteId, userId })
    .sort({ date: -1 })
    .limit(days)
    .select('date overview')
    .lean();

module.exports = {
  syncWebsite,
  syncAllWebsites,
  syncAnalyticsSnapshot,
  syncSearchConsoleSnapshot,
  getLatestAnalyticsSnapshot,
  getLatestGSCSnapshot,
  getAnalyticsTrend,
  getGSCTrend,
};
