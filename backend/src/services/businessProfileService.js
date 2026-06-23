/**
 * Google Business Profile Service
 *
 * SETUP REQUIRED:
 * 1. Enable "My Business Account Management API" and "My Business Business Information API"
 *    in Google Cloud Console → APIs & Services → Library
 * 2. Add OAuth scope to passport.js and the auth route:
 *    'https://www.googleapis.com/auth/business.manage'
 * 3. Re-authenticate existing users to grant the new scope
 *
 * The GBP API uses v4 endpoints under mybusiness.googleapis.com
 */

const { google } = require('googleapis');
const { createOAuth2Client } = require('../utils/googleAuth');
const BusinessProfile = require('../models/BusinessProfile');
const Website = require('../models/Website');
const User = require('../models/User');

/**
 * Lists all GBP accounts for a user.
 */
const listGBPAccounts = async (user) => {
  const auth = createOAuth2Client(user);
  const mybusiness = google.mybusinessaccountmanagement({ version: 'v1', auth });

  try {
    const res = await mybusiness.accounts.list();
    return (res.data.accounts || []).map((a) => ({
      accountId:   a.name,
      accountName: a.accountName,
      type:        a.type,
    }));
  } catch (err) {
    if (err.message?.includes('disabled') || err.message?.includes('not been used')) {
      throw new Error('Google Business Profile API is not enabled. Enable "My Business Account Management API" in Google Cloud Console.');
    }
    throw err;
  }
};

/**
 * Lists GBP locations (business listings) for an account.
 */
const listGBPLocations = async (user, accountId) => {
  const auth = createOAuth2Client(user);
  const mybusiness = google.mybusinessbusinessinformation({ version: 'v1', auth });

  const res = await mybusiness.accounts.locations.list({
    parent: accountId,
    readMask: 'name,title,phoneNumbers,websiteUri,categories,storefrontAddress,latlng',
  });

  return (res.data.locations || []).map((l) => ({
    locationId:   l.name,
    businessName: l.title,
    phone:        l.phoneNumbers?.primaryPhone,
    website:      l.websiteUri,
    address:      l.storefrontAddress
      ? `${l.storefrontAddress.addressLines?.join(', ')}, ${l.storefrontAddress.locality}`
      : null,
    category: l.categories?.primaryCategory?.displayName,
  }));
};

/**
 * Syncs GBP insights for a specific location.
 * Note: Insights API is v4 (mybusiness.googleapis.com/v4).
 */
const syncGBPInsights = async (websiteId) => {
  const website = await Website.findById(websiteId);
  if (!website) throw new Error('Website not found');

  const user = await User.findById(website.userId)
    .select('+google.accessToken +google.refreshToken +google.expiresAt');
  if (!user?.isGoogleConnected) throw new Error('Google account not connected');

  const profile = await BusinessProfile.findOne({ websiteId });
  if (!profile?.accountId || !profile?.locationId) {
    throw new Error('GBP not configured for this website. Link a Business Profile in Settings first.');
  }

  const auth = createOAuth2Client(user);

  // GBP Insights v4 (older API still active for insights)
  const endDate   = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 28);

  const formatDate = (d) => ({
    year:  d.getFullYear(),
    month: d.getMonth() + 1,
    day:   d.getDate(),
  });

  try {
    const mybusinessv4 = google.mybusiness({ version: 'v4', auth });
    const insightsRes  = await mybusinessv4.accounts.locations.reportInsights({
      name: profile.accountId,
      requestBody: {
        locationNames: [profile.locationId],
        basicRequest: {
          metricRequests: [
            { metric: 'QUERIES_DIRECT' },
            { metric: 'QUERIES_INDIRECT' },
            { metric: 'VIEWS_MAPS' },
            { metric: 'VIEWS_SEARCH' },
            { metric: 'ACTIONS_WEBSITE' },
            { metric: 'ACTIONS_PHONE' },
            { metric: 'ACTIONS_DRIVING_DIRECTIONS' },
          ],
          timeRange: {
            startTime: startDate.toISOString(),
            endTime:   endDate.toISOString(),
          },
        },
      },
    });

    const insights = insightsRes.data?.locationMetrics?.[0]?.metricValues || [];
    const getMetric = (name) =>
      insights.find((m) => m.metric === name)?.totalValue?.value || 0;

    const snapshot = {
      date:              new Date(),
      searchViews:       parseInt(getMetric('VIEWS_SEARCH'))  || 0,
      mapsViews:         parseInt(getMetric('VIEWS_MAPS'))    || 0,
      totalViews:        parseInt(getMetric('VIEWS_SEARCH'))  + parseInt(getMetric('VIEWS_MAPS')) || 0,
      websiteClicks:     parseInt(getMetric('ACTIONS_WEBSITE'))           || 0,
      phoneCalls:        parseInt(getMetric('ACTIONS_PHONE'))             || 0,
      directionRequests: parseInt(getMetric('ACTIONS_DRIVING_DIRECTIONS'))|| 0,
      messages:          0,
      bookings:          0,
      fetchedAt:         new Date(),
    };

    await BusinessProfile.findOneAndUpdate(
      { websiteId },
      {
        $set:  { latest: snapshot, isConnected: true, lastSyncedAt: new Date(), syncError: null },
        $push: { history: { $each: [snapshot], $slice: -365 } },
      },
      { upsert: true }
    );

    return snapshot;
  } catch (err) {
    await BusinessProfile.findOneAndUpdate(
      { websiteId },
      { $set: { syncError: err.message, lastSyncedAt: new Date() } },
      { upsert: true }
    );
    throw err;
  }
};

const getBusinessProfile = async (websiteId, userId) => {
  return BusinessProfile.findOne({ websiteId }).lean();
};

const linkBusinessProfile = async (websiteId, userId, { accountId, locationId, businessName }) => {
  return BusinessProfile.findOneAndUpdate(
    { websiteId },
    { $set: { websiteId, userId, accountId, locationId, businessName, isConnected: false } },
    { upsert: true, new: true }
  );
};

module.exports = {
  listGBPAccounts,
  listGBPLocations,
  syncGBPInsights,
  getBusinessProfile,
  linkBusinessProfile,
};