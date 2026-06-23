const mongoose = require('mongoose');

// Maps audit check IDs to enriched recommendation metadata
const CHECK_META = {
  title_exists:         { seoImpact: 'critical', trafficImpact: 'high',   priority: 10, difficulty: 'easy',   effort: '15 mins',  reason: 'Title tags are the #1 on-page SEO factor and directly influence click-through rates in search results.' },
  title_length:         { seoImpact: 'high',     trafficImpact: 'medium', priority: 8,  difficulty: 'easy',   effort: '10 mins',  reason: 'Titles cut off by Google (>60 chars) reduce CTR. Titles too short miss keyword opportunities.' },
  meta_description_exists: { seoImpact: 'high',  trafficImpact: 'high',   priority: 9,  difficulty: 'easy',   effort: '20 mins',  reason: 'Meta descriptions act as ad copy in SERPs. Missing descriptions force Google to generate snippets, often poorly.' },
  meta_description_length: { seoImpact: 'medium', trafficImpact: 'medium', priority: 6,  difficulty: 'easy',   effort: '10 mins',  reason: 'Truncated meta descriptions reduce CTR by not communicating full value proposition.' },
  h1_exists:            { seoImpact: 'critical', trafficImpact: 'high',   priority: 9,  difficulty: 'easy',   effort: '10 mins',  reason: 'H1 is the primary content signal for search engines to understand page topic.' },
  h1_single:            { seoImpact: 'medium',   trafficImpact: 'low',    priority: 5,  difficulty: 'easy',   effort: '15 mins',  reason: 'Multiple H1s confuse search engines about the primary topic of the page.' },
  heading_structure:    { seoImpact: 'medium',   trafficImpact: 'low',    priority: 4,  difficulty: 'easy',   effort: '30 mins',  reason: 'Proper heading hierarchy improves content scannability and semantic structure for crawlers.' },
  image_alt_text:       { seoImpact: 'medium',   trafficImpact: 'medium', priority: 6,  difficulty: 'medium', effort: '1-2 hours', reason: 'Alt text enables image search indexing and improves accessibility scores which impact ranking.' },
  internal_links:       { seoImpact: 'high',     trafficImpact: 'medium', priority: 7,  difficulty: 'medium', effort: '1-3 hours', reason: 'Internal links distribute PageRank and help search engines discover and index your content.' },
  broken_links:         { seoImpact: 'high',     trafficImpact: 'medium', priority: 8,  difficulty: 'easy',   effort: '30 mins',  reason: 'Broken links waste crawl budget, harm user experience, and signal poor site maintenance.' },
  canonical_tag:        { seoImpact: 'high',     trafficImpact: 'medium', priority: 7,  difficulty: 'easy',   effort: '20 mins',  reason: 'Missing canonicals cause duplicate content issues which dilute PageRank across multiple URLs.' },
  https:                { seoImpact: 'critical', trafficImpact: 'high',   priority: 10, difficulty: 'hard',   effort: '1-4 hours', reason: 'HTTPS is a confirmed Google ranking factor. Non-HTTPS sites show security warnings reducing trust and conversions.' },
  viewport_meta:        { seoImpact: 'critical', trafficImpact: 'high',   priority: 9,  difficulty: 'easy',   effort: '10 mins',  reason: 'Mobile-first indexing means non-responsive pages are heavily penalized in mobile search results.' },
  robots_txt:           { seoImpact: 'medium',   trafficImpact: 'medium', priority: 6,  difficulty: 'medium', effort: '1 hour',   reason: 'Robots.txt controls crawler access. Missing or misconfigured files can block critical pages from indexing.' },
  xml_sitemap:          { seoImpact: 'high',     trafficImpact: 'medium', priority: 7,  difficulty: 'medium', effort: '2 hours',  reason: 'Sitemaps accelerate discovery and indexing of all pages, especially for large or new sites.' },
  structured_data:      { seoImpact: 'high',     trafficImpact: 'high',   priority: 7,  difficulty: 'hard',   effort: '2-4 hours', reason: 'Schema markup enables rich results (stars, FAQs, breadcrumbs) which dramatically increase CTR.' },
  indexing_status:      { seoImpact: 'critical', trafficImpact: 'critical', priority: 10, difficulty: 'medium', effort: '30 mins', reason: 'A noindexed page receives zero organic traffic regardless of its quality or backlinks.' },
  og_title:             { seoImpact: 'low',      trafficImpact: 'medium', priority: 3,  difficulty: 'easy',   effort: '15 mins',  reason: 'Open Graph tags control how pages appear when shared on social media, impacting referral traffic.' },
  og_description:       { seoImpact: 'low',      trafficImpact: 'medium', priority: 3,  difficulty: 'easy',   effort: '10 mins',  reason: 'Missing OG descriptions result in poor social media previews, reducing social sharing engagement.' },
  og_image:             { seoImpact: 'low',      trafficImpact: 'medium', priority: 4,  difficulty: 'easy',   effort: '30 mins',  reason: 'Pages without OG images show generic previews on social platforms, significantly reducing CTR.' },
  twitter_card:         { seoImpact: 'low',      trafficImpact: 'low',    priority: 2,  difficulty: 'easy',   effort: '10 mins',  reason: 'Twitter Cards improve visual presentation on X/Twitter, increasing engagement for social-driven traffic.' },
  content_length:       { seoImpact: 'high',     trafficImpact: 'high',   priority: 7,  difficulty: 'hard',   effort: '4-8 hours', reason: 'Thin content (under 300 words) rarely ranks. Comprehensive content on competitive topics needs 1,500+ words.' },
  language_declaration: { seoImpact: 'low',      trafficImpact: 'low',    priority: 2,  difficulty: 'easy',   effort: '5 mins',   reason: 'Language declarations help browsers and assistive technologies serve content correctly.' },
};

const getCheckMeta = (checkId) => CHECK_META[checkId] || {
  seoImpact: 'medium', trafficImpact: 'medium', priority: 5, difficulty: 'medium', effort: 'Unknown', reason: 'Fixing this issue will improve your SEO score.',
};

const RecommendationSchema = new mongoose.Schema(
  {
    websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    auditId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Audit'                  },

    checkId:  { type: String, required: true },
    category: { type: String },

    // Core content
    problem:        { type: String },
    recommendation: { type: String },
    reason:         { type: String },

    // Impact
    seoImpact:     { type: String, enum: ['critical', 'high', 'medium', 'low'], default: 'medium' },
    trafficImpact: { type: String, enum: ['critical', 'high', 'medium', 'low', 'minimal'], default: 'medium' },

    // Effort
    priority:        { type: Number, min: 1, max: 10, default: 5 },
    difficulty:      { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    estimatedEffort: { type: String },

    // Lifecycle
    status:     { type: String, enum: ['open', 'in_progress', 'fixed', 'ignored'], default: 'open' },
    resolvedAt: { type: Date },
    notes:      { type: String, maxlength: 1000 },

    // Tracking
    firstSeenAt:  { type: Date, default: Date.now },
    lastDetectedAt: { type: Date, default: Date.now },
    occurrenceCount: { type: Number, default: 1 },
  },
  { timestamps: true }
);

// One open recommendation per check per website (prevents duplicates)
RecommendationSchema.index({ websiteId: 1, checkId: 1, status: 1 });
RecommendationSchema.index({ userId: 1, status: 1, priority: -1 });
RecommendationSchema.index({ websiteId: 1, status: 1, priority: -1 });

RecommendationSchema.statics.getCheckMeta = getCheckMeta;

module.exports = mongoose.model('Recommendation', RecommendationSchema);
module.exports.getCheckMeta = getCheckMeta;
