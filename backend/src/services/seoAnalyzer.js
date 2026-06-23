const CATEGORIES = {
  ON_PAGE: 'On-Page SEO',
  TECHNICAL: 'Technical SEO',
  CONTENT: 'Content Quality',
  SOCIAL: 'Social & Open Graph',
};

const analyzeSEO = (crawlData) => {
  const issues = [];
  let totalWeight = 0;
  let passedWeight = 0;

  const check = ({
    id, category, title, passed, weight, severity,
    description, recommendation, details = null,
  }) => {
    totalWeight += weight;
    if (passed) passedWeight += weight;
    issues.push({
      checkId: id,
      category,
      title,
      status: passed ? 'passed' : severity,
      weight,
      severity,
      description: passed ? description : description,
      recommendation: passed ? null : recommendation,
      details,
    });
  };

  const { pageData, technical, images, links, isHttps } = crawlData;

  // ─── ON-PAGE SEO ──────────────────────────────────────────────────────────

  check({
    id: 'title_exists',
    category: CATEGORIES.ON_PAGE,
    title: 'Title Tag',
    passed: pageData.title.length > 0,
    weight: 8,
    severity: 'critical',
    description: pageData.title.length > 0
      ? `Title found: "${pageData.title}"`
      : 'No title tag found on the page.',
    recommendation: 'Add a descriptive title tag to the <head> section. The title is the most important on-page SEO element.',
    details: { value: pageData.title, length: pageData.titleLength },
  });

  if (pageData.title.length > 0) {
    const titleOptimal = pageData.titleLength >= 50 && pageData.titleLength <= 60;
    const titleTooShort = pageData.titleLength < 30;
    const titleTooLong = pageData.titleLength > 70;
    check({
      id: 'title_length',
      category: CATEGORIES.ON_PAGE,
      title: 'Title Tag Length',
      passed: titleOptimal,
      weight: 5,
      severity: titleTooLong || titleTooShort ? 'warning' : 'warning',
      description: titleOptimal
        ? `Title length is optimal (${pageData.titleLength} characters).`
        : `Title is ${titleTooShort ? 'too short' : titleTooLong ? 'too long' : 'suboptimal'} (${pageData.titleLength} chars). Optimal range: 50–60 characters.`,
      recommendation: titleTooShort
        ? 'Expand your title to include more relevant keywords while staying under 60 characters.'
        : 'Shorten your title to under 60 characters to prevent search engines from truncating it.',
      details: { length: pageData.titleLength, optimal: '50-60', current: pageData.title },
    });
  }

  check({
    id: 'meta_description_exists',
    category: CATEGORIES.ON_PAGE,
    title: 'Meta Description',
    passed: pageData.metaDescription.length > 0,
    weight: 7,
    severity: 'critical',
    description: pageData.metaDescription.length > 0
      ? `Meta description found (${pageData.metaDescriptionLength} characters).`
      : 'No meta description found.',
    recommendation: 'Add a compelling meta description (150–160 characters) that accurately summarizes the page content and encourages clicks.',
    details: { value: pageData.metaDescription, length: pageData.metaDescriptionLength },
  });

  if (pageData.metaDescription.length > 0) {
    const descOptimal = pageData.metaDescriptionLength >= 120 && pageData.metaDescriptionLength <= 160;
    check({
      id: 'meta_description_length',
      category: CATEGORIES.ON_PAGE,
      title: 'Meta Description Length',
      passed: descOptimal,
      weight: 4,
      severity: 'warning',
      description: descOptimal
        ? `Meta description length is optimal (${pageData.metaDescriptionLength} characters).`
        : `Meta description is ${pageData.metaDescriptionLength < 120 ? 'too short' : 'too long'} (${pageData.metaDescriptionLength} chars). Optimal: 120–160 characters.`,
      recommendation: pageData.metaDescriptionLength < 120
        ? 'Expand the meta description to 120–160 characters to provide more context.'
        : 'Shorten the meta description to under 160 characters to prevent truncation in SERPs.',
      details: { length: pageData.metaDescriptionLength, optimal: '120-160' },
    });
  }

  check({
    id: 'h1_exists',
    category: CATEGORIES.ON_PAGE,
    title: 'H1 Heading',
    passed: pageData.h1.length > 0,
    weight: 8,
    severity: 'critical',
    description: pageData.h1.length > 0
      ? `H1 found: "${pageData.h1[0]}"`
      : 'No H1 heading found on the page.',
    recommendation: 'Add exactly one H1 tag that clearly describes the main topic of the page, incorporating the primary keyword.',
    details: { headings: pageData.h1 },
  });

  check({
    id: 'h1_single',
    category: CATEGORIES.ON_PAGE,
    title: 'Single H1 Heading',
    passed: pageData.h1.length === 1,
    weight: 4,
    severity: 'warning',
    description: pageData.h1.length === 0
      ? 'No H1 found.'
      : pageData.h1.length === 1
      ? 'Page has exactly one H1 heading (optimal).'
      : `Page has ${pageData.h1.length} H1 headings. Only one is recommended.`,
    recommendation: 'Use only one H1 tag per page. Use H2–H6 for subheadings to create a proper content hierarchy.',
    details: { count: pageData.h1.length, headings: pageData.h1 },
  });

  const hasH2 = pageData.h2.length > 0;
  check({
    id: 'heading_structure',
    category: CATEGORIES.ON_PAGE,
    title: 'Heading Structure (H2–H6)',
    passed: hasH2,
    weight: 3,
    severity: 'warning',
    description: hasH2
      ? `Good heading structure: ${pageData.h2.length} H2, ${pageData.h3.length} H3, ${pageData.h4.length} H4 headings.`
      : 'No H2 headings found. Consider adding subheadings to structure your content.',
    recommendation: 'Use H2–H6 headings to create a logical content hierarchy. Include secondary keywords in H2 headings.',
    details: {
      h1: pageData.h1.length,
      h2: pageData.h2.length,
      h3: pageData.h3.length,
      h4: pageData.h4.length,
      samples: { h2: pageData.h2.slice(0, 5), h3: pageData.h3.slice(0, 5) },
    },
  });

  const allImagesHaveAlt = images.total === 0 || images.withoutAlt === 0;
  check({
    id: 'image_alt_text',
    category: CATEGORIES.ON_PAGE,
    title: 'Image Alt Text',
    passed: allImagesHaveAlt,
    weight: 6,
    severity: 'warning',
    description: images.total === 0
      ? 'No images found on the page.'
      : allImagesHaveAlt
      ? `All ${images.total} images have descriptive alt text.`
      : `${images.withoutAlt} of ${images.total} images are missing alt text.`,
    recommendation: 'Add descriptive alt text to all images. Alt text helps search engines understand image content and improves accessibility.',
    details: {
      total: images.total,
      withAlt: images.withAlt,
      withoutAlt: images.withoutAlt,
      examples: images.items.filter((i) => !i.hasAlt || !i.alt).slice(0, 5),
    },
  });

  const hasInternalLinks = links.internalCount >= 3;
  check({
    id: 'internal_links',
    category: CATEGORIES.ON_PAGE,
    title: 'Internal Links',
    passed: hasInternalLinks,
    weight: 4,
    severity: 'warning',
    description: hasInternalLinks
      ? `${links.internalCount} internal links found.`
      : `Only ${links.internalCount} internal links found. Add more to improve site navigation and distribute PageRank.`,
    recommendation: 'Add more internal links to relevant pages. Internal linking helps search engines crawl your site and distribute link equity.',
    details: { count: links.internalCount, examples: links.internal.slice(0, 5) },
  });

  const hasBrokenLinks = links.brokenCount > 0;
  check({
    id: 'broken_links',
    category: CATEGORIES.ON_PAGE,
    title: 'Broken Links',
    passed: !hasBrokenLinks,
    weight: 7,
    severity: 'critical',
    description: hasBrokenLinks
      ? `${links.brokenCount} broken link(s) found on the page.`
      : 'No broken links detected.',
    recommendation: 'Fix or remove all broken links. Broken links harm user experience and waste crawl budget.',
    details: { broken: links.broken, checkedCount: Math.min(15, links.totalCount) },
  });

  check({
    id: 'canonical_tag',
    category: CATEGORIES.ON_PAGE,
    title: 'Canonical Tag',
    passed: technical.hasCanonical,
    weight: 4,
    severity: 'warning',
    description: technical.hasCanonical
      ? `Canonical URL: ${technical.canonicalUrl || pageData.canonical}`
      : 'No canonical tag found.',
    recommendation: 'Add a canonical tag to specify the preferred version of the URL and prevent duplicate content issues.',
    details: { canonical: pageData.canonical },
  });

  // ─── TECHNICAL SEO ───────────────────────────────────────────────────────

  check({
    id: 'https',
    category: CATEGORIES.TECHNICAL,
    title: 'HTTPS / SSL',
    passed: isHttps,
    weight: 9,
    severity: 'critical',
    description: isHttps
      ? 'Website uses HTTPS — connection is secure.'
      : 'Website is not using HTTPS. This is a critical security and SEO issue.',
    recommendation: 'Install an SSL certificate and redirect all HTTP traffic to HTTPS. Google uses HTTPS as a ranking signal.',
    details: { url: crawlData.url, isHttps },
  });

  check({
    id: 'viewport_meta',
    category: CATEGORIES.TECHNICAL,
    title: 'Mobile Viewport',
    passed: technical.hasViewport,
    weight: 8,
    severity: 'critical',
    description: technical.hasViewport
      ? `Viewport meta tag found: "${pageData.viewport}"`
      : 'No viewport meta tag found. Page may not be mobile-friendly.',
    recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to make the page responsive.',
    details: { viewport: pageData.viewport },
  });

  check({
    id: 'robots_txt',
    category: CATEGORIES.TECHNICAL,
    title: 'Robots.txt',
    passed: technical.hasRobotsTxt,
    weight: 5,
    severity: 'warning',
    description: technical.hasRobotsTxt
      ? `Robots.txt found at ${technical.robotsTxtUrl}`
      : 'No robots.txt file found.',
    recommendation: 'Create a robots.txt file to control search engine crawling of your site. Include your sitemap URL.',
    details: {
      url: technical.robotsTxtUrl,
      content: technical.robotsTxtContent?.substring(0, 300),
    },
  });

  check({
    id: 'xml_sitemap',
    category: CATEGORIES.TECHNICAL,
    title: 'XML Sitemap',
    passed: technical.hasSitemap,
    weight: 5,
    severity: 'warning',
    description: technical.hasSitemap
      ? `XML sitemap found: ${technical.sitemapUrl}${technical.sitemapPageCount > 0 ? ` (${technical.sitemapPageCount} URLs)` : ''}`
      : 'No XML sitemap found.',
    recommendation: 'Create and submit an XML sitemap to help search engines discover and index all your pages.',
    details: { url: technical.sitemapUrl, pageCount: technical.sitemapPageCount },
  });

  check({
    id: 'structured_data',
    category: CATEGORIES.TECHNICAL,
    title: 'Structured Data / Schema',
    passed: technical.hasStructuredData,
    weight: 5,
    severity: 'warning',
    description: technical.hasStructuredData
      ? `Structured data found: ${technical.structuredDataTypes.join(', ')}`
      : 'No structured data (Schema.org / JSON-LD) found.',
    recommendation: 'Add JSON-LD structured data to help search engines understand your content and potentially display rich results.',
    details: { types: technical.structuredDataTypes },
  });

  const robotsBlocksIndexing =
    pageData.metaRobots &&
    (pageData.metaRobots.includes('noindex') || pageData.metaRobots.includes('none'));
  check({
    id: 'indexing_status',
    category: CATEGORIES.TECHNICAL,
    title: 'Indexing Status',
    passed: !robotsBlocksIndexing,
    weight: 8,
    severity: 'critical',
    description: robotsBlocksIndexing
      ? `Page is blocked from indexing via meta robots: "${pageData.metaRobots}"`
      : 'Page is allowed to be indexed by search engines.',
    recommendation: 'Remove noindex directives if you want this page to appear in search results.',
    details: { robotsMeta: pageData.metaRobots },
  });

  // ─── SOCIAL / OPEN GRAPH ─────────────────────────────────────────────────

  check({
    id: 'og_title',
    category: CATEGORIES.SOCIAL,
    title: 'Open Graph Title',
    passed: !!technical.ogTitle,
    weight: 3,
    severity: 'warning',
    description: technical.ogTitle
      ? `OG title: "${technical.ogTitle}"`
      : 'Missing og:title meta tag.',
    recommendation: 'Add og:title to control how your page title appears when shared on social media.',
    details: { value: technical.ogTitle },
  });

  check({
    id: 'og_description',
    category: CATEGORIES.SOCIAL,
    title: 'Open Graph Description',
    passed: !!technical.ogDescription,
    weight: 3,
    severity: 'warning',
    description: technical.ogDescription
      ? `OG description found.`
      : 'Missing og:description meta tag.',
    recommendation: 'Add og:description to control how your page description appears on social media.',
    details: { value: technical.ogDescription },
  });

  check({
    id: 'og_image',
    category: CATEGORIES.SOCIAL,
    title: 'Open Graph Image',
    passed: !!technical.ogImage,
    weight: 4,
    severity: 'warning',
    description: technical.ogImage ? `OG image found.` : 'Missing og:image meta tag.',
    recommendation: 'Add a high-quality og:image (1200×630px recommended) to improve click-through rates on social media.',
    details: { value: technical.ogImage },
  });

  check({
    id: 'twitter_card',
    category: CATEGORIES.SOCIAL,
    title: 'Twitter Card',
    passed: technical.hasTwitterCard,
    weight: 2,
    severity: 'warning',
    description: technical.hasTwitterCard
      ? `Twitter Card type: "${technical.twitterCard}"`
      : 'No Twitter Card meta tags found.',
    recommendation: 'Add Twitter Card meta tags (twitter:card, twitter:title, etc.) to control how your content appears when shared on X/Twitter.',
    details: {
      card: technical.twitterCard,
      title: technical.twitterTitle,
      description: technical.twitterDescription,
    },
  });

  // ─── CONTENT QUALITY ──────────────────────────────────────────────────────

  const hasAdequateContent = pageData.wordCount >= 300;
  check({
    id: 'content_length',
    category: CATEGORIES.CONTENT,
    title: 'Content Length',
    passed: hasAdequateContent,
    weight: 5,
    severity: 'warning',
    description: hasAdequateContent
      ? `Page has ${pageData.wordCount} words — good content depth.`
      : `Page has only ${pageData.wordCount} words. More content helps with ranking.`,
    recommendation: 'Aim for at least 300 words for informational pages, and 1,500+ for competitive topics. Quality matters more than quantity.',
    details: { wordCount: pageData.wordCount, recommended: 300 },
  });

  const hasLanguage = !!pageData.language;
  check({
    id: 'language_declaration',
    category: CATEGORIES.CONTENT,
    title: 'Language Declaration',
    passed: hasLanguage,
    weight: 2,
    severity: 'warning',
    description: hasLanguage
      ? `Language declared: "${pageData.language}"`
      : 'No language attribute found on the <html> tag.',
    recommendation: 'Add the lang attribute to the <html> tag (e.g., <html lang="en">) to help browsers and assistive technologies.',
    details: { language: pageData.language },
  });

  // ─── CALCULATE SCORES ─────────────────────────────────────────────────────

  const score = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 0;

  // Group by category
  const categoryMap = {};
  for (const issue of issues) {
    if (!categoryMap[issue.category]) {
      categoryMap[issue.category] = { name: issue.category, issues: [], totalWeight: 0, passedWeight: 0 };
    }
    categoryMap[issue.category].issues.push(issue);
    categoryMap[issue.category].totalWeight += issue.weight;
    if (issue.status === 'passed') categoryMap[issue.category].passedWeight += issue.weight;
  }

  const categories = Object.values(categoryMap).map((cat) => ({
    name: cat.name,
    score: cat.totalWeight > 0 ? Math.round((cat.passedWeight / cat.totalWeight) * 100) : 0,
    passedCount: cat.issues.filter((i) => i.status === 'passed').length,
    warningCount: cat.issues.filter((i) => i.status === 'warning').length,
    criticalCount: cat.issues.filter((i) => i.status === 'critical').length,
    issues: cat.issues,
  }));

  // Top keyword analysis
  const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','was','are','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','it','its','this','that','these','those','i','we','you','he','she','they']);
  const wordFreq = {};
  (pageData.bodyText || '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w)).forEach(w => {
    wordFreq[w] = (wordFreq[w] || 0) + 1;
  });
  const topKeywords = Object.entries(wordFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([word, count]) => ({
      word,
      count,
      density: pageData.wordCount > 0 ? parseFloat(((count / pageData.wordCount) * 100).toFixed(2)) : 0,
    }));

  return {
    score,
    categories,
    issues,
    keywords: {
      primary: topKeywords[0]?.word || '',
      topKeywords,
    },
    summary: {
      totalChecks: issues.length,
      passed: issues.filter((i) => i.status === 'passed').length,
      warnings: issues.filter((i) => i.status === 'warning').length,
      critical: issues.filter((i) => i.status === 'critical').length,
    },
  };
};

module.exports = { analyzeSEO };
