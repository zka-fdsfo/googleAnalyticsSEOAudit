const SearchConsoleSnapshot = require('../models/SearchConsoleSnapshot');

const dayStart = (d = new Date()) => {
  const date = new Date(d);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

/**
 * Computes keyword ranking distribution from the latest GSC snapshot.
 * No extra API call needed — derived from existing topKeywords array.
 */
const getKeywordDistribution = async (websiteId, userId) => {
  const snapshot = await SearchConsoleSnapshot.findOne({ websiteId, userId })
    .sort({ date: -1 })
    .lean();

  if (!snapshot?.topKeywords?.length) {
    return { total: 0, top3: null, top10: null, top20: null, beyond: null };
  }

  const kws = snapshot.topKeywords;

  const groups = {
    top3:   kws.filter((k) => k.position >= 1  && k.position <= 3),
    top10:  kws.filter((k) => k.position > 3   && k.position <= 10),
    top20:  kws.filter((k) => k.position > 10  && k.position <= 20),
    beyond: kws.filter((k) => k.position > 20),
  };

  const summarize = (arr) => ({
    count:       arr.length,
    clicks:      arr.reduce((s, k) => s + (k.clicks || 0), 0),
    impressions: arr.reduce((s, k) => s + (k.impressions || 0), 0),
    avgPosition: arr.length
      ? parseFloat((arr.reduce((s, k) => s + k.position, 0) / arr.length).toFixed(1))
      : 0,
    topKeywords: arr.slice(0, 5),
  });

  return {
    total:  kws.length,
    top3:   summarize(groups.top3),
    top10:  summarize(groups.top10),
    top20:  summarize(groups.top20),
    beyond: summarize(groups.beyond),
    snapshotDate: snapshot.date,
  };
};

/**
 * Computes page intelligence by comparing current vs previous GSC snapshot.
 * - Growing pages: click increase > 5%
 * - Declining pages: click decrease > 5%
 * - Low CTR pages: position ≤ 10 with CTR < 2% and impressions > 100
 */
const getPageIntelligence = async (websiteId, userId, lookbackDays = 7) => {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const [current, previousArr] = await Promise.all([
    SearchConsoleSnapshot.findOne({ websiteId, userId }).sort({ date: -1 }).lean(),
    SearchConsoleSnapshot.find({ websiteId, userId, date: { $lte: cutoff } })
      .sort({ date: -1 })
      .limit(1)
      .lean(),
  ]);

  if (!current) return { growing: [], declining: [], lowCTR: [], improving: [] };

  const previous = previousArr[0] || null;
  const prevPageMap = new Map((previous?.topPages || []).map((p) => [p.page, p]));

  const growing   = [];
  const declining = [];
  const lowCTR    = [];
  const improving = []; // Good impressions, position improving

  for (const page of current.topPages || []) {
    const prev = prevPageMap.get(page.page);

    const clickChange = prev && prev.clicks > 0
      ? parseFloat(((page.clicks - prev.clicks) / prev.clicks * 100).toFixed(1))
      : null;
    const positionChange = prev ? parseFloat((prev.position - page.position).toFixed(1)) : null;

    const enriched = {
      ...page,
      prevClicks:      prev?.clicks    ?? null,
      prevPosition:    prev?.position  ?? null,
      clickChange,
      positionChange,
    };

    if (clickChange !== null) {
      if (clickChange >= 5)  growing.push(enriched);
      if (clickChange <= -5) declining.push(enriched);
    }

    // High impression, low CTR (position ≤ 10)
    if (page.position <= 10 && (page.ctr || 0) < 2 && (page.impressions || 0) >= 100) {
      const expectedCTR = Math.max(2, 30 - (page.position - 1) * 2.5);
      const ctrGap      = expectedCTR - (page.ctr || 0);
      const estimatedGain = Math.round((page.impressions || 0) * (ctrGap / 100));
      lowCTR.push({ ...enriched, expectedCTR: parseFloat(expectedCTR.toFixed(1)), ctrGap: parseFloat(ctrGap.toFixed(1)), estimatedGain });
    }

    // Position improved AND has decent impressions
    if (positionChange !== null && positionChange >= 2 && (page.impressions || 0) >= 50) {
      improving.push(enriched);
    }
  }

  return {
    growing:   growing.sort((a, b) => b.clickChange - a.clickChange).slice(0, 15),
    declining: declining.sort((a, b) => a.clickChange - b.clickChange).slice(0, 15),
    lowCTR:    lowCTR.sort((a, b) => b.impressions - a.impressions).slice(0, 15),
    improving: improving.sort((a, b) => b.positionChange - a.positionChange).slice(0, 10),
    lookbackDays,
    currentDate:  current.date,
    previousDate: previous?.date ?? null,
  };
};

/**
 * Returns the SEO score and breakdown from the latest audit for a website.
 */
const getSEOScoreHistory = async (websiteId) => {
  const Audit = require('../models/Audit');
  const Website = require('../models/Website');
  const website = await Website.findById(websiteId).select('domain').lean();
  if (!website) return null;

  const audits = await Audit.find({
    $or: [
      { domain: website.domain },
      { url: new RegExp(website.domain.replace('.', '\\.'), 'i') },
    ],
    status: 'completed',
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('score categories createdAt url')
    .lean();

  return {
    latest: audits[0] || null,
    history: audits.map((a) => ({ date: a.createdAt, score: a.score, url: a.url })),
  };
};

/**
 * Generates a complete executive report snapshot for a website.
 */
const generateReport = async (websiteId, userId, type = 'monthly') => {
  const Report = require('../models/Report');
  const { getExecutiveSummary } = require('./metricsService');
  const { getRecommendationSummary } = require('./recommendationEngine');
  const { getOpportunities } = require('./opportunityEngine');

  const report = await Report.create({
    websiteId,
    userId,
    type,
    title: `${type.charAt(0).toUpperCase() + type.slice(1)} SEO Report`,
    status: 'generating',
    period: {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate:   new Date(),
    },
  });

  try {
    const [summary, recSummary, opps] = await Promise.all([
      getExecutiveSummary(websiteId, userId),
      getRecommendationSummary(websiteId),
      getOpportunities(websiteId, { limit: 5 }),
    ]);

    const analytics = summary?.analytics;
    const gsc       = summary?.gsc;

    const wins    = [];
    const losses  = [];

    if (analytics?.changes?.sessions > 5)   wins.push(`Organic traffic increased ${analytics.changes.sessions.toFixed(1)}%`);
    if (analytics?.changes?.sessions < -5)   losses.push(`Organic traffic dropped ${Math.abs(analytics.changes.sessions).toFixed(1)}%`);
    if (gsc?.changes?.clicks > 5)            wins.push(`Search clicks up ${gsc.changes.clicks.toFixed(1)}%`);
    if (gsc?.changes?.position < -2)         wins.push(`Average ranking improved by ${Math.abs(gsc.changes.position).toFixed(1)} positions`);
    if (gsc?.changes?.position > 2)          losses.push(`Average ranking dropped by ${gsc.changes.position.toFixed(1)} positions`);
    if (summary?.keywords?.rising?.length)   wins.push(`${summary.keywords.rising.length} keywords improved ranking`);
    if (summary?.keywords?.lostKeywords?.length) losses.push(`${summary.keywords.lostKeywords.length} keywords lost from rankings`);

    await Report.findByIdAndUpdate(report._id, {
      status: 'ready',
      generatedAt: new Date(),
      data: {
        organicTraffic: analytics?.current?.sessions,
        clicks:         gsc?.current?.clicks,
        impressions:    gsc?.current?.impressions,
        ctr:            gsc?.current?.ctr,
        avgPosition:    gsc?.current?.position,
        newKeywords:    summary?.keywords?.newKeywords?.length,
        lostKeywords:   summary?.keywords?.lostKeywords?.length,
        recommendations: { open: recSummary.open, fixed: recSummary.fixed },
        opportunities:   { total: opps.total, highPriority: opps.items?.filter((o) => o.priority === 'high').length },
        wins,
        losses,
        highlights: [...wins.slice(0, 3)],
      },
    });

    return await Report.findById(report._id).lean();
  } catch (err) {
    await Report.findByIdAndUpdate(report._id, { status: 'failed', error: err.message });
    throw err;
  }
};

module.exports = {
  getKeywordDistribution,
  getPageIntelligence,
  getSEOScoreHistory,
  generateReport,
};