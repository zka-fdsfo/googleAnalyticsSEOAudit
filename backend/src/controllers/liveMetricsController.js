const Website = require('../models/Website');
const User    = require('../models/User');
const { getLiveMetrics } = require('../services/directQueryService');

// ── Validation helpers ────────────────────────────────────────────────────────

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = (s) => ISO_RE.test(s) && !isNaN(new Date(s).getTime());

// ── GET /api/websites/:id/live-metrics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD ──

const getLive = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate || !isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD).' });
    }
    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ error: 'startDate must be before endDate.' });
    }

    const website = await Website.findOne({ _id: req.params.id, userId: req.user._id });
    if (!website) return res.status(404).json({ error: 'Website not found.' });

    const user = await User.findById(req.user._id)
      .select('+google.accessToken +google.refreshToken +google.expiresAt');
    if (!user?.isGoogleConnected) {
      return res.status(403).json({ error: 'Google account not connected.' });
    }

    // forceRefresh=true skips the 10-min server cache and re-fetches from Google APIs
    const forceRefresh = req.query.forceRefresh === 'true';
    const data = await getLiveMetrics(website, user, startDate, endDate, forceRefresh);
    res.json(data);
  } catch (err) {
    if (err.message?.includes('invalid_grant')) {
      return res.status(401).json({ error: 'Google session expired. Please reconnect your account in Settings.' });
    }
    next(err);
  }
};

// ── GET /api/websites/:id/live-metrics/export?startDate=&endDate=&format=csv ──

const exportLive = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate || !isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({ error: 'startDate and endDate are required.' });
    }

    const website = await Website.findOne({ _id: req.params.id, userId: req.user._id });
    if (!website) return res.status(404).json({ error: 'Website not found.' });

    const user = await User.findById(req.user._id)
      .select('+google.accessToken +google.refreshToken +google.expiresAt');

    const data = await getLiveMetrics(website, user, startDate, endDate);

    // Build CSV rows
    const lines = [];
    const q = (v) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`);
    const row = (...cols) => lines.push(cols.map(q).join(','));

    row('Section', 'Metric', `${startDate} – ${endDate}`, `${data.periods.previous.startDate} – ${data.periods.previous.endDate}`, '% Change');
    lines.push('');

    // GA4
    if (data.ga4?.current) {
      row('Google Analytics 4', 'Users',           data.ga4.current.users,           data.ga4.previous?.users,           data.ga4.changes?.users);
      row('Google Analytics 4', 'New Users',        data.ga4.current.newUsers,        data.ga4.previous?.newUsers,        data.ga4.changes?.newUsers);
      row('Google Analytics 4', 'Returning Users',  data.ga4.current.returningUsers,  data.ga4.previous?.returningUsers,  data.ga4.changes?.returningUsers);
      row('Google Analytics 4', 'Sessions',         data.ga4.current.sessions,        data.ga4.previous?.sessions,        data.ga4.changes?.sessions);
      row('Google Analytics 4', 'Engagement Rate %',data.ga4.current.engagementRate,  data.ga4.previous?.engagementRate,  data.ga4.changes?.engagementRate);
      row('Google Analytics 4', 'Pages & Screens',  data.ga4.current.pageViews,       data.ga4.previous?.pageViews,       data.ga4.changes?.pageViews);
      lines.push('');
    }

    // GSC
    if (data.gsc?.current) {
      row('Search Console', 'Clicks',      data.gsc.current.clicks,      data.gsc.previous?.clicks,      data.gsc.changes?.clicks);
      row('Search Console', 'Impressions', data.gsc.current.impressions, data.gsc.previous?.impressions, data.gsc.changes?.impressions);
      row('Search Console', 'Avg CTR %',   data.gsc.current.ctr,         data.gsc.previous?.ctr,         data.gsc.changes?.ctr);
      row('Search Console', 'Avg Position',data.gsc.current.position,    data.gsc.previous?.position,    data.gsc.changes?.position);
      lines.push('');
    }

    // GBP
    if (data.gbp) {
      row('Business Profile', 'Website Clicks',     data.gbp.websiteClicks);
      row('Business Profile', 'Direction Requests', data.gbp.directionRequests);
      row('Business Profile', 'Phone Calls',        data.gbp.phoneCalls);
      lines.push('');
    }

    // Top pages (GA4)
    if (data.ga4?.current?.topPages?.length) {
      row('Top Pages (GA4)', 'Page Path', 'Page Views', 'Users');
      for (const p of data.ga4.current.topPages) {
        row('', p.path, p.pageViews, p.users);
      }
      lines.push('');
    }

    // Top keywords (GSC)
    if (data.gsc?.current?.topKeywords?.length) {
      row('Top Keywords (GSC)', 'Keyword', 'Clicks', 'Impressions', 'CTR %', 'Position');
      for (const k of data.gsc.current.topKeywords) {
        row('', k.query, k.clicks, k.impressions, k.ctr, k.position);
      }
    }

    const domain   = website.domain || 'export';
    const filename = `${domain}_${startDate}_${endDate}.csv`;

    // UTF-8 BOM so Google Sheets / Excel opens it correctly
    const bom = '﻿';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(bom + lines.join('\r\n'));
  } catch (err) {
    next(err);
  }
};

module.exports = { getLive, exportLive };