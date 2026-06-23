const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema(
  {
    websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },

    type: {
      type: String,
      enum: [
        'traffic_drop',         // Sessions dropped significantly
        'traffic_spike',        // Sessions spiked (positive)
        'ranking_drop',         // Average position worsened
        'ctr_drop',             // Click-through rate declined
        'impressions_drop',     // Impressions declined
        'clicks_drop',          // Clicks declined
        'new_critical_issue',   // New critical SEO issue detected in audit
        'indexing_issue',       // noindex detected
        'broken_links',         // Broken links count increased
        'seo_score_drop',       // SEO score declined
        'cwv_regression',       // Core Web Vitals degraded
      ],
      required: true,
    },

    severity: { type: String, enum: ['critical', 'warning', 'info'], default: 'warning' },
    title:    { type: String, required: true },
    message:  { type: String },

    // The metric that triggered the alert
    metric:        { type: String },
    currentValue:  { type: Number },
    previousValue: { type: Number },
    changePercent: { type: Number },   // negative = decline

    // Read/dismiss state (per user)
    isRead:      { type: Boolean, default: false },
    isDismissed: { type: Boolean, default: false },
    readAt:      { type: Date },
    dismissedAt: { type: Date },
  },
  { timestamps: true }
);

AlertSchema.index({ websiteId: 1, isRead: 1, createdAt: -1 });
AlertSchema.index({ userId: 1, isDismissed: 1, createdAt: -1 });
// Prevent duplicate alerts: one per type per website per day
AlertSchema.index(
  { websiteId: 1, type: 1, createdAt: 1 },
  { unique: false }  // not unique — allow daily re-trigger if persists
);

module.exports = mongoose.model('Alert', AlertSchema);
