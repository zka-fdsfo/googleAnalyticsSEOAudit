const Website = require('../models/Website');
const { listGA4Properties } = require('./googleAnalyticsService');
const { listSearchConsoleSites } = require('./searchConsoleService');

/**
 * Extracts a plain domain from a GSC siteUrl.
 * Handles both URL-prefix ("https://example.com/") and
 * domain-property ("sc-domain:example.com") formats.
 */
const domainFromGscUrl = (siteUrl = '') => {
  if (siteUrl.startsWith('sc-domain:')) {
    return siteUrl.replace('sc-domain:', '').toLowerCase();
  }
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return siteUrl.toLowerCase();
  }
};

const domainFromGa4Name = (name = '') =>
  name.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].split(' ')[0];

/**
 * Discovers all GSC + GA4 properties for a user, matches them by domain,
 * and upserts Website documents. Called after OAuth and on manual refresh.
 */
const discoverWebsites = async (user) => {
  const [gscSites, ga4Properties] = await Promise.all([
    listSearchConsoleSites(user).catch(() => []),
    listGA4Properties(user).catch(() => []),
  ]);

  const created = [];
  const updated = [];

  for (const site of gscSites) {
    const domain = domainFromGscUrl(site.siteUrl);
    const propertyType = site.siteUrl.startsWith('sc-domain:') ? 'DOMAIN' : 'URL_PREFIX';

    // Best-effort GA4 match by domain
    const matchedGA4 = ga4Properties.find((p) => {
      const ga4Domain = domainFromGa4Name(p.name);
      return ga4Domain.includes(domain) || domain.includes(ga4Domain);
    });

    const websiteData = {
      domain,
      displayName: domain,
      gsc: {
        siteUrl:         site.siteUrl,   // exact value from API — always correct
        propertyType,
        permissionLevel: site.permissionLevel,
        isVerifiedOwner: site.permissionLevel === 'siteOwner',
      },
    };

    if (matchedGA4) {
      websiteData.ga4 = {
        propertyId:   matchedGA4.id,
        propertyName: matchedGA4.name,
        accountId:    matchedGA4.accountId,
        accountName:  matchedGA4.accountName,
      };
    }

    const existing = await Website.findOne({ userId: user._id, domain });
    if (existing) {
      // Update GSC data; preserve manually-set GA4 if no new match found
      existing.gsc = websiteData.gsc;
      if (matchedGA4) existing.ga4 = websiteData.ga4;
      await existing.save();
      updated.push(existing);
    } else {
      const created_ = await Website.create({ userId: user._id, ...websiteData });
      created.push(created_);
    }
  }

  // Also add GA4 properties that have no GSC match (Analytics-only sites)
  for (const prop of ga4Properties) {
    const domain = domainFromGa4Name(prop.name);
    const alreadyHandled = [...created, ...updated].some((w) => w.domain === domain);
    if (!alreadyHandled && domain) {
      const existing = await Website.findOne({ userId: user._id, domain });
      if (!existing) {
        const w = await Website.create({
          userId:      user._id,
          domain,
          displayName: prop.name,
          ga4: {
            propertyId:   prop.id,
            propertyName: prop.name,
            accountId:    prop.accountId,
            accountName:  prop.accountName,
          },
        });
        created.push(w);
      }
    }
  }

  // Set default website if none is set
  const hasDefault = await Website.findOne({ userId: user._id, isDefault: true });
  if (!hasDefault) {
    const first = await Website.findOne({ userId: user._id, 'gsc.siteUrl': { $exists: true } })
      || await Website.findOne({ userId: user._id });
    if (first) {
      first.isDefault = true;
      await first.save();
    }
  }

  return { created: created.length, updated: updated.length, total: created.length + updated.length };
};

const getUserWebsites = (userId) =>
  Website.find({ userId }).sort({ isDefault: -1, domain: 1 });

const getWebsite = (websiteId, userId) =>
  Website.findOne({ _id: websiteId, userId });

const updateWebsite = async (websiteId, userId, patch) => {
  const allowed = ['displayName', 'ga4.propertyId', 'ga4.propertyName', 'ga4.accountId', 'ga4.accountName', 'isDefault'];
  const update = {};
  for (const key of allowed) {
    if (patch[key] !== undefined) update[key] = patch[key];
  }
  return Website.findOneAndUpdate({ _id: websiteId, userId }, { $set: update }, { new: true });
};

const deleteWebsite = (websiteId, userId) =>
  Website.findOneAndDelete({ _id: websiteId, userId });

module.exports = { discoverWebsites, getUserWebsites, getWebsite, updateWebsite, deleteWebsite, domainFromGscUrl };
