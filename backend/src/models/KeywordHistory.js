const mongoose = require('mongoose');

// One record per keyword per day per website.
// Populated automatically from SearchConsoleSnapshot during daily sync.
// Enables: "show position history for 'my keyword' over 90 days"
const KeywordHistorySchema = new mongoose.Schema(
  {
    websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },

    date:    { type: Date, required: true },  // UTC day start
    keyword: { type: String, required: true, trim: true },

    // GSC metrics
    position:    { type: Number },
    clicks:      { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    ctr:         { type: Number, default: 0 },  // already as percentage (e.g. 3.5 = 3.5%)

    // Computed on insert: change vs previous day
    positionChange: { type: Number },  // positive = improved (lower number)
    clicksChange:   { type: Number },  // positive = more clicks
  },
  { timestamps: false }
);

// Primary lookup index
KeywordHistorySchema.index({ websiteId: 1, keyword: 1, date: -1 }, { unique: true });

// For "top keywords over a date range"
KeywordHistorySchema.index({ websiteId: 1, date: -1, clicks: -1 });

// For "all keywords on a given date" (snapshot export)
KeywordHistorySchema.index({ websiteId: 1, date: -1 });

// TTL: auto-delete records older than 13 months
KeywordHistorySchema.index({ date: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 395 });

module.exports = mongoose.model('KeywordHistory', KeywordHistorySchema);
