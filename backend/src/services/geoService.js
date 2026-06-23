const GeoSnapshot = require('../models/GeoSnapshot');
const { google } = require('googleapis');
const { createOAuth2Client } = require('../utils/googleAuth');

// ISO 3166-1 alpha-2 lookup for common country names returned by GA4
const COUNTRY_CODES = {
  'United States': 'US', 'United Kingdom': 'GB', 'Canada': 'CA', 'Australia': 'AU',
  'Germany': 'DE', 'France': 'FR', 'India': 'IN', 'Brazil': 'BR', 'Mexico': 'MX',
  'Netherlands': 'NL', 'Spain': 'ES', 'Italy': 'IT', 'Japan': 'JP', 'South Korea': 'KR',
  'Russia': 'RU', 'China': 'CN', 'Poland': 'PL', 'Sweden': 'SE', 'Norway': 'NO',
  'Denmark': 'DK', 'Finland': 'FI', 'Switzerland': 'CH', 'Austria': 'AT', 'Belgium': 'BE',
  'Portugal': 'PT', 'Turkey': 'TR', 'Indonesia': 'ID', 'Pakistan': 'PK', 'Nigeria': 'NG',
  'South Africa': 'ZA', 'Argentina': 'AR', 'Colombia': 'CO', 'Chile': 'CL', 'Peru': 'PE',
  'Thailand': 'TH', 'Vietnam': 'VN', 'Philippines': 'PH', 'Malaysia': 'MY', 'Singapore': 'SG',
  'Bangladesh': 'BD', 'Egypt': 'EG', 'Saudi Arabia': 'SA', 'United Arab Emirates': 'AE',
  'Israel': 'IL', 'Iran': 'IR', 'Ukraine': 'UA', 'Romania': 'RO', 'Czech Republic': 'CZ',
  'Hungary': 'HU', 'Greece': 'GR', 'New Zealand': 'NZ', 'Ireland': 'IE',
};
const getCountryCode = (name) => COUNTRY_CODES[name] || name?.slice(0, 2).toUpperCase() || 'XX';

const dayStart = (d = new Date()) => {
  const date = new Date(d);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

/**
 * Syncs geographic data from GA4 (country + city) and merges with existing GSC country data.
 * Called as part of the daily website sync.
 */
const syncGeoSnapshot = async (website, user) => {
  if (!website.ga4?.propertyId) return null;

  const auth = createOAuth2Client(user);
  const analyticsData = google.analyticsdata({ version: 'v1beta', auth });
  const propertyId = website.ga4.propertyId;

  const [countryReport, cityReport] = await Promise.all([
    analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'country' }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'newUsers' },
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 50,
      },
    }),
    analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'city' }, { name: 'country' }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'screenPageViews' },
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 100,
      },
    }),
  ]);

  const countries = (countryReport.data?.rows || []).map((r) => ({
    country:     r.dimensionValues[0]?.value,
    countryCode: getCountryCode(r.dimensionValues[0]?.value),
    sessions:    parseInt(r.metricValues[0]?.value) || 0,
    users:       parseInt(r.metricValues[1]?.value) || 0,
    pageViews:   parseInt(r.metricValues[2]?.value) || 0,
    bounceRate:  parseFloat((parseFloat(r.metricValues[3]?.value || 0) * 100).toFixed(1)),
    newUsers:    parseInt(r.metricValues[4]?.value) || 0,
    // GSC data merged in separately
    clicks: 0, impressions: 0, ctr: 0, position: 0,
  }));

  const cities = (cityReport.data?.rows || []).map((r) => ({
    city:        r.dimensionValues[0]?.value,
    country:     r.dimensionValues[1]?.value,
    countryCode: getCountryCode(r.dimensionValues[1]?.value),
    sessions:    parseInt(r.metricValues[0]?.value) || 0,
    users:       parseInt(r.metricValues[1]?.value) || 0,
    pageViews:   parseInt(r.metricValues[2]?.value) || 0,
    clicks: 0, impressions: 0,
  }));

  // Merge GSC country-level data if available
  const SearchConsoleSnapshot = require('../models/SearchConsoleSnapshot');
  const gscSnap = await SearchConsoleSnapshot.findOne({ websiteId: website._id })
    .sort({ date: -1 })
    .lean();

  if (gscSnap?.countries) {
    const gscMap = new Map((gscSnap.countries || []).map((c) => [c.country?.toLowerCase(), c]));
    countries.forEach((c) => {
      const gsc = gscMap.get(c.country?.toLowerCase());
      if (gsc) {
        c.clicks      = gsc.clicks || 0;
        c.impressions = gsc.impressions || 0;
        c.ctr         = gsc.ctr || 0;
        c.position    = gsc.position || 0;
      }
    });
  }

  return GeoSnapshot.findOneAndUpdate(
    { websiteId: website._id, date: dayStart() },
    { $set: { websiteId: website._id, userId: website.userId, date: dayStart(), countries, cities, fetchedAt: new Date() } },
    { upsert: true, new: true }
  );
};

/**
 * Returns the latest geo snapshot for a website, with period-over-period growth per country.
 */
const getLatestGeoSnapshot = async (websiteId, userId, days = 30) => {
  const [current, previous] = await Promise.all([
    GeoSnapshot.findOne({ websiteId, userId }).sort({ date: -1 }).lean(),
    // Compare against the snapshot `days` ago so the growth matches the selected period.
    GeoSnapshot.find({ websiteId, userId }).sort({ date: -1 }).skip(days).limit(1).lean(),
  ]);

  if (!current) return null;

  const prevMap = new Map((previous[0]?.countries || []).map((c) => [c.country, c]));

  const countriesWithGrowth = current.countries.map((c) => {
    const prev = prevMap.get(c.country);
    return {
      ...c,
      sessionsChange:    prev ? parseFloat(((c.sessions - prev.sessions) / Math.max(prev.sessions, 1) * 100).toFixed(1)) : null,
      clicksChange:      prev ? parseFloat(((c.clicks - prev.clicks) / Math.max(prev.clicks, 1) * 100).toFixed(1)) : null,
      impressionsChange: prev ? parseFloat(((c.impressions - prev.impressions) / Math.max(prev.impressions, 1) * 100).toFixed(1)) : null,
    };
  });

  return { ...current, countries: countriesWithGrowth };
};

/**
 * Aggregates geo data across multiple snapshots for trend analysis.
 */
const getGeoTrend = async (websiteId, userId, countryCode, days = 30) => {
  const snapshots = await GeoSnapshot.find({ websiteId, userId })
    .sort({ date: -1 })
    .limit(days)
    .lean();

  return snapshots
    .reverse()
    .map((s) => {
      const country = s.countries.find((c) => c.countryCode === countryCode);
      return {
        date:        s.date,
        sessions:    country?.sessions || 0,
        users:       country?.users || 0,
        clicks:      country?.clicks || 0,
        impressions: country?.impressions || 0,
      };
    });
};

module.exports = { syncGeoSnapshot, getLatestGeoSnapshot, getGeoTrend };
