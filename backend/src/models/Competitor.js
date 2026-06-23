const mongoose = require('mongoose');

/**
 * Competitor — future-ready competitor tracking structure.
 * External data populated by third-party APIs (Ahrefs, Moz, etc.) when integrated.
 * Currently supports manual competitor addition + keyword gap analysis via GSC comparison.
 */
const CompetitorSchema = new mongoose.Schema(
  {
    websiteId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },

    domain:      { type: String, required: true, trim: true, lowercase: true },
    displayName: { type: String, trim: true },
    favicon:     { type: String },
    isActive:    { type: Boolean, default: true },

    // ── Estimated metrics (populated by external API when integrated) ──────
    estimatedMonthlyTraffic: { type: Number },
    domainAuthority:         { type: Number },
    domainRating:            { type: Number },
    backlinks:               { type: Number },
    referringDomains:        { type: Number },

    // ── Keyword overlap (computed from GSC data) ──────────────────────────
    commonKeywords:  { type: Number, default: 0 },
    uniqueToUs:      { type: Number, default: 0 },
    uniqueToThem:    { type: Number, default: 0 },
    keywordGap:      [{ type: String }],   // keywords they rank for, we don't

    // ── SERP data (future) ────────────────────────────────────────────────
    topKeywords: [{
      keyword:  String,
      position: Number,
      volume:   Number,
      _id: false,
    }],

    // ── Content gap ───────────────────────────────────────────────────────
    contentGapPages: [{ type: String }],

    // ── Share of voice ────────────────────────────────────────────────────
    shareOfVoice:   { type: Number },  // % of total impressions in shared keywords
    ourShareOfVoice:{ type: Number },

    lastAnalyzedAt: { type: Date },
    dataSource:     { type: String, default: 'manual' },  // 'manual' | 'ahrefs' | 'moz' | 'semrush'
  },
  { timestamps: true }
);

CompetitorSchema.index({ websiteId: 1, domain: 1 }, { unique: true });
CompetitorSchema.index({ userId: 1, isActive: 1 });

module.exports = mongoose.model('Competitor', CompetitorSchema);