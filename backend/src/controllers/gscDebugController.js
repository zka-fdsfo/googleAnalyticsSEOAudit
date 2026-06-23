/**
 * GSC Debug & Manual-Link Controller
 *
 * GET  /api/debug/gsc
 *   Full diagnostic: token info, granted scopes, raw Search Console API response,
 *   discovered properties, domain-matching results, and current DB state.
 *   Use this endpoint first whenever GSC data is missing.
 *
 * PUT  /api/websites/:id/gsc-link
 *   Manually link a Search Console siteUrl to a specific website document.
 *   Body: { siteUrl: "https://example.com/" }
 */

const Website  = require('../models/Website');
const User     = require('../models/User');
const { google }             = require('googleapis');
const { createOAuth2Client, getTokenInfo } = require('../utils/googleAuth');
const { listSearchConsoleSites }           = require('../services/searchConsoleService');
const { domainFromGscUrl }                 = require('../services/websiteService');

// ── GET /api/debug/gsc ────────────────────────────────────────────────────────

const debugGSC = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      '+google.accessToken +google.refreshToken +google.expiresAt +google.email'
    );

    const result = {
      step1_token: {},
      step2_scopes: {},
      step3_gsc_api: {},
      step4_db_websites: [],
      step5_matching: [],
      summary: '',
    };

    // ── Step 1: Token health ─────────────────────────────────────────────────
    result.step1_token = {
      isGoogleConnected: user?.isGoogleConnected || false,
      hasAccessToken:    !!user?.google?.accessToken,
      hasRefreshToken:   !!user?.google?.refreshToken,
      tokenExpiresAt:    user?.google?.expiresAt || null,
      tokenExpired:      user?.google?.expiresAt
        ? new Date(user.google.expiresAt) < new Date()
        : null,
    };

    if (!user?.isGoogleConnected) {
      result.summary = 'FAIL: Google account not connected. Go to Settings → Connect Google Account.';
      return res.json(result);
    }

    // ── Step 2: Verify granted scopes ────────────────────────────────────────
    try {
      const tokenInfo = await getTokenInfo(user);
      result.step2_scopes = {
        ok:             tokenInfo.valid,
        scopes:         tokenInfo.scopes || [],
        hasWebmasters:  (tokenInfo.scopes || []).some((s) => s.includes('webmaster')),
        hasAnalytics:   (tokenInfo.scopes || []).some((s) => s.includes('analytics')),
        email:          tokenInfo.email,
        expiresIn:      tokenInfo.expiresIn,
        rawError:       tokenInfo.error || null,
      };

      if (!result.step2_scopes.hasWebmasters) {
        result.summary =
          'FAIL: The webmasters.readonly scope is NOT in the granted token scopes. ' +
          'Disconnect and reconnect your Google account to re-grant all permissions.';
        return res.json(result);
      }
    } catch (err) {
      result.step2_scopes = { ok: false, error: err.message };
      result.summary = `FAIL: Could not verify token scopes: ${err.message}`;
      return res.json(result);
    }

    // ── Step 3: Raw Search Console API call ──────────────────────────────────
    try {
      const auth = createOAuth2Client(user);
      const sc   = google.searchconsole({ version: 'v1', auth });

      // Make the raw API call and capture the full response
      const rawResponse = await sc.sites.list();
      const siteEntries = rawResponse.data.siteEntry || [];

      result.step3_gsc_api = {
        ok:           true,
        httpStatus:   rawResponse.status,
        siteCount:    siteEntries.length,
        sites:        siteEntries.map((s) => ({
          siteUrl:         s.siteUrl,
          permissionLevel: s.permissionLevel,
          extractedDomain: domainFromGscUrl(s.siteUrl),
        })),
        rawMessage:   siteEntries.length === 0
          ? 'API returned 0 sites. This means either (a) your Google account has no Search Console properties, or (b) none are verified.'
          : null,
      };
    } catch (err) {
      const isNotEnabled = /has not been used|SERVICE_DISABLED|is disabled/i.test(err.message);
      const isAuthError  = /insufficient.authentication|403|invalid_grant/i.test(err.message);

      result.step3_gsc_api = {
        ok:         false,
        error:      err.message,
        httpStatus: err.code || err.status || null,
        diagnosis:  isNotEnabled
          ? 'The "Google Search Console API" is NOT enabled in your Google Cloud project. ' +
            'Go to console.cloud.google.com → APIs & Services → Library → search "Google Search Console API" → Enable.'
          : isAuthError
          ? 'Authentication error. The token may lack the webmasters.readonly scope. Disconnect and reconnect Google.'
          : 'Unknown API error. Check the rawError field.',
      };
      result.summary = `FAIL: GSC API call failed — ${result.step3_gsc_api.diagnosis}`;
      return res.json(result);
    }

    // ── Step 4: Current DB state ─────────────────────────────────────────────
    const dbWebsites = await Website.find({ userId: user._id }).lean();
    result.step4_db_websites = dbWebsites.map((w) => ({
      _id:          w._id,
      domain:       w.domain,
      gscSiteUrl:   w.gsc?.siteUrl   || null,
      ga4PropertyId:w.ga4?.propertyId || null,
      syncStatus:   w.syncStatus,
    }));

    // ── Step 5: Domain matching ──────────────────────────────────────────────
    const sites = result.step3_gsc_api.sites || [];
    for (const site of sites) {
      const gscDomain  = site.extractedDomain;
      const dbMatch    = dbWebsites.find((w) => w.domain === gscDomain);
      result.step5_matching.push({
        gscSiteUrl:    site.siteUrl,
        extractedDomain: gscDomain,
        dbWebsiteFound: !!dbMatch,
        dbDomain:       dbMatch?.domain || null,
        currentlyLinked: !!(dbMatch?.gsc?.siteUrl),
        willBeLinked:   !!dbMatch,
      });
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const gscCount   = sites.length;
    const linkedCount = result.step5_matching.filter((m) => m.currentlyLinked).length;

    if (gscCount === 0) {
      result.summary =
        'FAIL: Search Console API works but returned 0 properties. ' +
        'Add and verify your website at search.google.com/search-console, then click Rediscover.';
    } else if (linkedCount === 0) {
      result.summary =
        `OK: Found ${gscCount} GSC site(s) but none are linked to website documents yet. ` +
        'Run Rediscover Properties to link them.';
    } else {
      result.summary = `OK: Found ${gscCount} GSC site(s), ${linkedCount} already linked.`;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/websites/:id/gsc-link ────────────────────────────────────────────

const manualGSCLink = async (req, res, next) => {
  try {
    const { siteUrl } = req.body;
    if (!siteUrl) {
      return res.status(400).json({ error: 'siteUrl is required.' });
    }

    const website = await Website.findOne({ _id: req.params.id, userId: req.user._id });
    if (!website) return res.status(404).json({ error: 'Website not found.' });

    // Verify the user actually has access to this siteUrl
    const user = await User.findById(req.user._id)
      .select('+google.accessToken +google.refreshToken +google.expiresAt');

    let permissionLevel = 'siteUnverifiedUser';
    try {
      const sites = await listSearchConsoleSites(user);
      const match = sites.find((s) => s.siteUrl === siteUrl);
      if (!match) {
        return res.status(403).json({
          error: `siteUrl "${siteUrl}" was not found in your Search Console account. ` +
                 `Available sites: ${sites.map((s) => s.siteUrl).join(', ')}`,
        });
      }
      permissionLevel = match.permissionLevel;
    } catch (err) {
      // If we can't verify, still link but warn
      console.warn('[GSC manual link] Could not verify siteUrl ownership:', err.message);
    }

    website.gsc = {
      siteUrl,
      propertyType:    siteUrl.startsWith('sc-domain:') ? 'DOMAIN' : 'URL_PREFIX',
      permissionLevel,
      isVerifiedOwner: permissionLevel === 'siteOwner',
    };
    await website.save();

    console.log(`[GSC manual link] Linked ${siteUrl} to website ${website.domain}`);
    res.json({ message: 'Search Console property linked successfully.', website });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/websites/:id/gsc-sites — list user's available GSC sites ─────────
// Used by the frontend to populate the manual-link dropdown

const listAvailableGSCSites = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select('+google.accessToken +google.refreshToken +google.expiresAt');

    if (!user?.isGoogleConnected) {
      return res.status(403).json({ error: 'Google account not connected.' });
    }

    try {
      const sites = await listSearchConsoleSites(user);
      res.json({ sites });
    } catch (err) {
      const isNotEnabled = /has not been used|SERVICE_DISABLED|is disabled/i.test(err.message);
      res.status(503).json({
        error: err.message,
        diagnosis: isNotEnabled
          ? 'The "Google Search Console API" is not enabled in your Google Cloud project. Enable it at console.cloud.google.com → APIs & Services → Library.'
          : 'GSC API error. Check the error field for details.',
      });
    }
  } catch (err) {
    next(err);
  }
};

// ── GET /api/debug/gsc/:websiteId ─────────────────────────────────────────────
// Full investigation:
//   1. Exact website DB record
//   2. All GSC properties in the user's account (sites.list raw response)
//   3. Domain-match verdict for every discovered property vs website.domain
//   4. Whether the currently-linked property is the CORRECT one
//   5. Live searchanalytics.query against the linked siteUrl (raw request + response)
//   6. Exact reason metrics are zero

const debugGSCByWebsite = async (req, res, next) => {
  try {
    const { websiteId } = req.params;

    // ── 1. Exact website record ───────────────────────────────────────────────
    const website = await Website.findOne({ _id: websiteId, userId: req.user._id }).lean();
    if (!website) {
      return res.status(404).json({ error: `Website ${websiteId} not found for this user.` });
    }

    console.log('[GSC-Debug] ════════════════════════════════════════════════════');
    console.log('[GSC-Debug] websiteId   :', websiteId);
    console.log('[GSC-Debug] domain      :', website.domain);
    console.log('[GSC-Debug] gsc field   :', JSON.stringify(website.gsc));
    console.log('[GSC-Debug] ga4 field   :', JSON.stringify(website.ga4));

    const websiteDomain  = website.domain || '';
    const linkedSiteUrl  = website.gsc?.siteUrl ?? null;

    // ── 2. User credentials ───────────────────────────────────────────────────
    const user = await User.findById(req.user._id)
      .select('+google.accessToken +google.refreshToken +google.expiresAt');

    if (!user?.isGoogleConnected) {
      return res.json({
        website:           { _id: website._id, domain: websiteDomain, gsc: website.gsc ?? null, ga4: website.ga4 ?? null },
        linkedProperty:    linkedSiteUrl,
        allProperties:     null,
        matchingResults:   [],
        liveQueryResult:   null,
        configured:        false,
        reason:            'Google account not connected.',
      });
    }

    const auth = createOAuth2Client(user);
    const sc   = google.searchconsole({ version: 'v1', auth });

    // ── 3. All discovered GSC properties (sites.list) ─────────────────────────
    let allProperties   = [];
    let sitesListError  = null;
    let sitesListRaw    = null;

    try {
      const raw = await sc.sites.list();
      sitesListRaw  = raw.data;
      allProperties = (raw.data.siteEntry || []).map((s) => ({
        siteUrl:         s.siteUrl,
        permissionLevel: s.permissionLevel,
        normalised:      domainFromGscUrl(s.siteUrl),
      }));
      console.log('[GSC-Debug] sites.list returned', allProperties.length, 'properties:');
      allProperties.forEach((p, i) =>
        console.log(`  [${i}] siteUrl="${p.siteUrl}"  normalised="${p.normalised}"  perm="${p.permissionLevel}"`));
    } catch (err) {
      sitesListError = err.message;
      console.error('[GSC-Debug] sites.list ERROR:', err.message);
    }

    // ── 4. Why was this property selected? Domain-match analysis ─────────────
    // For every discovered property, run the same comparison the discovery
    // code uses and record the exact match result so the wrong selection
    // is immediately visible.
    console.log(`\n[GSC-Debug] Domain match analysis — website.domain="${websiteDomain}":`);

    const matchingResults = allProperties.map((prop) => {
      const gscDomain          = prop.normalised;
      const exactMatch         = gscDomain === websiteDomain;
      const gscIsSubdomain     = gscDomain.endsWith('.' + websiteDomain);
      const websiteIsSubdomain = websiteDomain.endsWith('.' + gscDomain);
      const overallMatch       = exactMatch || gscIsSubdomain || websiteIsSubdomain;
      const isCurrentlyLinked  = prop.siteUrl === linkedSiteUrl;

      console.log(
        `  Website URL: ${prop.siteUrl}\n` +
        `  Comparing against: website.domain = "${websiteDomain}"\n` +
        `  gscNormalised="${gscDomain}"  exactMatch=${exactMatch}  ` +
        `gscIsSubdomain=${gscIsSubdomain}  websiteIsSubdomain=${websiteIsSubdomain}\n` +
        `  Match Result: ${overallMatch}  currentlyLinked: ${isCurrentlyLinked}\n`
      );

      return {
        siteUrl:             prop.siteUrl,
        permissionLevel:     prop.permissionLevel,
        normalised:          gscDomain,
        websiteDomain,
        exactMatch,
        gscIsSubdomain,
        websiteIsSubdomain,
        'Match Result':      overallMatch,
        currentlyLinked:     isCurrentlyLinked,
        SHOULD_BE_LINKED:    overallMatch && !isCurrentlyLinked,
      };
    });

    // Identify the best property that should have been linked
    const correctMatch = matchingResults.find((m) => m['Match Result'] && m.exactMatch)
      || matchingResults.find((m) => m['Match Result']);
    const wrongPropertyLinked = linkedSiteUrl && correctMatch && !correctMatch.currentlyLinked;

    if (wrongPropertyLinked) {
      console.log('[GSC-Debug] ⚠ WRONG PROPERTY LINKED:');
      console.log(`  Linked: "${linkedSiteUrl}"`);
      console.log(`  Should be: "${correctMatch.siteUrl}"`);
    }

    // ── 5. Live searchanalytics.query against the linked siteUrl ─────────────
    let liveQueryResult = null;

    if (linkedSiteUrl) {
      // Use last 28 days as the test window
      const endDate   = new Date();
      endDate.setDate(endDate.getDate() - 1); // yesterday — avoid partial today
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 27);
      const fmt = (d) => d.toISOString().split('T')[0];

      const queryRequest = {
        siteUrl:  linkedSiteUrl,
        requestBody: {
          startDate: fmt(startDate),
          endDate:   fmt(endDate),
          searchType: 'web',
        },
      };

      console.log('[GSC-Debug] Live searchanalytics.query REQUEST:');
      console.log(JSON.stringify(queryRequest, null, 2));

      try {
        const overviewResp   = await sc.searchanalytics.query(queryRequest);
        const timeseriesResp = await sc.searchanalytics.query({
          ...queryRequest,
          requestBody: { ...queryRequest.requestBody, dimensions: ['date'] },
        });

        const overviewRows   = overviewResp.data?.rows || [];
        const timeseriesRows = timeseriesResp.data?.rows || [];

        console.log('[GSC-Debug] Live query RESPONSE (overview):');
        console.log(JSON.stringify(overviewResp.data, null, 2));
        console.log('[GSC-Debug] timeseries rows:', timeseriesRows.length);

        // Determine root cause if rows are empty
        let zeroReason = null;
        if (overviewRows.length === 0 && timeseriesRows.length === 0) {
          if (wrongPropertyLinked) {
            zeroReason = `WRONG_PROPERTY: "${linkedSiteUrl}" is linked but it does not match website.domain="${websiteDomain}". The correct property is "${correctMatch?.siteUrl}". Use PUT /api/websites/${websiteId}/gsc-link to fix it.`;
          } else {
            zeroReason = `NO_DATA: The property "${linkedSiteUrl}" is correctly matched to domain="${websiteDomain}" but Google returned 0 rows for ${fmt(startDate)}→${fmt(endDate)}. Either this property genuinely has no organic search traffic, or the data is still processing.`;
          }
          console.log('[GSC-Debug] ZERO ROWS reason:', zeroReason);
        }

        liveQueryResult = {
          requestSent: {
            siteUrl:    linkedSiteUrl,
            startDate:  fmt(startDate),
            endDate:    fmt(endDate),
            searchType: 'web',
          },
          overviewRaw:        overviewResp.data,
          overviewRowCount:   overviewRows.length,
          timeseriesRowCount: timeseriesRows.length,
          zeroReason,
        };
      } catch (err) {
        console.error('[GSC-Debug] searchanalytics.query ERROR:', err.message);
        liveQueryResult = { error: err.message };
      }
    } else {
      liveQueryResult = { skipped: 'No siteUrl linked — nothing to query.' };
    }

    // ── 6. Final summary ──────────────────────────────────────────────────────
    const configured = !!linkedSiteUrl;
    let reason;

    if (!configured) {
      reason = 'website.gsc.siteUrl is null — no property linked.';
    } else if (wrongPropertyLinked) {
      reason = `WRONG PROPERTY: "${linkedSiteUrl}" (domain="${domainFromGscUrl(linkedSiteUrl)}") does not match website.domain="${websiteDomain}". Correct property: "${correctMatch?.siteUrl}".`;
    } else if (liveQueryResult?.zeroReason) {
      reason = liveQueryResult.zeroReason;
    } else {
      reason = `Property "${linkedSiteUrl}" is correctly linked and returned ${liveQueryResult?.overviewRowCount ?? 0} row(s).`;
    }

    console.log('[GSC-Debug] FINAL REASON:', reason);

    res.json({
      website: {
        _id:         website._id,
        domain:      website.domain,
        displayName: website.displayName,
        gsc:         website.gsc  ?? null,
        ga4:         website.ga4  ?? null,
        syncStatus:  website.syncStatus,
        createdAt:   website.createdAt,
      },
      linkedProperty:    linkedSiteUrl,
      allProperties,
      sitesListRaw,
      sitesListError,
      matchingResults,
      correctPropertyForThisDomain: correctMatch?.siteUrl ?? null,
      wrongPropertyLinked,
      liveQueryResult,
      configured,
      reason,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/debug/gsc/:websiteId/raw ─────────────────────────────────────────
// Calls searchanalytics.query and returns the EXACT raw Google response.
// No transformation. No zero-filling. No chart processing.
// Query params: startDate, endDate (YYYY-MM-DD) — optional, defaults to last 30 days

const rawGSCQuery = async (req, res, next) => {
  try {
    const { websiteId } = req.params;

    // ── Date range ────────────────────────────────────────────────────────────
    // Default: yesterday minus 29 days → yesterday (30 completed days, no today)
    const endD   = new Date(); endD.setDate(endD.getDate() - 1);
    const startD = new Date(); startD.setDate(startD.getDate() - 30);
    const fmt    = (d) => d.toISOString().split('T')[0];

    const startDate = req.query.startDate || fmt(startD);
    const endDate   = req.query.endDate   || fmt(endD);

    // ── Website record ────────────────────────────────────────────────────────
    const website = await Website.findOne({ _id: websiteId, userId: req.user._id }).lean();
    if (!website) return res.status(404).json({ error: `Website ${websiteId} not found.` });

    const user = await User.findById(req.user._id)
      .select('+google.accessToken +google.refreshToken +google.expiresAt');
    if (!user?.isGoogleConnected) {
      return res.status(403).json({ error: 'Google account not connected.' });
    }

    const auth = createOAuth2Client(user);
    const sc   = google.searchconsole({ version: 'v1', auth });

    // ── All discovered properties ─────────────────────────────────────────────
    let discoveredProperties = [];
    let sitesListError       = null;
    try {
      const raw = await sc.sites.list();
      discoveredProperties = (raw.data.siteEntry || []).map((s) => ({
        siteUrl:         s.siteUrl,
        permissionLevel: s.permissionLevel,
      }));
    } catch (err) {
      sitesListError = err.message;
    }

    const selectedProperty = website.gsc?.siteUrl ?? null;

    console.log('DISCOVERED_GSC_PROPERTIES', JSON.stringify(discoveredProperties, null, 2));
    console.log('SELECTED_GSC_PROPERTY', selectedProperty);

    if (!selectedProperty) {
      return res.json({
        siteUrl:              null,
        selectedProperty,
        discoveredProperties,
        sitesListError,
        error:                'website.gsc.siteUrl is not set — no property linked.',
      });
    }

    // ── Raw searchanalytics.query — no processing whatsoever ─────────────────
    const requestBody = { startDate, endDate, searchType: 'web' };

    console.log('RAW_GSC_REQUEST', JSON.stringify({ siteUrl: selectedProperty, requestBody }, null, 2));

    let rawResponse     = null;
    let queryError      = null;
    let rowCount        = 0;
    let sampleRows      = [];
    let zeroExplanation = null;

    try {
      const response = await sc.searchanalytics.query({
        siteUrl:     selectedProperty,
        requestBody,
      });

      console.log('RAW_GSC_RESPONSE', JSON.stringify(response.data, null, 2));

      rawResponse = response.data;
      rowCount    = response.data.rows?.length ?? 0;
      sampleRows  = (response.data.rows || []).slice(0, 5);

      console.log('RAW_GSC_RESPONSE rowCount:', rowCount);

      if (rowCount === 0) {
        // Determine why Google returned 0 rows
        const linkedDomain      = domainFromGscUrl(selectedProperty);
        const websiteDomain     = website.domain || '';
        const domainsMatch      = linkedDomain === websiteDomain ||
          linkedDomain.endsWith('.' + websiteDomain) ||
          websiteDomain.endsWith('.' + linkedDomain);
        const otherProperties   = discoveredProperties.filter(p => p.siteUrl !== selectedProperty);
        const betterMatch       = otherProperties.find((p) => {
          const d = domainFromGscUrl(p.siteUrl);
          return d === websiteDomain || d.endsWith('.' + websiteDomain) || websiteDomain.endsWith('.' + d);
        });

        if (!domainsMatch) {
          zeroExplanation = `WRONG_PROPERTY: linked "${selectedProperty}" (domain="${linkedDomain}") does not match website.domain="${websiteDomain}". Better match: "${betterMatch?.siteUrl ?? 'none found in account'}"`;
        } else if (betterMatch && betterMatch.siteUrl !== selectedProperty) {
          zeroExplanation = `POSSIBLE_WRONG_PROPERTY: linked "${selectedProperty}" matches domain but "${betterMatch.siteUrl}" may be the canonical property with actual traffic.`;
        } else {
          zeroExplanation = `NO_DATA: Property "${selectedProperty}" is correctly matched to domain "${websiteDomain}" but Google returned 0 rows for ${startDate}→${endDate}. Either (1) this property has no organic search impressions in this period, or (2) it is a new/unverified property, or (3) the date range predates when the site had traffic.`;
        }

        console.log('RAW_GSC_ZERO_REASON:', zeroExplanation);
      }
    } catch (err) {
      queryError = err.message;
      console.log('RAW_GSC_QUERY_ERROR:', err.message);
    }

    res.json({
      siteUrl:              selectedProperty,
      requestBody,
      rawResponse,
      rowCount,
      sampleRows,
      zeroExplanation,
      queryError,
      selectedProperty,
      discoveredProperties,
      sitesListError,
      websiteDomain:        website.domain,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { debugGSC, debugGSCByWebsite, rawGSCQuery, manualGSCLink, listAvailableGSCSites };