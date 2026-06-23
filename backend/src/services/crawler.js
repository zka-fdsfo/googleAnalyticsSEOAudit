const axios = require('axios');
const cheerio = require('cheerio');

const USER_AGENT =
  'Mozilla/5.0 (compatible; SEOAuditBot/1.0; +https://seoaudit.tool)';

const normalizeUrl = (url) => {
  let normalized = url.trim();
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = 'https://' + normalized;
  }
  try {
    const parsed = new URL(normalized);
    return parsed.href;
  } catch {
    throw new Error('Invalid URL format.');
  }
};

const fetchUrl = async (url, options = {}) => {
  const { timeout = 15000, followRedirects = true } = options;
  const response = await axios.get(url, {
    timeout,
    maxRedirects: followRedirects ? 10 : 0,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
    },
    validateStatus: (status) => status < 600,
  });
  return response;
};

const checkLinkStatus = async (url, timeout = 8000) => {
  try {
    const response = await axios.head(url, {
      timeout,
      headers: { 'User-Agent': USER_AGENT },
      validateStatus: () => true,
      maxRedirects: 5,
    });
    if (response.status === 405) {
      const getResponse = await axios.get(url, {
        timeout,
        headers: { 'User-Agent': USER_AGENT },
        validateStatus: () => true,
        maxRedirects: 5,
      });
      return { status: getResponse.status, ok: getResponse.status < 400 };
    }
    return { status: response.status, ok: response.status < 400 };
  } catch (err) {
    return { status: 0, ok: false, error: err.message };
  }
};

const crawlPage = async (targetUrl) => {
  const url = normalizeUrl(targetUrl);
  const parsedUrl = new URL(url);
  const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
  const domain = parsedUrl.hostname;
  const startTime = Date.now();

  const response = await fetchUrl(url);
  const loadTime = Date.now() - startTime;

  const html = response.data;
  const $ = cheerio.load(html);
  const pageSize = Buffer.byteLength(html, 'utf8');

  // Core metadata
  const title = $('title').first().text().trim();
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const metaRobots = $('meta[name="robots"]').attr('content') || '';
  const metaKeywords = $('meta[name="keywords"]').attr('content') || '';
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  const charset =
    $('meta[charset]').attr('charset') ||
    $('meta[http-equiv="Content-Type"]').attr('content')?.match(/charset=([^;]+)/i)?.[1] ||
    'UTF-8';
  const language = $('html').attr('lang') || '';
  const viewport = $('meta[name="viewport"]').attr('content') || '';
  const favicon =
    $('link[rel="icon"]').attr('href') ||
    $('link[rel="shortcut icon"]').attr('href') ||
    '/favicon.ico';

  // Headings
  const h1 = $('h1').map((_, el) => $(el).text().trim()).get();
  const h2 = $('h2').map((_, el) => $(el).text().trim()).get();
  const h3 = $('h3').map((_, el) => $(el).text().trim()).get();
  const h4 = $('h4').map((_, el) => $(el).text().trim()).get();
  const h5 = $('h5').map((_, el) => $(el).text().trim()).get();
  const h6 = $('h6').map((_, el) => $(el).text().trim()).get();

  // Body text / word count
  const bodyText = $('body')
    .clone()
    .find('script, style, noscript, header, footer, nav')
    .remove()
    .end()
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

  // Images
  const images = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src') || '';
    const alt = $(el).attr('alt');
    const hasAlt = alt !== undefined && alt !== null;
    images.push({
      src: src.startsWith('http') ? src : src ? `${baseUrl}${src.startsWith('/') ? '' : '/'}${src}` : '',
      alt: alt || '',
      hasAlt,
      isEmpty: hasAlt && alt.trim() === '',
    });
  });

  // Links
  const internalLinks = new Set();
  const externalLinks = new Set();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    try {
      const absoluteUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
      const linkDomain = new URL(absoluteUrl).hostname;
      if (linkDomain === domain || linkDomain === `www.${domain}` || `www.${linkDomain}` === domain) {
        internalLinks.add(absoluteUrl);
      } else {
        externalLinks.add(absoluteUrl);
      }
    } catch {
      // Skip malformed URLs
    }
  });

  // Structured data
  const structuredDataItems = [];
  const structuredDataTypes = new Set();
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      structuredDataItems.push(data);
      const type = data['@type'] || (Array.isArray(data['@graph']) ? data['@graph'].map(i => i['@type']) : null);
      if (type) [].concat(type).filter(Boolean).forEach(t => structuredDataTypes.add(t));
    } catch {
      // Skip invalid JSON
    }
  });

  // Open Graph
  const og = {
    title: $('meta[property="og:title"]').attr('content') || '',
    description: $('meta[property="og:description"]').attr('content') || '',
    image: $('meta[property="og:image"]').attr('content') || '',
    url: $('meta[property="og:url"]').attr('content') || '',
    type: $('meta[property="og:type"]').attr('content') || '',
    siteName: $('meta[property="og:site_name"]').attr('content') || '',
  };

  // Twitter
  const twitter = {
    card: $('meta[name="twitter:card"]').attr('content') || '',
    title: $('meta[name="twitter:title"]').attr('content') || '',
    description: $('meta[name="twitter:description"]').attr('content') || '',
    image: $('meta[name="twitter:image"]').attr('content') || '',
  };

  // Fetch robots.txt
  let robotsTxtContent = '';
  let robotsTxtUrl = `${baseUrl}/robots.txt`;
  let hasRobotsTxt = false;
  try {
    const robotsRes = await axios.get(robotsTxtUrl, {
      timeout: 8000,
      headers: { 'User-Agent': USER_AGENT },
      validateStatus: (s) => s < 600,
    });
    if (robotsRes.status === 200 && typeof robotsRes.data === 'string') {
      robotsTxtContent = robotsRes.data.substring(0, 5000);
      hasRobotsTxt = true;
    }
  } catch {
    hasRobotsTxt = false;
  }

  // Find sitemap from robots.txt or common paths
  let sitemapUrl = '';
  let hasSitemap = false;
  let sitemapPageCount = 0;

  const sitemapMatch = robotsTxtContent.match(/Sitemap:\s*(.+)/i);
  if (sitemapMatch) {
    sitemapUrl = sitemapMatch[1].trim();
  } else {
    for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/sitemap/sitemap.xml']) {
      try {
        const sitemapRes = await axios.get(`${baseUrl}${path}`, {
          timeout: 8000,
          headers: { 'User-Agent': USER_AGENT },
          validateStatus: (s) => s < 600,
        });
        if (sitemapRes.status === 200) {
          sitemapUrl = `${baseUrl}${path}`;
          break;
        }
      } catch {
        continue;
      }
    }
  }

  if (sitemapUrl) {
    try {
      const xml2js = require('xml2js');
      const sitemapRes = await axios.get(sitemapUrl, { timeout: 10000, headers: { 'User-Agent': USER_AGENT } });
      const parsed = await xml2js.parseStringPromise(sitemapRes.data);
      hasSitemap = true;
      if (parsed.urlset?.url) {
        sitemapPageCount = parsed.urlset.url.length;
      } else if (parsed.sitemapindex?.sitemap) {
        sitemapPageCount = parsed.sitemapindex.sitemap.length;
      }
    } catch {
      hasSitemap = !!sitemapUrl;
    }
  }

  // Check broken links (sample up to 15)
  const allLinksToCheck = [...Array.from(internalLinks), ...Array.from(externalLinks)].slice(0, 15);
  const brokenLinks = [];

  if (allLinksToCheck.length > 0) {
    const results = await Promise.allSettled(
      allLinksToCheck.map((linkUrl) => checkLinkStatus(linkUrl, 6000))
    );
    results.forEach((result, idx) => {
      const linkUrl = allLinksToCheck[idx];
      if (result.status === 'fulfilled' && !result.value.ok) {
        brokenLinks.push({
          url: linkUrl,
          statusCode: result.value.status,
          error: result.value.error || `HTTP ${result.value.status}`,
        });
      } else if (result.status === 'rejected') {
        brokenLinks.push({ url: linkUrl, statusCode: 0, error: 'Connection failed' });
      }
    });
  }

  return {
    url,
    domain,
    baseUrl,
    isHttps: url.startsWith('https://'),
    httpStatusCode: response.status,
    contentType: response.headers['content-type'] || '',
    loadTime,
    pageSize,
    html,

    pageData: {
      title,
      titleLength: title.length,
      metaDescription,
      metaDescriptionLength: metaDescription.length,
      metaKeywords,
      metaRobots,
      canonical,
      charset,
      language,
      viewport,
      favicon,
      h1, h2, h3, h4, h5, h6,
      wordCount,
      bodyText: bodyText.substring(0, 2000),
    },

    images: {
      total: images.length,
      withAlt: images.filter((i) => i.hasAlt && !i.isEmpty).length,
      withoutAlt: images.filter((i) => !i.hasAlt || i.isEmpty).length,
      items: images.slice(0, 50),
    },

    links: {
      internal: Array.from(internalLinks).slice(0, 100),
      external: Array.from(externalLinks).slice(0, 100),
      broken: brokenLinks,
      internalCount: internalLinks.size,
      externalCount: externalLinks.size,
      totalCount: internalLinks.size + externalLinks.size,
      brokenCount: brokenLinks.length,
    },

    technical: {
      isHttps: url.startsWith('https://'),
      hasCanonical: canonical.length > 0,
      hasViewport: viewport.length > 0,
      hasRobotsTxt,
      robotsTxtContent,
      robotsTxtUrl,
      hasSitemap,
      sitemapUrl,
      sitemapPageCount,
      hasStructuredData: structuredDataItems.length > 0,
      structuredDataTypes: Array.from(structuredDataTypes),
      structuredData: structuredDataItems,
      hasOpenGraph: og.title.length > 0 || og.description.length > 0,
      ogTitle: og.title,
      ogDescription: og.description,
      ogImage: og.image,
      ogUrl: og.url,
      ogType: og.type,
      hasTwitterCard: twitter.card.length > 0,
      twitterCard: twitter.card,
      twitterTitle: twitter.title,
      twitterDescription: twitter.description,
      twitterImage: twitter.image,
    },
  };
};

module.exports = { crawlPage, normalizeUrl, fetchUrl };
