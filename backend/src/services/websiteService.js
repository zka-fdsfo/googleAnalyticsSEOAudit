const Website = require('../models/Website');
const { listGA4Properties } = require('./googleAnalyticsService');
const { listSearchConsoleSites } = require('./searchConsoleService');

// ── Domain extraction helpers ─────────────────────────────────────────────────

/**
 * Extract a plain domain from a GSC siteUrl.
 * Handles URL-prefix ("https://example.com/") and
 * domain-property ("sc-domain:example.com") formats.
 */
const domainFromGscUrl = (siteUrl = '') => {
  if (siteUrl.startsWith('sc-domain:')) {
    return siteUrl.replace('sc-domain:', '').toLowerCase().trim();
  }
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, '').toLowerCase().trim();
  } catch {
    return siteUrl.toLowerCase().trim();
  }
};

/**
 * Extract a plain domain from a GA4 property display name.
 *
 * BUG FIX: The original implementation split on spaces and took the first word,
 * so "JRT Analytics" → "jrt" which is NOT a domain. Instead, we test whether
 * the entire name (after stripping protocol/www) looks like a domain or URL.
 * If it contains a dot and no spaces, treat it as a domain; otherwise give up.
 */
const domainFromGa4Name = (name = '') => {
  const stripped = name.toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .split('/')[0]
    .trim();

  // Only use as domain if it looks like a hostname (contains dot, no spaces)
  if (stripped.includes('.') && !stripped.includes(' ')) {
    return stripped;
  }
  // Return empty string so caller knows the name is not a URL
  return '';
};

/**
 * Given a set of GSC siteUrls and a GA4 property, determine whether
 * the property matches one of the GSC sites.
 * Returns the matching GSC domain, or null.
 */
const findGSCDomainMatch = (gscSites, ga4PropertyName) => {
  const ga4Domain = domainFromGa4Name(ga4PropertyName);
  if (!ga4Domain) return null;

  for (const site of gscSites) {
    const gscDomain = domainFromGscUrl(site.siteUrl);
    // Both must be non-empty and one must contain the other (handles subdomains)
    if (gscDomain && ga4Domain &&
        (gscDomain === ga4Domain ||
         gscDomain.endsWith('.' + ga4Domain) ||
         ga4Domain.endsWith('.' + gscDomain))) {
      return gscDomain;
    }
  }
  return null;
};

// ── Main discovery ────────────────────────────────────────────────────────────

/**
 * Discovers all GSC + GA4 properties for a user, matches them by domain,
 * and upserts Website documents.
 *
 * BUG FIXES applied:
 *  1. GSC fetch error is now LOGGED (not silently swallowed) and surfaced
 *     in the returned result so callers can report it to the user.
 *  2. Domain matching now requires an actual dot in the domain string —
 *     short words like "jrt" are no longer treated as domains.
 *  3. Existing websites discovered via GA4 are now UPDATED with GSC data
 *     when a matching GSC property is found on re-discovery.
 *  4. The second (GA4-only) loop now compares domains using the same
 *     extraction function used when building the website, preventing
 *     duplicate website documents.
 */
const discoverWebsites = async (user) => {
  let gscError = null;

  const [gscSites, ga4Properties] = await Promise.all([
    listSearchConsoleSites(user).catch((err) => {
      // Log the actual error so server logs show the real reason
      gscError = err.message;
      console.error('[Discovery] GSC sites.list() FAILED — this is why GSC data is missing:', err.message);
      console.error('[Discovery] Common causes: (1) "Google Search Console API" not enabled in Cloud Console, (2) webmasters.readonly scope not granted, (3) token expired');
      return [];
    }),
    listGA4Properties(user).catch((err) => {
      console.error('[Discovery] GA4 properties fetch failed:', err.message);
      return [];
    }),
  ]);

  console.log(`[Discovery] ── GSC sites found: ${gscSites.length} ──────────────────────`);
  gscSites.forEach((s, i) => console.log(`  [gsc ${i}] siteUrl="${s.siteUrl}"  perm="${s.permissionLevel}"  domain="${domainFromGscUrl(s.siteUrl)}"`));

  console.log(`[Discovery] ── GA4 properties found: ${ga4Properties.length} ──────────────────`);
  ga4Properties.forEach((p, i) => console.log(`  [ga4 ${i}] name="${p.name}"  id="${p.id}"  extractedDomain="${domainFromGa4Name(p.name)}"`));

  // Build a quick-lookup map of GSC sites by domain for the second loop
  const gscByDomain = new Map();
  for (const site of gscSites) {
    const d = domainFromGscUrl(site.siteUrl);
    if (d) gscByDomain.set(d, site);
  }
  console.log('[Discovery] gscByDomain keys:', [...gscByDomain.keys()]);

  const created = [];
  const updated = [];

  // ── Pass 1: iterate GSC sites, try to match each to a GA4 property ──────────
  for (const site of gscSites) {
    const domain      = domainFromGscUrl(site.siteUrl);
    const propertyType = site.siteUrl.startsWith('sc-domain:') ? 'DOMAIN' : 'URL_PREFIX';

    console.log(`\n[Discovery Pass1] Website URL : ${site.siteUrl}`);
    console.log(`[Discovery Pass1] Normalised  : "${domain}"`);

    // Find a GA4 property whose name looks like this domain — log EVERY comparison
    const matchedGA4 = ga4Properties.find((p) => {
      const ga4Domain = domainFromGa4Name(p.name);
      const match = !!(ga4Domain && (
        ga4Domain === domain ||
        ga4Domain.endsWith('.' + domain) ||
        domain.endsWith('.' + ga4Domain)
      ));
      console.log(`  Comparing against GA4 "${p.name}" (extracted="${ga4Domain}") → Match Result: ${match}`);
      return match;
    });

    if (matchedGA4) {
      console.log(`[Discovery Pass1] ✓ GA4 match found: "${matchedGA4.name}"`);
    } else {
      console.log(`[Discovery Pass1] ✗ No GA4 match for GSC domain "${domain}"`);
    }

    const gscData = {
      siteUrl:         site.siteUrl,
      propertyType,
      permissionLevel: site.permissionLevel,
      isVerifiedOwner: site.permissionLevel === 'siteOwner',
    };

    const existing = await Website.findOne({ userId: user._id, domain });
    console.log(`[Discovery Pass1] DB lookup domain="${domain}" → ${existing ? `FOUND _id=${existing._id}` : 'NOT FOUND'}`);

    if (existing) {
      console.log(`[Discovery Pass1] Existing gsc.siteUrl before update: "${existing.gsc?.siteUrl ?? 'null'}"`);
      existing.gsc = gscData;
      if (matchedGA4) {
        existing.ga4 = {
          propertyId:   matchedGA4.id,
          propertyName: matchedGA4.name,
          accountId:    matchedGA4.accountId,
          accountName:  matchedGA4.accountName,
        };
      }
      await existing.save();
      console.log(`[Discovery Pass1] ✓ Updated _id=${existing._id} domain="${domain}" gsc.siteUrl="${gscData.siteUrl}"`);
      updated.push(existing);
    } else {
      const websiteData = { domain, displayName: domain, gsc: gscData };
      if (matchedGA4) {
        websiteData.ga4 = {
          propertyId:   matchedGA4.id,
          propertyName: matchedGA4.name,
          accountId:    matchedGA4.accountId,
          accountName:  matchedGA4.accountName,
        };
      }
      const newSite = await Website.create({ userId: user._id, ...websiteData });
      console.log(`[Discovery Pass1] ✓ Created _id=${newSite._id} domain="${domain}" gsc.siteUrl="${gscData.siteUrl}"`);
      created.push(newSite);
    }
  }

  console.log('\n[Discovery] ── Pass 1 complete ─────────────────────────────────────────');

  // ── Pass 2: iterate GA4 properties — create website only if not already done ─
  // "Already handled" = the website we just created/updated in Pass 1 covers this domain.
  // We use the SAME domain extraction (domainFromGa4Name) here so the comparison is consistent.
  for (const prop of ga4Properties) {
    const ga4Domain = domainFromGa4Name(prop.name);
    if (!ga4Domain) {
      console.warn(`[Discovery] GA4 property "${prop.name}" has no extractable domain — skipping`);
      continue;
    }

    // Check pass-1 results using the same key used to create those websites
    const alreadyHandled = [...created, ...updated].some((w) => {
      const wDomain = w.domain || '';
      return (
        wDomain === ga4Domain ||
        wDomain.endsWith('.' + ga4Domain) ||
        ga4Domain.endsWith('.' + wDomain)
      );
    });

    if (alreadyHandled) continue;

    // Also check DB in case the website was created in a previous discovery run
    const existing = await Website.findOne({ userId: user._id, domain: ga4Domain });
    if (existing) {
      // Existing website for this GA4 domain — update GA4 data and try to link GSC
      existing.ga4 = {
        propertyId:   prop.id,
        propertyName: prop.name,
        accountId:    prop.accountId,
        accountName:  prop.accountName,
      };
      // Try to link a GSC property by domain if one was found
      const matchingGSC = gscByDomain.get(ga4Domain);
      if (matchingGSC && !existing.gsc?.siteUrl) {
        existing.gsc = {
          siteUrl:         matchingGSC.siteUrl,
          propertyType:    matchingGSC.siteUrl.startsWith('sc-domain:') ? 'DOMAIN' : 'URL_PREFIX',
          permissionLevel: matchingGSC.permissionLevel,
          isVerifiedOwner: matchingGSC.permissionLevel === 'siteOwner',
        };
        console.log(`[Discovery] Linked GSC ${matchingGSC.siteUrl} to existing ${ga4Domain}`);
      }
      await existing.save();
      updated.push(existing);
    } else {
      // Brand-new website from GA4 only
      const websiteData = {
        domain:      ga4Domain,
        displayName: prop.name,
        ga4: {
          propertyId:   prop.id,
          propertyName: prop.name,
          accountId:    prop.accountId,
          accountName:  prop.accountName,
        },
      };
      // Try to link a GSC property by domain if one was found
      const matchingGSC = gscByDomain.get(ga4Domain);
      if (matchingGSC) {
        websiteData.gsc = {
          siteUrl:         matchingGSC.siteUrl,
          propertyType:    matchingGSC.siteUrl.startsWith('sc-domain:') ? 'DOMAIN' : 'URL_PREFIX',
          permissionLevel: matchingGSC.permissionLevel,
          isVerifiedOwner: matchingGSC.permissionLevel === 'siteOwner',
        };
      }
      const newSite = await Website.create({ userId: user._id, ...websiteData });
      console.log(`[Discovery] Created GA4-only website ${ga4Domain}${matchingGSC ? ' + GSC' : ''}`);
      created.push(newSite);
    }
  }

  // Set default website if none exists
  const hasDefault = await Website.findOne({ userId: user._id, isDefault: true });
  if (!hasDefault) {
    const first =
      await Website.findOne({ userId: user._id, 'gsc.siteUrl': { $exists: true } }) ||
      await Website.findOne({ userId: user._id });
    if (first) { first.isDefault = true; await first.save(); }
  }

  const result = {
    created:          created.length,
    updated:          updated.length,
    total:            created.length + updated.length,
    gscSiteCount:     gscSites.length,
    ga4PropertyCount: ga4Properties.length,
    gscError:         gscError, // surfaced so the frontend can show a meaningful message
  };
  console.log('[Discovery] Result:', result);
  return result;
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

module.exports = {
  discoverWebsites,
  getUserWebsites,
  getWebsite,
  updateWebsite,
  deleteWebsite,
  domainFromGscUrl,
  domainFromGa4Name,
};