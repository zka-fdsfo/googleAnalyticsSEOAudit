const LocalKeyword   = require('../models/LocalKeyword');
const MapRanking     = require('../models/MapRanking');
const LocalSeoSummary= require('../models/LocalSeoSummary');

// ── Keyword CRUD ──────────────────────────────────────────────────────────────

const addKeyword = async (websiteId, userId, { keyword, targetLocation, searchEngine = 'both' }) => {
  const doc = await LocalKeyword.findOneAndUpdate(
    { websiteId, keyword: keyword.trim(), searchEngine },
    { $set: { userId, targetLocation: targetLocation.trim(), active: true } },
    { upsert: true, new: true }
  );
  return doc;
};

const getKeywords = (websiteId, userId) =>
  LocalKeyword.find({ websiteId, userId, active: true }).sort({ keyword: 1 }).lean();

const deactivateKeyword = (keywordId, userId) =>
  LocalKeyword.findOneAndUpdate({ _id: keywordId, userId }, { $set: { active: false } }, { new: true });

// ── Ranking CRUD ──────────────────────────────────────────────────────────────

/**
 * Store a new rank check for a keyword.
 * Automatically looks up the previous rank and computes the change.
 * Updates the LocalSeoSummary cache after saving.
 */
const addRanking = async (websiteId, userId, {
  keyword, searchEngine, location, rank, keywordId, notes,
}) => {
  // Find the most recent previous rank for this keyword+engine
  const previous = await MapRanking.findOne({ websiteId, keyword, searchEngine })
    .sort({ checkedAt: -1 })
    .lean();

  const previousRank = previous?.rank ?? null;
  // change > 0 means improved (rank number got smaller)
  const change = previousRank !== null ? previousRank - rank : 0;

  const doc = await MapRanking.create({
    websiteId, userId, keywordId, keyword, searchEngine, location,
    rank, previousRank, change, notes,
    checkedAt: new Date(),
  });

  // Rebuild summary cache asynchronously
  rebuildSummary(websiteId, userId, searchEngine).catch(() => {});

  return doc;
};

const getRankings = async (websiteId, userId, {
  searchEngine, keyword, startDate, endDate, limit = 200,
} = {}) => {
  const filter = { websiteId, userId };
  if (searchEngine) filter.searchEngine = searchEngine;
  if (keyword)      filter.keyword = { $regex: keyword, $options: 'i' };
  if (startDate || endDate) {
    filter.checkedAt = {};
    if (startDate) filter.checkedAt.$gte = new Date(startDate);
    if (endDate)   filter.checkedAt.$lte = new Date(endDate);
  }
  return MapRanking.find(filter).sort({ checkedAt: -1 }).limit(limit).lean();
};

/**
 * Latest rank per keyword (one row per keyword+engine).
 */
const getLatestRankings = async (websiteId, userId, searchEngine) => {
  const match = { websiteId: require('mongoose').Types.ObjectId.isValid(websiteId)
    ? new (require('mongoose').Types.ObjectId)(websiteId) : websiteId, userId };
  if (searchEngine) match.searchEngine = searchEngine;

  return MapRanking.aggregate([
    { $match: match },
    { $sort:  { checkedAt: -1 } },
    {
      $group: {
        _id:          { keyword: '$keyword', searchEngine: '$searchEngine' },
        keyword:      { $first: '$keyword' },
        searchEngine: { $first: '$searchEngine' },
        location:     { $first: '$location' },
        rank:         { $first: '$rank' },
        previousRank: { $first: '$previousRank' },
        change:       { $first: '$change' },
        checkedAt:    { $first: '$checkedAt' },
      },
    },
    { $sort: { rank: 1 } },
  ]);
};

// ── Trend series ──────────────────────────────────────────────────────────────

const getTrends = async (websiteId, userId, { keyword, searchEngine, days = 30 }) => {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const filter = { websiteId, userId, checkedAt: { $gte: since } };
  if (keyword)      filter.keyword      = keyword;
  if (searchEngine) filter.searchEngine = searchEngine;

  const rows = await MapRanking.find(filter).sort({ checkedAt: 1 }).lean();

  // Group by keyword → array of { date, rank }
  const byKeyword = {};
  for (const r of rows) {
    const key = `${r.keyword}|${r.searchEngine}`;
    if (!byKeyword[key]) byKeyword[key] = { keyword: r.keyword, searchEngine: r.searchEngine, series: [] };
    byKeyword[key].series.push({
      date: r.checkedAt.toISOString().split('T')[0],
      rank: r.rank,
    });
  }
  return Object.values(byKeyword);
};

// ── Overview / Summary ────────────────────────────────────────────────────────

const getOverview = async (websiteId, userId) => {
  const [googleSummary, appleSummary, recentRankings, insights] = await Promise.all([
    LocalSeoSummary.findOne({ websiteId, searchEngine: 'google_maps' }).lean(),
    LocalSeoSummary.findOne({ websiteId, searchEngine: 'apple_maps' }).lean(),
    getLatestRankings(websiteId, userId),
    generateInsights(websiteId, userId),
  ]);

  return {
    google: googleSummary ?? defaultSummary('google_maps'),
    apple:  appleSummary  ?? defaultSummary('apple_maps'),
    recentRankings,
    insights,
  };
};

const defaultSummary = (searchEngine) => ({
  searchEngine,
  totalKeywords: 0, rankedKeywords: 0, averageRank: 0,
  top3Keywords: 0, top10Keywords: 0, top20Keywords: 0,
  rankingImprovements: 0, rankingDeclines: 0, visibilityScore: 0,
});

// ── Summary rebuild ───────────────────────────────────────────────────────────

const rebuildSummary = async (websiteId, userId, searchEngine) => {
  const latest = await getLatestRankings(websiteId, userId, searchEngine);
  const total  = await LocalKeyword.countDocuments({ websiteId, userId, active: true });

  const ranked     = latest.length;
  const top3       = latest.filter((r) => r.rank <= 3).length;
  const top10      = latest.filter((r) => r.rank <= 10).length;
  const top20      = latest.filter((r) => r.rank <= 20).length;
  const improved   = latest.filter((r) => r.change > 0).length;
  const declined   = latest.filter((r) => r.change < 0).length;
  const avgRank    = ranked > 0
    ? parseFloat((latest.reduce((s, r) => s + r.rank, 0) / ranked).toFixed(1))
    : 0;

  // Visibility score: weighted by rank tier (0–100)
  const visScore = total > 0
    ? Math.min(100, parseFloat(
        ((top3 * 3 + (top10 - top3) * 2 + (top20 - top10) * 1) / (total * 3) * 100).toFixed(1)
      ))
    : 0;

  await LocalSeoSummary.findOneAndUpdate(
    { websiteId, searchEngine },
    {
      $set: {
        userId, totalKeywords: total, rankedKeywords: ranked,
        averageRank: avgRank, top3Keywords: top3, top10Keywords: top10, top20Keywords: top20,
        rankingImprovements: improved, rankingDeclines: declined,
        visibilityScore: visScore, updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
};

// ── Insights generator ────────────────────────────────────────────────────────

const generateInsights = async (websiteId, userId) => {
  const latest = await getLatestRankings(websiteId, userId);
  if (!latest.length) return [];

  const insights = [];

  // Big improvements
  const improved = latest
    .filter((r) => r.change >= 3)
    .sort((a, b) => b.change - a.change)
    .slice(0, 5);
  for (const r of improved) {
    insights.push({
      type:    'improvement',
      engine:  r.searchEngine,
      keyword: r.keyword,
      text:    `"${r.keyword}" improved from #${r.previousRank} to #${r.rank} on ${engineLabel(r.searchEngine)} (↑ ${r.change} positions).`,
    });
  }

  // Big drops
  const declined = latest
    .filter((r) => r.change <= -3)
    .sort((a, b) => a.change - b.change)
    .slice(0, 3);
  for (const r of declined) {
    insights.push({
      type:    'decline',
      engine:  r.searchEngine,
      keyword: r.keyword,
      text:    `"${r.keyword}" dropped ${Math.abs(r.change)} positions on ${engineLabel(r.searchEngine)} (now #${r.rank}).`,
    });
  }

  // Top-3 count
  const top3Google = latest.filter((r) => r.searchEngine === 'google_maps' && r.rank <= 3).length;
  const top3Apple  = latest.filter((r) => r.searchEngine === 'apple_maps'  && r.rank <= 3).length;
  if (top3Google > 0) insights.push({ type: 'summary', engine: 'google_maps', text: `${top3Google} keyword${top3Google !== 1 ? 's' : ''} ranking in Top 3 on Google Maps.` });
  if (top3Apple  > 0) insights.push({ type: 'summary', engine: 'apple_maps',  text: `${top3Apple}  keyword${top3Apple  !== 1 ? 's' : ''} ranking in Top 3 on Apple Maps.` });

  return insights;
};

const engineLabel = (e) => e === 'google_maps' ? 'Google Maps' : 'Apple Maps';

// ── Visibility (series over time) ─────────────────────────────────────────────

const getVisibility = async (websiteId, userId, { days = 30, searchEngine } = {}) => {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const filter = { websiteId, userId, checkedAt: { $gte: since } };
  if (searchEngine) filter.searchEngine = searchEngine;

  // Group by date → compute average rank per date
  const rows = await MapRanking.aggregate([
    { $match: filter },
    {
      $group: {
        _id:    { date: { $dateToString: { format: '%Y-%m-%d', date: '$checkedAt' } }, engine: '$searchEngine' },
        avgRank:{ $avg: '$rank' },
        count:  { $sum: 1 },
      },
    },
    { $sort: { '_id.date': 1 } },
  ]);

  return rows.map((r) => ({
    date:         r._id.date,
    searchEngine: r._id.engine,
    avgRank:      parseFloat(r.avgRank.toFixed(1)),
    count:        r.count,
  }));
};

module.exports = {
  addKeyword, getKeywords, deactivateKeyword,
  addRanking, getRankings, getLatestRankings,
  getTrends, getOverview, getVisibility,
  generateInsights, rebuildSummary,
};