const axios = require('axios');

const fetchPageSpeedInsights = async (url, strategy = 'mobile') => {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  const endpoint = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

  const params = new URLSearchParams({
    url,
    strategy,
    ...(apiKey ? { key: apiKey } : {}),
    category: ['performance', 'accessibility', 'seo', 'best-practices'].join('&category='),
  });

  try {
    const response = await axios.get(`${endpoint}?${params}`, { timeout: 30000 });
    const data = response.data;

    const lighthouse = data.lighthouseResult;
    const categories = lighthouse?.categories || {};
    const audits = lighthouse?.audits || {};

    const getMetric = (id) => {
      const audit = audits[id];
      if (!audit) return null;
      return {
        value: audit.numericValue,
        displayValue: audit.displayValue,
        score: audit.score,
      };
    };

    return {
      performanceScore: Math.round((categories.performance?.score || 0) * 100),
      accessibilityScore: Math.round((categories.accessibility?.score || 0) * 100),
      seoScore: Math.round((categories.seo?.score || 0) * 100),
      bestPracticesScore: Math.round((categories['best-practices']?.score || 0) * 100),

      metrics: {
        lcp: getMetric('largest-contentful-paint'),
        fid: getMetric('max-potential-fid'),
        cls: getMetric('cumulative-layout-shift'),
        fcp: getMetric('first-contentful-paint'),
        ttfb: getMetric('server-response-time'),
        speedIndex: getMetric('speed-index'),
        tti: getMetric('interactive'),
        tbt: getMetric('total-blocking-time'),
      },

      opportunities: Object.values(audits)
        .filter((a) => a.details?.type === 'opportunity' && a.score !== null && a.score < 1)
        .map((a) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          score: a.score,
          displayValue: a.displayValue,
        }))
        .slice(0, 5),

      strategy,
    };
  } catch (err) {
    console.warn(`PageSpeed API error: ${err.message}`);
    return null;
  }
};

module.exports = { fetchPageSpeedInsights };
