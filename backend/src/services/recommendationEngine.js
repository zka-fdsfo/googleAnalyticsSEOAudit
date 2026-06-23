const Recommendation = require('../models/Recommendation');
const { getCheckMeta } = require('../models/Recommendation');

/**
 * Converts completed Audit issues into structured, trackable Recommendations.
 * - Upserts open recommendations (avoids duplicates)
 * - Auto-resolves recommendations when the underlying check passes
 * - Tracks how many times an issue has been detected
 */
const processAuditRecommendations = async (audit, websiteId) => {
  if (!audit || !audit.categories?.length) return { created: 0, resolved: 0 };

  const allIssues      = audit.categories.flatMap((c) => c.issues || []);
  const failedIssues   = allIssues.filter((i) => i.status !== 'passed');
  const passedCheckIds = allIssues.filter((i) => i.status === 'passed').map((i) => i.checkId);

  let created  = 0;
  let updated  = 0;
  let resolved = 0;

  // Upsert failed issues → open recommendations
  for (const issue of failedIssues) {
    const meta = getCheckMeta(issue.checkId);

    const doc = {
      websiteId,
      userId:         audit.userId,
      auditId:        audit._id,
      checkId:        issue.checkId,
      category:       issue.category,
      problem:        issue.description,
      recommendation: issue.recommendation,
      reason:         meta.reason,
      seoImpact:      meta.seoImpact,
      trafficImpact:  meta.trafficImpact,
      priority:       meta.priority,
      difficulty:     meta.difficulty,
      estimatedEffort: meta.effort,
      lastDetectedAt: new Date(),
    };

    const existing = await Recommendation.findOne({
      websiteId,
      checkId: issue.checkId,
      status: { $in: ['open', 'in_progress'] },
    });

    if (existing) {
      await Recommendation.findByIdAndUpdate(existing._id, {
        $set:  { lastDetectedAt: new Date(), problem: doc.problem },
        $inc:  { occurrenceCount: 1 },
      });
      updated++;
    } else {
      await Recommendation.create({ ...doc, firstSeenAt: new Date(), occurrenceCount: 1 });
      created++;
    }
  }

  // Auto-resolve open recommendations whose checks now pass
  if (passedCheckIds.length > 0) {
    const result = await Recommendation.updateMany(
      {
        websiteId,
        checkId: { $in: passedCheckIds },
        status:  { $in: ['open', 'in_progress'] },
      },
      { $set: { status: 'fixed', resolvedAt: new Date() } }
    );
    resolved = result.modifiedCount;
  }

  return { created, updated, resolved };
};

/**
 * Returns all open recommendations for a website, sorted by priority desc.
 */
const getRecommendations = async (websiteId, { status = 'open', category, limit = 50, skip = 0 } = {}) => {
  const filter = { websiteId };
  if (status)   filter.status   = status;
  if (category) filter.category = category;

  const [items, total] = await Promise.all([
    Recommendation.find(filter)
      .sort({ priority: -1, lastDetectedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Recommendation.countDocuments(filter),
  ]);

  return { items, total };
};

/**
 * Update recommendation status (open → in_progress / fixed / ignored).
 */
const updateRecommendationStatus = async (recommendationId, userId, { status, notes }) => {
  const update = { status };
  if (notes) update.notes = notes;
  if (status === 'fixed' || status === 'ignored') update.resolvedAt = new Date();

  return Recommendation.findOneAndUpdate(
    { _id: recommendationId, userId },
    { $set: update },
    { new: true }
  );
};

/**
 * Summary counts for the dashboard badge.
 */
const getRecommendationSummary = async (websiteId) => {
  const result = await Recommendation.aggregate([
    { $match: { websiteId: new (require('mongoose').Types.ObjectId)(websiteId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const summary = { open: 0, in_progress: 0, fixed: 0, ignored: 0, total: 0 };
  result.forEach((r) => {
    summary[r._id] = r.count;
    summary.total += r.count;
  });
  return summary;
};

module.exports = {
  processAuditRecommendations,
  getRecommendations,
  updateRecommendationStatus,
  getRecommendationSummary,
};
