const { google } = require('googleapis');
const { createOAuth2Client } = require('../utils/googleAuth');

// ── Bug fix: was using properties.list({ filter: 'parent:accounts/-' }) which
// returns empty for most users. accountSummaries.list() is the correct API —
// it returns ALL accessible accounts + properties in a single paginated call.
const listGA4Accounts = async (user) => {
  const auth = createOAuth2Client(user);
  const analyticsAdmin = google.analyticsadmin({ version: 'v1beta', auth });

  const response = await analyticsAdmin.accounts.list();
  return (response.data.accounts || []).map((a) => ({
    id:          a.name?.replace('accounts/', ''),
    name:        a.displayName,
    createTime:  a.createTime,
    updateTime:  a.updateTime,
  }));
};

const listGA4Properties = async (user) => {
  const auth = createOAuth2Client(user);
  const analyticsAdmin = google.analyticsadmin({ version: 'v1beta', auth });

  // accountSummaries returns all accounts + their properties for the authed user
  const response = await analyticsAdmin.accountSummaries.list({ pageSize: 200 });

  const properties = [];
  for (const account of (response.data.accountSummaries || [])) {
    for (const prop of (account.propertySummaries || [])) {
      properties.push({
        id:           prop.property?.replace('properties/', ''),
        name:         prop.displayName,
        accountId:    account.account?.replace('accounts/', ''),
        accountName:  account.displayName,
        propertyType: prop.propertyType,
      });
    }
  }
  return properties;
};

const getGA4Report = async (user, propertyId, dateRange = { startDate: '30daysAgo', endDate: 'today' }) => {
  const auth = createOAuth2Client(user);
  const analyticsData = google.analyticsdata({ version: 'v1beta', auth });

  const [mainReport, trafficReport, pageReport, deviceReport] = await Promise.all([
    // Summary metrics (no dimensions → single aggregated row)
    analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'newUsers' },
          { name: 'screenPageViews' },
          { name: 'engagementRate' },
        ],
      },
    }),
    // Traffic by channel
    analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
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
        dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        metrics:    [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'bounceRate' }],
        orderBys:   [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      },
    }),
    // Device category
    analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
        dimensions: [{ name: 'deviceCategory' }],
        metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
      },
    }),
  ]);

  // For reports without dimensions, the aggregate sits in rows[0]
  const getMetricValue = (report, idx) => {
    const rows = report.data?.rows;
    if (!rows?.length) return 0;
    return parseFloat(rows[0]?.metricValues?.[idx]?.value) || 0;
  };

  const users          = getMetricValue(mainReport, 0);
  const sessions       = getMetricValue(mainReport, 1);
  const bounceRate     = getMetricValue(mainReport, 2);
  const avgDuration    = getMetricValue(mainReport, 3);
  const newUsers       = getMetricValue(mainReport, 4);
  const pageViews      = getMetricValue(mainReport, 5);
  const engagementRate = getMetricValue(mainReport, 6);

  const trafficSources = (trafficReport.data?.rows || []).map((row) => ({
    channel:  row.dimensionValues[0]?.value || 'Other',
    sessions: parseInt(row.metricValues[0]?.value) || 0,
    users:    parseInt(row.metricValues[1]?.value) || 0,
  }));

  const topPages = (pageReport.data?.rows || []).map((row) => ({
    path:       row.dimensionValues[0]?.value || '/',
    title:      row.dimensionValues[1]?.value || '',
    pageViews:  parseInt(row.metricValues[0]?.value) || 0,
    users:      parseInt(row.metricValues[1]?.value) || 0,
    bounceRate: parseFloat(row.metricValues[2]?.value || 0).toFixed(1),
  }));

  const devices = (deviceReport.data?.rows || []).map((row) => ({
    device:   row.dimensionValues[0]?.value || 'Other',
    sessions: parseInt(row.metricValues[0]?.value) || 0,
    users:    parseInt(row.metricValues[1]?.value) || 0,
  }));

  return {
    overview: {
      users:                Math.round(users),
      sessions:             Math.round(sessions),
      bounceRate:           parseFloat((bounceRate * 100).toFixed(1)),
      engagementRate:       parseFloat((engagementRate * 100).toFixed(1)),
      avgSessionDuration:   Math.round(avgDuration),
      newUsers:             Math.round(newUsers),
      pageViews:            Math.round(pageViews),
    },
    trafficSources,
    topPages,
    devices,
    dateRange,
  };
};

const getGA4Timeseries = async (user, propertyId, days = 30) => {
  const auth = createOAuth2Client(user);
  const analyticsData = google.analyticsdata({ version: 'v1beta', auth });

  const response = await analyticsData.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys:   [{ dimension: { dimensionName: 'date' } }],
    },
  });

  return (response.data?.rows || []).map((row) => ({
    date:     row.dimensionValues[0]?.value,
    sessions: parseInt(row.metricValues[0]?.value) || 0,
    users:    parseInt(row.metricValues[1]?.value) || 0,
  }));
};

module.exports = { listGA4Accounts, listGA4Properties, getGA4Report, getGA4Timeseries };
