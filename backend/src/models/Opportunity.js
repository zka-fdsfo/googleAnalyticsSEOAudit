const mongoose = require('mongoose');

const OPPORTUNITY_TYPES = [
  'easy_win_keyword',    // Position 4-20 with good impressions
  'low_ctr',             // Good position but CTR below expected
  'traffic_decline',     // Sessions down vs previous period
  'ranking_decline',     // Position worsening
  'missing_schema',      // No structured data detected
  'missing_alt_text',    // Images without alt attributes
  'thin_content',        // Low word count pages
  'cannibalization',     // Multiple pages competing for same keyword
  'new_keyword',         // Newly discovered ranking keyword to capitalize on
  'featured_snippet',    // Position 1 but not featured snippet eligible
];

const OpportunitySchema = new mongoose.Schema(
  {
    websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },

    type:        { type: String, enum: OPPORTUNITY_TYPES, required: true },
    title:       { type: String, required: true },
    description: { type: String },

    // Source data (contextual — fields used depend on type)
    keyword:            { type: String },
    page:               { type: String },
    currentPosition:    { type: Number },
    targetPosition:     { type: Number },
    currentClicks:      { type: Number },
    currentImpressions: { type: Number },
    currentCTR:         { type: Number },

    // Scoring
    opportunityScore:     { type: Number, min: 0, max: 100, default: 0 },
    estimatedTrafficGain: { type: Number, default: 0 },   // est. monthly additional clicks
    priority:             { type: String, enum: ['critical', 'high', 'medium', 'low'], default: 'medium' },
    recommendation:       { type: String },

    // Status
    status: {
      type: String,
      enum: ['new', 'acknowledged', 'in_progress', 'completed', 'dismissed'],
      default: 'new',
    },
    dismissedAt:  { type: Date },
    completedAt:  { type: Date },
  },
  { timestamps: true }
);

// One opportunity per type+keyword/page per website (upsertable)
OpportunitySchema.index({ websiteId: 1, type: 1, keyword: 1, page: 1 }, { unique: true, sparse: true });
OpportunitySchema.index({ websiteId: 1, status: 1, opportunityScore: -1 });
OpportunitySchema.index({ userId: 1, status: 1, opportunityScore: -1 });

module.exports = mongoose.model('Opportunity', OpportunitySchema);
