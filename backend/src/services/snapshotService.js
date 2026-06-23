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

  const [mainReport, trafficReport, pageReport, deviceReport, countryReport, timeseriesReport,
         browserReport, landingPageReport, exitPageReport, cityReport, conversionReport] =
    await Promise.all([
      // Overview
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          metrics: [
            { name: 'activeUsers' },
            { name: 'newUsers' },
            { name: 'sessions' },
            { name: 'engagedSessions' },
            { name: 'bounceRate' },
            { name: 'engagementRate' },
            { name: 'averageSessionDuration' },
            { name: 'screenPageViews' },
          ],
        },
      }),
      // Traffic sources
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'sessionDefaultChannelGroup' }],
          metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
          orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 10,
        },
      }),
      // Top pages
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
          metrics:    [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'bounceRate' }],
          orderBys:   [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 20,
        },
      }),
      // Devices
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'deviceCategory' }],
          metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
        },
      }),
      // Countries
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'country' }],
          metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
          orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 20,
        },
      }),
      // Daily timeseries
      // Daily timeseries
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'date' }],
          metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }],
          orderBys:   [{ dimension: { dimensionName: 'date' } }],
        },
      }),
      // Browsers
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'browser' }],
          metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
          orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 10,
        },
      }),
      // Landing pages
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'landingPagePlusQueryString' }],
          metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'bounceRate' }],
          orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 20,
        },
      }),
      // Exit pages
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'exitPage' }],
          metrics:    [{ name: 'exits' }, { name: 'screenPageViews' }],
          orderBys:   [{ metric: { metricName: 'exits' }, desc: true }],
          limit: 20,
        },
      }),
      // Cities
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'city' }, { name: 'country' }],
          metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
          orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 30,
        },
      }),
      // Key events (conversions)
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'eventName' }],
          metrics:    [{ name: 'eventCount' }, { name: 'conversions' }],
          orderBys:   [{ metric: { metricName: 'conversions' }, desc: true }],
          limit: 10,
        },
      }),
    ]);

  const mv = (report, idx) => parseFloat(report.data?.rows?.[0]?.metricValues?.[idx]?.value) || 0;

  // Derived metrics
  const users    = Math.round(mv(mainReport, 0));
  const newUsers = Math.round(mv(mainReport, 1));
  const sessions = Math.round(mv(mainReport, 2));
  const pageViews = Math.round(mv(mainReport, 7));
  const totalConversions = (conversionReport.data?.rows || []).reduce(
    (s, r) => s + (parseFloat(r.metricValues[1]?.value) || 0), 0
  );
  const totalEvents = (conversionReport.data?.rows || []).reduce(
    (s, r) => s + (parseInt(r.metricValues[0]?.value) || 0), 0
  );

  const snapshot = {
    websiteId: website._id,
    userId:    website.userId,
    date:      dayStart(),
    overview: {
      users,
      newUsers,
      returningUsers:     Math.max(0, users - newUsers),
      sessions,
      engagedSessions:    Math.round(mv(mainReport, 3)),
      bounceRate:         parseFloat((mv(mainReport, 4) * 100).toFixed(2)),
      engagementRate:     parseFloat((mv(mainReport, 5) * 100).toFixed(2)),
      avgSessionDuration: Math.round(mv(mainReport, 6)),
      pageViews,
      pagesPerSession:    sessions > 0 ? parseFloat((pageViews / sessions).toFixed(2)) : 0,
      conversions:        Math.round(totalConversions),
      conversionRate:     sessions > 0 ? parseFloat((totalConversions / sessions * 100).toFixed(2)) : 0,
      totalEvents:        Math.round(totalEvents),
    },
    trafficSources: (trafficReport.data?.rows || []).map((r) => ({
      channel:  r.dimensionValues[0]?.value || 'Other',
      sessions: parseInt(r.metricValues[0]?.value) || 0,
      users:    parseInt(r.metricValues[1]?.value) || 0,
    })),
    topPages: (pageReport.data?.rows || []).map((r) => ({
      path:       r.dimensionValues[0]?.value || '/',
      title:      r.dimensionValues[1]?.value || '',
      pageViews:  parseInt(r.metricValues[0]?.value) || 0,
      users:      parseInt(r.metricValues[1]?.value) || 0,
      bounceRate: parseFloat(r.metricValues[2]?.value || 0),
    })),
    devices: (deviceReport.data?.rows || []).map((r) => ({
      device:   r.dimensionValues[0]?.value || 'Other',
      sessions: parseInt(r.metricValues[0]?.value) || 0,
      users:    parseInt(r.metricValues[1]?.value) || 0,
    })),
    countries: (countryReport.data?.rows || []).map((r) => ({
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
    browsers: (browserReport.data?.rows || []).map((r) => ({
      browser:  r.dimensionValues[0]?.value || 'Other',
      sessions: parseInt(r.metricValues[0]?.value) || 0,
      users:    parseInt(r.metricValues[1]?.value) || 0,
    })),
    landingPages: (landingPageReport.data?.rows || []).map((r) => ({
      path:       r.dimensionValues[0]?.value || '/',
      sessions:   parseInt(r.metricValues[0]?.value) || 0,
      users:      parseInt(r.metricValues[1]?.value) || 0,
      bounceRate: parseFloat((parseFloat(r.metricValues[2]?.value || 0) * 100).toFixed(2)),
    })),
    exitPages: (exitPageReport.data?.rows || []).map((r) => ({
      path:      r.dimensionValues[0]?.value || '/',
      exits:     parseInt(r.metricValues[0]?.value) || 0,
      pageViews: parseInt(r.metricValues[1]?.value) || 0,
    })),
    cities: (cityReport.data?.rows || []).map((r) => ({
      city:     r.dimensionValues[0]?.value || 'Unknown',
      country:  r.dimensionValues[1]?.value || 'Unknown',
      sessions: parseInt(r.metricValues[0]?.value) || 0,
      users:    parseInt(r.metricValues[1]?.value) || 0,
    })),
    conversionEvents: (conversionReport.data?.rows || [])
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

  const base = { startDate: fmt(startDate), endDate: fmt(endDate), searchType: 'web', dataState: 'final' };

  const [overviewRes, keywordsRes, pagesRes, devicesRes, countriesRes, timeseriesRes] =
    await Promise.all([
      searchconsole.searchanalytics.query({ siteUrl, requestBody: base }),
      searchconsole.searchanalytics.query({ siteUrl, requestBody: { ...base, dimensions: ['query'],   rowLimit: 500 } }),
      searchconsole.searchanalytics.query({ siteUrl, requestBody: { ...base, dimensions: ['page'],    rowLimit: 100 } }),
      searchconsole.searchanalytics.query({ siteUrl, requestBody: { ...base, dimensions: ['device']               } }),
      searchconsole.searchanalytics.query({ siteUrl, requestBody: { ...base, dimensions: ['country'], rowLimit: 30  } }),
      searchconsole.searchanalytics.query({ siteUrl, requestBody: { ...base, dimensions: ['date']                 } }),
    ]);

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
    topKeywords: (keywordsRes.data?.rows  || []).map((r) => mapRow(r, ['query'])),
    topPages:    (pagesRes.data?.rows     || []).map((r) => mapRow(r, ['page'])),
    devices:     (devicesRes.data?.rows   || []).map((r) => mapRow(r, ['device'])),
    countries:   (countriesRes.data?.rows || []).map((r) => ({
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
