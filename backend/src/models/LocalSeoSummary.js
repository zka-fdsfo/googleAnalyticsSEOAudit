const mongoose = require('mongoose');

/**
 * Cached aggregated Local SEO summary per website per search engine.
 * Rebuilt whenever new ranking data is saved to avoid expensive re-aggregation
 * on every dashboard load.
 */
const LocalSeoSummarySchema = new mongoose.Schema(
  {
    websiteId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
    userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    searchEngine:   { type: String, enum: ['google_maps', 'apple_maps'], required: true },

    totalKeywords:      { type: Number, default: 0 },
    rankedKeywords:     { type: Number, default: 0 }, // keywords with at least one rank check
    averageRank:        { type: Number, default: 0 },
    top3Keywords:       { type: Number, default: 0 },
    top10Keywords:      { type: Number, default: 0 },
    top20Keywords:      { type: Number, default: 0 },
    rankingImprovements:{ type: Number, default: 0 }, // keywords that improved vs previous check
    rankingDeclines:    { type: Number, default: 0 },
    visibilityScore:    { type: Number, default: 0 }, // 0–100

    updatedAt:      { type: Date, default: Date.now },
  },
  { timestamps: false }
);

LocalSeoSummarySchema.index(
  { websiteId: 1, searchEngine: 1 },
  { unique: true }
);

module.exports = mongoose.model('LocalSeoSummary', LocalSeoSummarySchema);