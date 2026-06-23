const Audit = require('../models/Audit');
const User = require('../models/User');
const { crawlPage, normalizeUrl } = require('../services/crawler');
const { analyzeSEO } = require('../services/seoAnalyzer');
const { fetchPageSpeedInsights } = require('../services/pageSpeed');

const startAudit = async (req, res, next) => {
  try {
    const { url } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'URL is required.' });
    }

    let normalizedUrl;
    try {
      normalizedUrl = normalizeUrl(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL. Please enter a valid website address.' });
    }

    const domain = new URL(normalizedUrl).hostname;
    const audit = await Audit.create({
      url: normalizedUrl,
      domain,
      userId: req.user?._id || null,
      status: 'processing',
    });

    // Run audit asynchronously
    runAuditAsync(audit._id, normalizedUrl).catch((err) => {
      console.error(`Audit failed for ${normalizedUrl}:`, err.message);
    });

    res.status(202).json({
      message: 'Audit started.',
      auditId: audit._id,
      url: normalizedUrl,
      status: 'processing',
    });
  } catch (err) {
    next(err);
  }
};

const runAuditAsync = async (auditId, url) => {
  try {
    const crawlData = await crawlPage(url);
    const seoResults = analyzeSEO(crawlData);

    let pageSpeed = null;
    try {
      pageSpeed = await fetchPageSpeedInsights(url, 'mobile');
    } catch {
      // PageSpeed is optional
    }

    const performance = pageSpeed
      ? {
          score: pageSpeed.performanceScore,
          lcp: pageSpeed.metrics?.lcp?.value,
          fid: pageSpeed.metrics?.fid?.value,
          cls: pageSpeed.metrics?.cls?.value,
          fcp: pageSpeed.metrics?.fcp?.value,
          ttfb: pageSpeed.metrics?.ttfb?.value,
          speedIndex: pageSpeed.metrics?.speedIndex?.value,
          loadTime: crawlData.loadTime,
          pageSize: crawlData.pageSize,
        }

      : {
          loadTime: crawlData.loadTime,
          pageSize: crawlData.pageSize,
        };

    await Audit.findByIdAndUpdate(auditId, {
      status: 'completed',
      score: seoResults.score,
      pageData: {
        title: crawlData.pageData.title,
        titleLength: crawlData.pageData.titleLength,
        metaDescription: crawlData.pageData.metaDescription,
        metaDescriptionLength: crawlData.pageData.metaDescriptionLength,
        h1: crawlData.pageData.h1,
        h2: crawlData.pageData.h2,
        h3: crawlData.pageData.h3,
        h4: crawlData.pageData.h4,
        wordCount: crawlData.pageData.wordCount,
        language: crawlData.pageData.language,
        charset: crawlData.pageData.charset,
        viewport: crawlData.pageData.viewport,
        canonical: crawlData.pageData.canonical,
        robotsMeta: crawlData.pageData.metaRobots,
        favicon: crawlData.pageData.favicon,
        contentType: crawlData.contentType,
        httpStatusCode: crawlData.httpStatusCode,
      },
      categories: seoResults.categories,
      links: crawlData.links,
      images: crawlData.images,
      technical: crawlData.technical,
      performance,
      keywords: seoResults.keywords,
      completedAt: new Date(),
    });

    // Update audit count for authenticated users
    if ((await Audit.findById(auditId))?.userId) {
      await User.findByIdAndUpdate((await Audit.findById(auditId)).userId, {
        $inc: { auditCount: 1 },
      });
    }
  } catch (err) {
    await Audit.findByIdAndUpdate(auditId, {
      status: 'failed',
      error: err.message || 'Analysis failed. The website may be unreachable.',
    });
    throw err;
  }
};

const getAudit = async (req, res, next) => {
  try {
    const audit = await Audit.findById(req.params.id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found.' });
    }

    res.json({ audit });
  } catch (err) {
    next(err);
  }
};

const getAuditHistory = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const [audits, total] = await Promise.all([
      Audit.find({ userId: req.user._id })
        .select('url domain score status createdAt completedAt categories')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Audit.countDocuments({ userId: req.user._id }),
    ]);

    res.json({
      audits,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

const deleteAudit = async (req, res, next) => {
  try {
    const audit = await Audit.findById(req.params.id);
    if (!audit) return res.status(404).json({ error: 'Audit not found.' });
    if (req.user && audit.userId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this audit.' });
    }

    await Audit.findByIdAndDelete(req.params.id);
    res.json({ message: 'Audit deleted.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { startAudit, getAudit, getAuditHistory, deleteAudit };
