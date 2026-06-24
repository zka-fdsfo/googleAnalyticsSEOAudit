const mongoose = require('mongoose');

/**
 * Keywords that a business wants to track on Google Maps and/or Apple Maps.
 * Rankings are stored separately in MapRanking.
 */
const LocalKeywordSchema = new mongoose.Schema(
  {
    websiteId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
    userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    keyword:        { type: String, required: true, trim: true },
    targetLocation: { type: String, required: true, trim: true }, // e.g. "Kolkata"
    searchEngine:   { type: String, enum: ['google_maps', 'apple_maps', 'both'], default: 'both' },
    active:         { type: Boolean, default: true },
  },
  { timestamps: true }
);

LocalKeywordSchema.index({ websiteId: 1, userId: 1, active: 1 });
LocalKeywordSchema.index({ websiteId: 1, keyword: 1, searchEngine: 1 }, { unique: true });

module.exports = mongoose.model('LocalKeyword', LocalKeywordSchema);