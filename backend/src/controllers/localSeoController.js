const Website = require('../models/Website');
const {
  addKeyword, getKeywords, deactivateKeyword,
  addRanking, getRankings, getLatestRankings,
  getTrends, getOverview, getVisibility, generateInsights,
} = require('../services/localSeoService');

// ── Guard: ensure website belongs to user ─────────────────────────────────────

const verify = async (websiteId, userId) => {
  const w = await Website.findOne({ _id: websiteId, userId });
  if (!w) throw Object.assign(new Error('Website not found.'), { statusCode: 404 });
  return w;
};

// ── GET /api/local-seo/:websiteId/overview ────────────────────────────────────

const overview = async (req, res, next) => {
  try {
    await verify(req.params.websiteId, req.user._id);
    const data = await getOverview(req.params.websiteId, req.user._id);
    res.json(data);
  } catch (err) { next(err); }
};

// ── GET /api/local-seo/:websiteId/rankings ────────────────────────────────────

const rankings = async (req, res, next) => {
  try {
    await verify(req.params.websiteId, req.user._id);
    const { searchEngine, keyword, startDate, endDate, latest } = req.query;

    const data = latest === 'true'
      ? await getLatestRankings(req.params.websiteId, req.user._id, searchEngine)
      : await getRankings(req.params.websiteId, req.user._id, { searchEngine, keyword, startDate, endDate });

    res.json({ rankings: data });
  } catch (err) { next(err); }
};

// ── POST /api/local-seo/:websiteId/rankings ───────────────────────────────────

const addRankingHandler = async (req, res, next) => {
  try {
    await verify(req.params.websiteId, req.user._id);
    const { keyword, searchEngine, location, rank, keywordId, notes } = req.body;

    if (!keyword || !searchEngine || !rank) {
      return res.status(400).json({ error: 'keyword, searchEngine, and rank are required.' });
    }
    if (!['google_maps', 'apple_maps'].includes(searchEngine)) {
      return res.status(400).json({ error: 'searchEngine must be google_maps or apple_maps.' });
    }
    if (rank < 1) {
      return res.status(400).json({ error: 'rank must be 1 or higher.' });
    }

    const doc = await addRanking(req.params.websiteId, req.user._id, {
      keyword, searchEngine, location, rank: parseInt(rank), keywordId, notes,
    });
    res.status(201).json({ ranking: doc });
  } catch (err) { next(err); }
};

// ── GET /api/local-seo/:websiteId/keywords ────────────────────────────────────

const keywordsList = async (req, res, next) => {
  try {
    await verify(req.params.websiteId, req.user._id);
    const data = await getKeywords(req.params.websiteId, req.user._id);
    res.json({ keywords: data });
  } catch (err) { next(err); }
};

// ── POST /api/local-seo/:websiteId/keywords ───────────────────────────────────

const addKeywordHandler = async (req, res, next) => {
  try {
    await verify(req.params.websiteId, req.user._id);
    const { keyword, targetLocation, searchEngine } = req.body;

    if (!keyword || !targetLocation) {
      return res.status(400).json({ error: 'keyword and targetLocation are required.' });
    }

    const doc = await addKeyword(req.params.websiteId, req.user._id, {
      keyword, targetLocation, searchEngine,
    });
    res.status(201).json({ keyword: doc });
  } catch (err) { next(err); }
};

// ── DELETE /api/local-seo/:websiteId/keywords/:keywordId ──────────────────────

const deleteKeywordHandler = async (req, res, next) => {
  try {
    await verify(req.params.websiteId, req.user._id);
    await deactivateKeyword(req.params.keywordId, req.user._id);
    res.json({ message: 'Keyword removed.' });
  } catch (err) { next(err); }
};

// ── GET /api/local-seo/:websiteId/trends ─────────────────────────────────────

const trends = async (req, res, next) => {
  try {
    await verify(req.params.websiteId, req.user._id);
    const { keyword, searchEngine, days } = req.query;
    const data = await getTrends(req.params.websiteId, req.user._id, {
      keyword,
      searchEngine,
      days: parseInt(days) || 30,
    });
    res.json({ trends: data });
  } catch (err) { next(err); }
};

// ── GET /api/local-seo/:websiteId/visibility ──────────────────────────────────

const visibility = async (req, res, next) => {
  try {
    await verify(req.params.websiteId, req.user._id);
    const { searchEngine, days } = req.query;
    const data = await getVisibility(req.params.websiteId, req.user._id, {
      searchEngine,
      days: parseInt(days) || 30,
    });
    res.json({ visibility: data });
  } catch (err) { next(err); }
};

// ── GET /api/local-seo/:websiteId/insights ────────────────────────────────────

const insights = async (req, res, next) => {
  try {
    await verify(req.params.websiteId, req.user._id);
    const data = await generateInsights(req.params.websiteId, req.user._id);
    res.json({ insights: data });
  } catch (err) { next(err); }
};

module.exports = {
  overview, rankings, addRankingHandler,
  keywordsList, addKeywordHandler, deleteKeywordHandler,
  trends, visibility, insights,
};