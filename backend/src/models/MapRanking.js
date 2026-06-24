const mongoose = require('mongoose');

/**
 * A single rank-check record for a keyword on Google Maps or Apple Maps.
 * Rankings are entered manually (no official public API exists for either platform).
 * Each time the user logs their rank, a new document is created so history is preserved.
 */
const MapRankingSchema = new mongoose.Schema(
  {
    websiteId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    keywordId:    { type: mongoose.Schema.Types.ObjectId, ref: 'LocalKeyword' },

    keyword:      { type: String, required: true, trim: true },
    searchEngine: { type: String, enum: ['google_maps', 'apple_maps'], required: true },
    location:     { type: String, trim: true },

    // Ranking data
    rank:         { type: Number, required: true, min: 1 },  // current rank
    previousRank: { type: Number, default: null },            // rank from previous check
    change:       { type: Number, default: 0 },               // positive = improved (moved up)

    checkedAt:    { type: Date, default: Date.now },
    notes:        { type: String, trim: true },
  },
  { timestamps: false }
);

MapRankingSchema.index({ websiteId: 1, keyword: 1, searchEngine: 1, checkedAt: -1 });
MapRankingSchema.index({ websiteId: 1, userId: 1, checkedAt: -1 });
MapRankingSchema.index({ websiteId: 1, searchEngine: 1, checkedAt: -1 });

// TTL: keep ranking history for 2 years
MapRankingSchema.index({ checkedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 730 });

module.exports = mongoose.model('MapRanking', MapRankingSchema);