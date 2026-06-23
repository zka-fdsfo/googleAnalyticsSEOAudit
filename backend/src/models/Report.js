const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema(
  {
    websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },

    type:  { type: String, enum: ['weekly', 'monthly', 'executive', 'custom'], required: true },
    title: { type: String },

    period: {
      startDate: { type: Date },
      endDate:   { type: Date },
    },

    status: {
      type: String,
      enum: ['generating', 'ready', 'failed'],
      default: 'generating',
    },

    // ── Snapshot of all KPIs at generation time ───────────────────────────
    data: {
      seoScore:      { type: Number },
      organicTraffic:{ type: Number },
      clicks:        { type: Number },
      impressions:   { type: Number },
      ctr:           { type: Number },
      avgPosition:   { type: Number },
      newKeywords:   { type: Number },
      lostKeywords:  { type: Number },
      recommendations: { open: Number, fixed: Number },
      opportunities:   { total: Number, highPriority: Number },
      wins:          [{ type: String }],
      losses:        [{ type: String }],
      highlights:    [{ type: String }],
    },

    // ── File exports (future — S3/R2 storage) ─────────────────────────────
    pdfUrl:   { type: String },
    excelUrl: { type: String },

    generatedAt: { type: Date },
    error:       { type: String },
  },
  { timestamps: true }
);

ReportSchema.index({ websiteId: 1, type: 1, createdAt: -1 });
ReportSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Report', ReportSchema);