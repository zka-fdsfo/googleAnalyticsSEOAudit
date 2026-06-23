const Opportunity = require('../models/Opportunity');
const SearchConsoleSnapshot = require('../models/SearchConsoleSnapshot');
const AnalyticsSnapshot = require('../models/AnalyticsSnapshot');
const { calcGrowth } = require('./metricsService');

// ── Scoring ────────────────────────────────────────────────────────────────────

/**
 * Opportunity score (0-100):
 * Based on potential traffic gain, current position, and impression volume.
 */
const scoreKeywordOpportunity = (kw) => {
  // Position value: spot 4 = 80 pts, spot 20 = 20 pts
  const posScore = Math.max(0, 100 - (kw.position - 4) * 4);
  // Volume value: log scale on impressions
  const volScore = Math.min(40, Math.log10(Math.max(kw.impressions, 1)) * 15);
  // CTR gap: how much below expected CTR for this position
  const expectedCTR = Math.max(0, 30 - (kw.position - 1) * 1.5);
  const ctrGap = Math.max(0, expectedCTR - kw.ctr);
  const ctrScore = Math.min(20, ctrGap * 2);

  return Math.round(posScore * 0.5 + volScore + ctrScore);
};

const estimateTrafficGain = (kw) => {
  // If page moved from position kw.position to position 3, estimated CTR = 10%
  const targetCTR = 10;
  const currentCTR = kw.ctr || 0;
  return Math.round(kw.impressions * ((targetCTR - currentCTR) / 100));
};

// ── Detection functions ────────────────────────────────────────────────────────

const detectEasyWinKeywords = (keywords) =>
  keywords
    .filter((k) => k.position >= 4 && k.position <= 20 && k.impressions >= 50)
    .map((k) => ({
      type:               'easy_win_keyword',
      title:              `Rank higher for "${k.query}"`,
      description:        `Currently ranking #${Math.round(k.position)} with ${k.impressions.toLocaleString()} impressions/month. Optimizing for this keyword could significantly increase organic traffic.`,
      keyword:            k.query,
      currentPosition:    k.position,
      targetPosition:     Math.max(1, Math.round(k.position) - 3),
      currentClicks:      k.clicks,
      currentImpressions: k.impressions,
      currentCTR:         k.ctr,
      opportunityScore:   scoreKeywordOpportunity(k),
      estimatedTrafficGain: estimateTrafficGain(k),
      priority:           k.impressions >= 1000 ? 'high' : k.impressions >= 300 ? 'medium' : 'low',
      recommendation:     `Improve content depth, add internal links pointing to this page, optimize the title tag to include "${k.query}", and acquire relevant backlinks.`,
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 30);

const detectLowCTR = (keywords) =>
  keywords
    .filter((k) => k.position <= 10 && k.impressions >= 200 && k.ctr < 3)
    .map((k) => {
      const expectedCTR = Math.max(2, 30 - (k.position - 1) * 2.5);
      const gap = expectedCTR - k.ctr;
      return {
        type:               'low_ctr',
        title:              `Low CTR for "${k.query}" at position #${Math.round(k.position)}`,
        description:        `Your CTR is ${k.ctr}% but pages at position #${Math.round(k.position)} typically achieve ~${expectedCTR.toFixed(1)}%. Improving title/description could add ${Math.round(k.impressions * gap / 100)} clicks/month.`,
        keyword:            k.query,
        currentPosition:    k.position,
        currentClicks:      k.clicks,
        currentImpressions: k.impressions,
        currentCTR:         k.ctr,
        opportunityScore:   Math.min(90, Math.round(gap * 10 + Math.log10(k.impressions) * 10)),
        estimatedTrafficGain: Math.round(k.impressions * gap / 100),
        priority:           gap > 5 ? 'high' : 'medium',
        recommendation:     `Rewrite the meta title and description to be more compelling and click-worthy. Include numbers, power words, or a clear value proposition. A/B test different formulations.`,
      };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 15);

const detectRankingDeclines = (currentKws, previousKws) => {
  if (!previousKws?.length) return [];
  const prevMap = new Map(previousKws.map((k) => [k.query, k]));

  return currentKws
    .filter((k) => {
      const prev = prevMap.get(k.query);
      return prev && k.position - prev.position >= 5;
    })
    .map((k) => {
      const prev = prevMap.get(k.query);
      const drop = k.position - prev.position;
      return {
        type:            'ranking_decline',
        title:           `"${k.query}" dropped ${Math.round(drop)} positions`,
        description:     `Position moved from #${Math.round(prev.position)} to #${Math.round(k.position)} in the last comparison period. Lost approximately ${prev.clicks - k.clicks} clicks.`,
        keyword:         k.query,
        currentPosition: k.position,
        currentClicks:   k.clicks,
        currentImpressions: k.impressions,
        currentCTR:      k.ctr,
        opportunityScore: Math.min(100, Math.round(drop * 5 + Math.log10(Math.max(k.impressions, 1)) * 10)),
        estimatedTrafficGain: prev.clicks - k.clicks,
        priority:        drop >= 10 ? 'critical' : drop >= 5 ? 'high' : 'medium',
        recommendation:  `Audit the page targeting "${k.query}" for content freshness, check for technical issues, review competitor content that may have outranked it, and consider acquiring backlinks to restore authority.`,
      };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 10);
};

const detectTrafficDecline = (current, previous) => {
  if (!current || !previous) return [];
  const sessionChange = calcGrowth(current.sessions, previous.sessions);
  if (sessionChange >= -10) return [];

  return [{
    type:                 'traffic_decline',
    title:                `Organic traffic down ${Math.abs(Math.round(sessionChange))}%`,
    description:          `Sessions dropped from ${previous.sessions.toLocaleString()} to ${current.sessions.toLocaleString()}. This requires immediate investigation.`,
    opportunityScore:     Math.min(100, Math.round(Math.abs(sessionChange) * 1.5)),
    estimatedTrafficGain: previous.sessions - current.sessions,
    priority:             sessionChange < -30 ? 'critical' : 'high',
    recommendation:       `Check Google Search Console for manual actions, review recent site changes or deployments, audit for new technical SEO issues, and compare with Google algorithm update timelines.`,
  }];
};

// ── Main engine ────────────────────────────────────────────────────────────────

const detectOpportunities = async (websiteId, userId) => {
  const [currentGSC, previousGSC, currentGA4, previousGA4] = await Promise.all([
    SearchConsoleSnapshot.findOne({ websiteId, userId }).sort({ date: -1 }).lean(),
    SearchConsoleSnapshot.find({ websiteId, userId }).sort({ date: -1 }).skip(1).limit(1).lean(),
    AnalyticsSnapshot.findOne({ websiteId, userId }).sort({ date: -1 }).lean(),
    AnalyticsSnapshot.find({ websiteId, userId }).sort({ date: -1 }).skip(30).limit(1).lean(),
  ]);

  if (!currentGSC) return { detected: 0 };

  const prevGSC  = previousGSC[0] || null;
  const prevGA4  = previousGA4[0] || null;

  const allOpportunities = [
    ...detectEasyWinKeywords(currentGSC.topKeywords || []),
    ...detectLowCTR(currentGSC.topKeywords || []),
    ...detectRankingDeclines(currentGSC.topKeywords || [], prevGSC?.topKeywords || []),
    ...detectTrafficDecline(currentGA4?.overview, prevGA4?.overview),
  ];

  let detected = 0;
  for (const opp of allOpportunities) {
    try {
      await Opportunity.findOneAndUpdate(
        {
          websiteId,
          type:    opp.type,
          keyword: opp.keyword || null,
          status:  { $nin: ['dismissed', 'completed'] },
        },
        { $set: { ...opp, websiteId, userId } },
        { upsert: true }
      );
      detected++;
    } catch {
      // Duplicate key edge case — skip
    }
  }

  return { detected };
};

const getOpportunities = async (websiteId, { status, limit = 30, skip = 0 } = {}) => {
  const filter = { websiteId };
  if (status) filter.status = status;
  else        filter.status = { $nin: ['dismissed', 'completed'] };

  const [items, total] = await Promise.all([
    Opportunity.find(filter)
      .sort({ opportunityScore: -1, priority: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Opportunity.countDocuments(filter),
  ]);

  return { items, total };
};

const updateOpportunityStatus = (id, userId, status) =>
  Opportunity.findOneAndUpdate(
    { _id: id, userId },
    {
      $set: {
        status,
        ...(status === 'dismissed'  ? { dismissedAt: new Date() } : {}),
        ...(status === 'completed'  ? { completedAt: new Date() } : {}),
      },
    },
    { new: true }
  );

module.exports = { detectOpportunities, getOpportunities, updateOpportunityStatus };
