const { google } = require('googleapis');
const { createOAuth2Client } = require('../utils/googleAuth');

const listSearchConsoleSites = async (user) => {
  const auth = createOAuth2Client(user);
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  const response = await searchconsole.sites.list();

  // ── Full raw response for debugging ───────────────────────────────────────
  console.log('[GSC sites.list()] HTTP status:', response.status);
  console.log('[GSC sites.list()] Raw response.data:', JSON.stringify(response.data, null, 2));

  const entries = response.data.siteEntry || [];
  console.log(`[GSC sites.list()] siteEntry count: ${entries.length}`);
  entries.forEach((s, i) => {
    console.log(`  [${i}] siteUrl="${s.siteUrl}"  permissionLevel="${s.permissionLevel}"`);
  });

  return entries.map((site) => ({
    siteUrl:         site.siteUrl,
    permissionLevel: site.permissionLevel,
  }));
};

const getSearchConsoleReport = async (user, siteUrl) => {
  const auth = createOAuth2Client(user);
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  const endDate   = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 28);
  const fmt = (d) => d.toISOString().split('T')[0];

  const base = {
    startDate:  fmt(startDate),
    endDate:    fmt(endDate),
    searchType: 'web',           // fix: was 'type' (deprecated)
    dataState:  'final',
  };

  const [overviewData, keywordsData, pagesData, devicesData, countriesData] = await Promise.all([
    // Overview — no dimensions, returns totals
    searchconsole.searchanalytics.query({ siteUrl, requestBody: base }),

    // Top queries
    searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        ...base,
        dimensions: ['query'],
        rowLimit:   10,
        // fix: correct field name is 'fieldName' not 'field'
        // but Search Console v1 doesn't actually support orderBy in the public API
        // — results come back ordered by impressions desc by default
      },
    }),

    // Top pages
    searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: { ...base, dimensions: ['page'], rowLimit: 10 },
    }),

    // Devices
    searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: { ...base, dimensions: ['device'] },
    }),

    // Countries
    searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: { ...base, dimensions: ['country'], rowLimit: 5 },
    }),
  ]);

  // GSC returns totals in rows[0], not at data root.
  const overview    = overviewData.data?.rows?.[0] || {};
  const topKeywords = (keywordsData.data?.rows || []).map((row) => ({
    query:       row.keys[0],
    clicks:      row.clicks,
    impressions: row.impressions,
    ctr:         parseFloat((row.ctr * 100).toFixed(2)),
    position:    parseFloat(row.position.toFixed(1)),
  }));

  const topPages = (pagesData.data?.rows || []).map((row) => ({
    page:        row.keys[0],
    clicks:      row.clicks,
    impressions: row.impressions,
    ctr:         parseFloat((row.ctr * 100).toFixed(2)),
    position:    parseFloat(row.position.toFixed(1)),
  }));

  const devices = (devicesData.data?.rows || []).map((row) => ({
    device:      row.keys[0],
    clicks:      row.clicks,
    impressions: row.impressions,
    ctr:         parseFloat((row.ctr * 100).toFixed(2)),
    position:    parseFloat(row.position.toFixed(1)),
  }));

  const countries = (countriesData.data?.rows || []).map((row) => ({
    country:     row.keys[0],
    clicks:      row.clicks,
    impressions: row.impressions,
  }));

  return {
    overview: {
      clicks:      overview.clicks      || 0,
      impressions: overview.impressions || 0,
      ctr:         parseFloat(((overview.ctr || 0) * 100).toFixed(2)),
      position:    parseFloat((overview.position || 0).toFixed(1)),
    },
    topKeywords,
    topPages,
    devices,
    countries,
    dateRange: { startDate: fmt(startDate), endDate: fmt(endDate) },
  };
};

const getSearchConsoleTimeseries = async (user, siteUrl, days = 28) => {
  const auth = createOAuth2Client(user);
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  const endDate   = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);
  const fmt = (d) => d.toISOString().split('T')[0];

  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate:  fmt(startDate),
      endDate:    fmt(endDate),
      dimensions: ['date'],
      searchType: 'web',
    },
  });

  return (response.data?.rows || []).map((row) => ({
    date:        row.keys[0],
    clicks:      row.clicks,
    impressions: row.impressions,
    ctr:         parseFloat((row.ctr * 100).toFixed(2)),
    position:    parseFloat(row.position.toFixed(1)),
  }));
};

const getIndexingStatus = async (user, siteUrl, pageUrl) => {
  const auth = createOAuth2Client(user);
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  try {
    const response = await searchconsole.urlInspection.index.inspect({
      requestBody: { inspectionUrl: pageUrl, siteUrl },
    });
    const result = response.data?.inspectionResult;
    return {
      indexingState:  result?.indexStatusResult?.indexingState,
      lastCrawlTime:  result?.indexStatusResult?.lastCrawlTime,
      coverageState:  result?.indexStatusResult?.coverageState,
      robotsTxtState: result?.indexStatusResult?.robotsTxtState,
      crawledAs:      result?.indexStatusResult?.crawledAs,
    };
  } catch {
    return null;
  }
};

module.exports = {
  listSearchConsoleSites,
  getSearchConsoleReport,
  getSearchConsoleTimeseries,
  getIndexingStatus,
};
