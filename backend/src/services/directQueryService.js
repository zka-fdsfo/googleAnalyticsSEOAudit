/**
 * directQueryService.js
 *
 * Fetches GA4 and GSC data live for an exact date range.
 * No snapshots involved — data matches Google dashboards in real time.
 *
 * Cached in-memory for 10 minutes per (userId, websiteId, startDate, endDate)
 * to avoid hammering the APIs on rapid page switches.
 */

const { google }             = require('googleapis');
const { createOAuth2Client } = require('../utils/googleAuth');
const BusinessProfile        = require('../models/BusinessProfile');

// ── Simple TTL cache ──────────────────────────────────────────────────────────

const _cache  = new Map();
const CACHE_MS = 10 * 60 * 1000; // 10 minutes

const cacheGet = (key) => {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_MS) { _cache.delete(key); return null; }
  return e.data;
};
const cacheSet = (key, data) => _cache.set(key, { data, ts: Date.now() });

// ── Date helpers ──────────────────────────────────────────────────────────────

const fmt = (d) => (d instanceof Date ? d : new Date(d)).toISOString().split('T')[0];

/**
 * Given a current period [startDate, endDate], compute the equivalent
 * previous period (same number of days, immediately before).
 */
const previousPeriod = (startDate, endDate) => {
  const s   = new Date(startDate);
  const e   = new Date(endDate);
  const dur = Math.round((e - s) / 86_400_000); // days - 1 (inclusive count - 1)
  const prevEnd   = new Date(s);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - dur);
  return { prevStart: fmt(prevStart), prevEnd: fmt(prevEnd) };
};

// ── Growth helper ─────────────────────────────────────────────────────────────

const growth = (cur, prev) => {
  if (prev === null || prev === undefined || prev === 0) return cur > 0 ? 100 : 0;
  return parseFloat(((cur - prev) / Math.abs(prev)) * 100);
};
const round1 = (n) => parseFloat(n.toFixed(1));

// ── GA4 ───────────────────────────────────────────────────────────────────────

const queryGA4 = async (auth, propertyId, startDate, endDate) => {
  const api  = google.analyticsdata({ version: 'v1beta', auth });
  const prop = `properties/${propertyId}`;

  const run = (requestBody) =>
    api.properties.runReport({ property: prop, requestBody });

  const [overviewRes, timeseriesRes, pagesRes, deviceRes, browserRes] =
    await Promise.allSettled([
      // Overview totals
      run({
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'newUsers' },
          { name: 'sessions' },
          { name: 'engagementRate' },
          { name: 'screenPageViews' },
        ],
      }),
      // Daily timeseries for chart
      run({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'screenPageViews' },
          { name: 'engagementRate' },
        ],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      // Top pages
      run({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 20,
      }),
      // Device breakdown
      run({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
      }),
      // Browser breakdown — optional, may not exist for app-only properties
      run({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'browser' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      }),
    ]);

  const safeRows = (r) =>
    r.status === 'fulfilled' ? (r.value?.data?.rows || []) : [];

  const ov  = overviewRes.status === 'fulfilled' ? overviewRes.value?.data?.rows?.[0] : null;
  const mv  = (idx) => parseFloat(ov?.metricValues?.[idx]?.value || 0);

  const users          = Math.round(mv(0));
  const newUsers       = Math.round(mv(1));
  const returningUsers = Math.max(0, users - newUsers);
  const sessions       = Math.round(mv(2));
  const engagementRate = parseFloat((mv(3) * 100).toFixed(1));
  const pageViews      = Math.round(mv(4));

  return {
    users, newUsers, returningUsers, sessions, engagementRate, pageViews,
    timeseries: safeRows(timeseriesRes).map((r) => ({
      date:            r.dimensionValues[0]?.value,
      sessions:        parseInt(r.metricValues[0]?.value) || 0,
      users:           parseInt(r.metricValues[1]?.value) || 0,
      pageViews:       parseInt(r.metricValues[2]?.value) || 0,
      engagementRate:  parseFloat((parseFloat(r.metricValues[3]?.value || 0) * 100).toFixed(1)),
    })),
    topPages: safeRows(pagesRes).map((r) => ({
      path:      r.dimensionValues[0]?.value || '/',
      title:     r.dimensionValues[1]?.value || '',
      pageViews: parseInt(r.metricValues[0]?.value) || 0,
      users:     parseInt(r.metricValues[1]?.value) || 0,
    })),
    devices: safeRows(deviceRes).map((r) => ({
      device:   r.dimensionValues[0]?.value || 'Other',
      users:    parseInt(r.metricValues[0]?.value) || 0,
      sessions: parseInt(r.metricValues[1]?.value) || 0,
    })),
    browsers: safeRows(browserRes).map((r) => ({
      browser:  r.dimensionValues[0]?.value || 'Other',
      users:    parseInt(r.metricValues[0]?.value) || 0,
      sessions: parseInt(r.metricValues[1]?.value) || 0,
    })),
  };
};

// ── GSC ───────────────────────────────────────────────────────────────────────

const queryGSC = async (auth, siteUrl, startDate, endDate) => {
  const api  = google.searchconsole({ version: 'v1', auth });
  const base = { startDate, endDate, searchType: 'web' };

  // ── 1. Log every request body before sending ──────────────────────────────
  const reqOverview   = base;
  const reqTimeseries = { ...base, dimensions: ['date'] };
  const reqKeywords   = { ...base, dimensions: ['query'], rowLimit: 25 };
  const reqPages      = { ...base, dimensions: ['page'],  rowLimit: 25 };

  console.log('[queryGSC] ══════════════════════════════════════════════════════');
  console.log('[queryGSC] siteUrl         :', siteUrl);
  console.log('[queryGSC] request/overview   :', JSON.stringify({ siteUrl, requestBody: reqOverview }));
  console.log('[queryGSC] request/timeseries :', JSON.stringify({ siteUrl, requestBody: reqTimeseries }));
  console.log('[queryGSC] request/keywords   :', JSON.stringify({ siteUrl, requestBody: reqKeywords }));
  console.log('[queryGSC] request/pages      :', JSON.stringify({ siteUrl, requestBody: reqPages }));

  const q = (requestBody) =>
    api.searchanalytics.query({ siteUrl, requestBody });

  const [overviewRes, timeseriesRes, keywordsRes, pagesRes] =
    await Promise.allSettled([
      q(reqOverview),
      q(reqTimeseries),
      q(reqKeywords),
      q(reqPages),
    ]);

  // ── 2. Log FULL raw response for every query ──────────────────────────────
  console.log('[queryGSC] --- RAW RESPONSE: overview ---');
  console.log('[queryGSC] status:', overviewRes.status);
  if (overviewRes.status === 'rejected') {
    console.log('[queryGSC] ERROR:', overviewRes.reason?.message);
    console.log('[queryGSC] FULL ERROR:', JSON.stringify(overviewRes.reason?.response?.data ?? overviewRes.reason?.message));
  } else {
    console.log('[queryGSC] data:', JSON.stringify(overviewRes.value?.data));
  }

  console.log('[queryGSC] --- RAW RESPONSE: timeseries (dimensions=date) ---');
  console.log('[queryGSC] status:', timeseriesRes.status);
  if (timeseriesRes.status === 'rejected') {
    console.log('[queryGSC] ERROR:', timeseriesRes.reason?.message);
  } else {
    console.log('[queryGSC] data:', JSON.stringify(timeseriesRes.value?.data));
  }

  console.log('[queryGSC] --- RAW RESPONSE: keywords (dimensions=query) ---');
  console.log('[queryGSC] status:', keywordsRes.status);
  if (keywordsRes.status === 'rejected') {
    console.log('[queryGSC] ERROR:', keywordsRes.reason?.message);
  } else {
    console.log('[queryGSC] data:', JSON.stringify(keywordsRes.value?.data));
  }

  console.log('[queryGSC] --- RAW RESPONSE: pages (dimensions=page) ---');
  console.log('[queryGSC] status:', pagesRes.status);
  if (pagesRes.status === 'rejected') {
    console.log('[queryGSC] ERROR:', pagesRes.reason?.message);
  } else {
    console.log('[queryGSC] data:', JSON.stringify(pagesRes.value?.data));
  }

  // ── 3. Row counts before any transformation ───────────────────────────────
  const rawOverviewRows   = (overviewRes.status === 'fulfilled'  ? overviewRes.value?.data?.rows   : null) ?? [];
  const rawTimeseriesRows = (timeseriesRes.status === 'fulfilled' ? timeseriesRes.value?.data?.rows : null) ?? [];
  const rawKeywordRows    = (keywordsRes.status === 'fulfilled'  ? keywordsRes.value?.data?.rows   : null) ?? [];
  const rawPageRows       = (pagesRes.status === 'fulfilled'     ? pagesRes.value?.data?.rows      : null) ?? [];

  console.log('[queryGSC] --- ROW COUNTS (raw, before transformation) ---');
  console.log('[queryGSC] overviewRows  :', rawOverviewRows.length);
  console.log('[queryGSC] timeseriesRows:', rawTimeseriesRows.length);
  console.log('[queryGSC] keywordRows   :', rawKeywordRows.length);
  console.log('[queryGSC] pageRows      :', rawPageRows.length);

  if (rawTimeseriesRows.length === 0 && rawOverviewRows.length === 0) {
    console.log('[queryGSC] *** ALL QUERIES RETURNED ZERO ROWS ***');
    console.log('[queryGSC] siteUrl queried:', siteUrl);
    console.log('[queryGSC] dateRange      :', startDate, '→', endDate);
    console.log('[queryGSC] This means Google Search Console has NO data for this property');
    console.log('[queryGSC] in this date range. Verify the siteUrl at search.google.com/search-console');
  }

  const safe = (r) =>
    r.status === 'fulfilled' ? (r.value?.data?.rows || []) : [];

  // ── 4. Aggregation from timeseries rows (impression-weighted position) ────
  const tsRows      = safe(timeseriesRes);
  const totalClicks = tsRows.reduce((s, r) => s + (r.clicks      || 0), 0);
  const totalImpr   = tsRows.reduce((s, r) => s + (r.impressions || 0), 0);
  const posRows     = tsRows.filter((r) => (r.position || 0) > 0);
  const wPosSum     = posRows.reduce((s, r) => s + r.position * (r.impressions || 1), 0);
  const wSum        = posRows.reduce((s, r) => s + (r.impressions || 1), 0);
  const avgPosition = wSum > 0 ? wPosSum / wSum : 0;

  const ovRow       = safe(overviewRes)[0];
  const clicks      = ovRow ? (ovRow.clicks      || 0) : totalClicks;
  const impressions = ovRow ? (ovRow.impressions || 0) : totalImpr;
  const position    = ovRow ? (ovRow.position    || avgPosition) : avgPosition;
  const ctr         = impressions > 0 ? parseFloat(((clicks / impressions) * 100).toFixed(2)) : 0;

  const mapRow = (r, keyField) => ({
    [keyField]:  r.keys?.[0],
    clicks:      r.clicks      || 0,
    impressions: r.impressions || 0,
    ctr:         parseFloat(((r.ctr || 0) * 100).toFixed(2)),
    position:    parseFloat((r.position || 0).toFixed(1)),
  });

  // ── 5. Transformation: raw → mapped, log before and after ────────────────
  const mappedTimeseries = tsRows.map((r) => ({
    date:        r.keys?.[0],
    clicks:      r.clicks      || 0,
    impressions: r.impressions || 0,
    ctr:         parseFloat(((r.ctr || 0) * 100).toFixed(2)),
    position:    parseFloat((r.position || 0).toFixed(1)),
  }));
  const mappedKeywords = safe(keywordsRes).map((r) => mapRow(r, 'query'));
  const mappedPages    = safe(pagesRes).map((r)    => mapRow(r, 'page'));

  console.log('[queryGSC] --- TRANSFORMATION ---');
  console.log('[queryGSC] tsRows.length (raw)        :', tsRows.length,       '→ mappedTimeseries.length:', mappedTimeseries.length);
  console.log('[queryGSC] keywordRows.length (raw)   :', rawKeywordRows.length, '→ mappedKeywords.length  :', mappedKeywords.length);
  console.log('[queryGSC] pageRows.length (raw)      :', rawPageRows.length,    '→ mappedPages.length     :', mappedPages.length);

  // ── 6. Final return value ────────────────────────────────────────────────
  const returnValue = {
    clicks,
    impressions,
    ctr,
    position: parseFloat(avgPosition > 0 ? avgPosition.toFixed(1) : (position || 0).toFixed(1)),
    timeseries:  mappedTimeseries,
    topKeywords: mappedKeywords,
    topPages:    mappedPages,
  };

  console.log('[queryGSC] --- RETURN VALUE (before caller receives it) ---');
  console.log('[queryGSC] clicks     :', returnValue.clicks);
  console.log('[queryGSC] impressions:', returnValue.impressions);
  console.log('[queryGSC] ctr        :', returnValue.ctr);
  console.log('[queryGSC] position   :', returnValue.position);
  console.log('[queryGSC] timeseries.length  :', returnValue.timeseries.length);
  console.log('[queryGSC] topKeywords.length :', returnValue.topKeywords.length);
  console.log('[queryGSC] topPages.length    :', returnValue.topPages.length);
  console.log('[queryGSC] ════════════════════════════════════════════════════');

  return returnValue;
};

// ── GBP ───────────────────────────────────────────────────────────────────────

const queryGBP = async (websiteId) => {
  const profile = await BusinessProfile.findOne({ websiteId }).lean();
  if (!profile?.latest) return null;
  return {
    websiteClicks:     profile.latest.websiteClicks     || 0,
    directionRequests: profile.latest.directionRequests || 0,
    phoneCalls:        profile.latest.phoneCalls        || 0,
    searchViews:       profile.latest.searchViews       || 0,
    mapsViews:         profile.latest.mapsViews         || 0,
    lastSyncedAt:      profile.lastSyncedAt             || null,
  };
};

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Fetches GA4 + GSC + GBP data for a website over an exact date range,
 * plus the equivalent previous period for growth % calculation.
 *
 * @param {Object}  website      - Website document (includes ga4.propertyId, gsc.siteUrl)
 * @param {Object}  user         - User document with Google credentials
 * @param {string}  startDate    - ISO date 'YYYY-MM-DD'
 * @param {string}  endDate      - ISO date 'YYYY-MM-DD'
 * @param {boolean} forceRefresh - When true, bypass the 10-min TTL cache and re-fetch
 *                                 directly from Google APIs, then update the cache.
 */
const getLiveMetrics = async (website, user, startDate, endDate, forceRefresh = false) => {
  const cacheKey = `${user._id}:${website._id}:${startDate}:${endDate}`;

  // Only serve from cache when forceRefresh is NOT requested.
  if (!forceRefresh) {
    const cached = cacheGet(cacheKey);
    if (cached) return { ...cached, fromCache: true };
  }

  const { prevStart, prevEnd } = previousPeriod(startDate, endDate);
  const auth = createOAuth2Client(user);

  // ── Log exact DB state for this website before deciding what to query ────────
  console.log(`[LiveMetrics] websiteId      : ${website._id}`);
  console.log(`[LiveMetrics] domain          : ${website.domain}`);
  console.log(`[LiveMetrics] website.gsc     : ${JSON.stringify(website.gsc)}`);
  console.log(`[LiveMetrics] website.ga4     : ${JSON.stringify(website.ga4)}`);

  const hasGA4 = !!website.ga4?.propertyId;
  const hasGSC = !!website.gsc?.siteUrl;

  console.log(`[LiveMetrics] hasGA4          : ${hasGA4} (propertyId="${website.ga4?.propertyId ?? 'null'}")`);
  console.log(`[LiveMetrics] hasGSC          : ${hasGSC} (siteUrl="${website.gsc?.siteUrl ?? 'null'}")`);
  if (!hasGSC) {
    const reason =
      !website.gsc                ? 'website.gsc object is null/undefined'
      : !website.gsc.siteUrl      ? 'website.gsc.siteUrl is null/undefined/empty string'
      : 'unknown — siteUrl is falsy';
    console.log(`[LiveMetrics] configured=false REASON: ${reason}`);
  }

  // Fetch current and previous periods in parallel
  const [
    ga4Current, ga4Previous,
    gscCurrent, gscPrevious,
    gbp,
  ] = await Promise.allSettled([
    hasGA4 ? queryGA4(auth, website.ga4.propertyId, startDate, endDate)   : Promise.resolve(null),
    hasGA4 ? queryGA4(auth, website.ga4.propertyId, prevStart, prevEnd)   : Promise.resolve(null),
    hasGSC ? queryGSC(auth, website.gsc.siteUrl, startDate, endDate)      : Promise.resolve(null),
    hasGSC ? queryGSC(auth, website.gsc.siteUrl, prevStart, prevEnd)      : Promise.resolve(null),
    queryGBP(website._id),
  ]);

  const ok  = (r) => (r.status === 'fulfilled' ? r.value : null);
  // Extracts the error message from a rejected allSettled result for diagnostics
  const err = (r) => (r.status === 'rejected'  ? (r.reason?.message || 'Unknown error') : null);

  const buildChanges = (cur, prev, keys) => {
    if (!cur || !prev) return null;
    const c = {};
    for (const k of keys) {
      c[k] = round1(growth(cur[k] ?? 0, prev[k] ?? 0));
    }
    return c;
  };

  const ga4Keys = ['users', 'newUsers', 'returningUsers', 'sessions', 'engagementRate', 'pageViews'];
  const gscKeys = ['clicks', 'impressions', 'ctr', 'position'];

  // ── Log gsc.current / previous / changes before the result is assembled ───
  const gscCurrentRaw  = ok(gscCurrent);
  const gscPreviousRaw = ok(gscPrevious);
  const gscChangesRaw  = buildChanges(gscCurrentRaw, gscPreviousRaw, gscKeys);

  console.log('[getLiveMetrics] ── GSC RESULT BUILDER ──────────────────────────');
  console.log('[getLiveMetrics] gscCurrent  allSettled status :', gscCurrent.status);
  if (gscCurrent.status === 'rejected') {
    console.log('[getLiveMetrics] gscCurrent  ERROR             :', gscCurrent.reason?.message);
  }
  console.log('[getLiveMetrics] gsc.current  :', JSON.stringify(gscCurrentRaw));
  console.log('[getLiveMetrics] gsc.previous :', JSON.stringify(gscPreviousRaw));
  console.log('[getLiveMetrics] gsc.changes  :', JSON.stringify(gscChangesRaw));
  console.log('[getLiveMetrics] ──────────────────────────────────────────────────');

  const result = {
    ga4: {
      current:  ok(ga4Current),
      previous: ok(ga4Previous),
      changes:  buildChanges(ok(ga4Current), ok(ga4Previous), ga4Keys),
      error:    err(ga4Current),
    },
    gsc: {
      current:  ok(gscCurrent),
      previous: ok(gscPrevious),
      changes:  buildChanges(ok(gscCurrent), ok(gscPrevious), gscKeys),
      // siteUrl and error allow the frontend to show a diagnostic message instead of
      // a silent "not linked" when the property IS configured but the API call failed.
      siteUrl:  hasGSC ? website.gsc.siteUrl : null,
      error:    err(gscCurrent),
      configured: hasGSC,
    },
    gbp:     ok(gbp),
    periods: {
      current:  { startDate, endDate },
      previous: { startDate: prevStart, endDate: prevEnd },
    },
    fetchedAt: new Date().toISOString(),
    fromCache: false,
  };

  cacheSet(cacheKey, result);
  return result;
};

module.exports = { getLiveMetrics };