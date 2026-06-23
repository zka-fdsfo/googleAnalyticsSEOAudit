const mongoose = require('mongoose');

const IssueSchema = new mongoose.Schema({
  checkId: String,
  status: { type: String, enum: ['passed', 'warning', 'critical'] },
  title: String,
  description: String,
  recommendation: String,
  details: mongoose.Schema.Types.Mixed,
  weight: Number,
  impact: String,
}, { _id: false });

const CategorySchema = new mongoose.Schema({
  name: String,
  score: Number,
  passedCount: Number,
  warningCount: Number,
  criticalCount: Number,
  issues: [IssueSchema],
}, { _id: false });

const AuditSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    domain: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    score: { type: Number, min: 0, max: 100, default: 0 },

    pageData: {
      title: String,
      titleLength: Number,
      metaDescription: String,
      metaDescriptionLength: Number,
      h1: [String],
      h2: [String],
      h3: [String],
      h4: [String],
      wordCount: Number,
      language: String,
      charset: String,
      viewport: String,
      canonical: String,
      robotsMeta: String,
      favicon: String,
      contentType: String,
      httpStatusCode: Number,
    },

    categories: [CategorySchema],

    links: {
      internal: [String],
      external: [String],
      broken: [
        {
          url: String,
          statusCode: Number,
          error: String,
          _id: false,
        },
      ],
      totalCount: Number,
      internalCount: Number,
      externalCount: Number,
      brokenCount: Number,
    },

    images: {
      total: Number,
      withAlt: Number,
      withoutAlt: Number,
      items: [
        {
          src: String,
          alt: String,
          hasAlt: Boolean,
          _id: false,
        },
      ],
    },

    technical: {
      isHttps: Boolean,
      hasCanonical: Boolean,
      hasViewport: Boolean,
      hasRobotsTxt: Boolean,
      robotsTxtContent: String,
      robotsTxtUrl: String,
      hasSitemap: Boolean,
      sitemapUrl: String,
      sitemapPageCount: Number,
      hasStructuredData: Boolean,
      structuredDataTypes: [String],
      hasOpenGraph: Boolean,
      ogTitle: String,
      ogDescription: String,
      ogImage: String,
      hasTwitterCard: Boolean,
      twitterCard: String,
    },

    performance: {
      score: Number,
      lcp: Number,
      fid: Number,
      cls: Number,
      fcp: Number,
      ttfb: Number,
      speedIndex: Number,
      loadTime: Number,
      pageSize: Number,
      requests: Number,
    },

    keywords: {
      primary: String,
      density: mongoose.Schema.Types.Mixed,
      topKeywords: [{ word: String, count: Number, density: Number }],
    },

    error: String,
    completedAt: Date,
  },
  {
    timestamps: true,
  }
);

AuditSchema.index({ url: 1, createdAt: -1 });
AuditSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Audit', AuditSchema);
