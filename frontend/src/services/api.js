import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

const token = localStorage.getItem('token');
if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Audit ─────────────────────────────────────────────────────────────────────
export const startAudit      = (url)  => api.post('/audit', { url });
export const getAudit        = (id)   => api.get(`/audit/${id}`);
export const getAuditHistory = (p=1)  => api.get(`/audit/history?page=${p}`);
export const deleteAudit     = (id)   => api.delete(`/audit/${id}`);

// ── Websites (core) ───────────────────────────────────────────────────────────
export const listWebsites       = ()       => api.get('/websites');
export const discoverWebsites   = ()       => api.post('/websites/discover');
export const getWebsite         = (id)     => api.get(`/websites/${id}`);
export const updateWebsite      = (id, d)  => api.put(`/websites/${id}`, d);
export const deleteWebsite_     = (id)     => api.delete(`/websites/${id}`);
export const syncWebsite        = (id)     => api.post(`/websites/${id}/sync`);
export const getWebsiteAnalytics      = (id)     => api.get(`/websites/${id}/analytics`);
export const getWebsiteAnalyticsTrend = (id, d)  => api.get(`/websites/${id}/analytics/trend`, { params: { days: d } });
export const getWebsiteGSC            = (id)     => api.get(`/websites/${id}/gsc`);
export const getWebsiteGSCTrend       = (id, d)  => api.get(`/websites/${id}/gsc/trend`, { params: { days: d } });

// ── Intelligence ──────────────────────────────────────────────────────────────
const intel = (id, path, params) => api.get(`/websites/${id}/${path}`, { params });
const intelPatch = (id, path, data) => api.patch(`/websites/${id}/${path}`, data);

export const getExecutive          = (id, days = 30)  => intel(id, 'executive', { days });
export const compareAnalytics      = (id, days=30)    => intel(id, 'analytics/compare', { days });
export const compareGSC            = (id, days=28)    => intel(id, 'gsc/compare', { days });
export const getAnalyticsSeries    = (id, days=30)    => intel(id, 'analytics/series', { days });
export const getGSCSeries          = (id, days=28)    => intel(id, 'gsc/series', { days });
export const getKeywordDistribution = (id)            => intel(id, 'keywords/distribution');
export const getPageIntelligence   = (id, lookback=7) => intel(id, 'pages/intelligence', { lookback });
export const getSEOScore           = (id)             => intel(id, 'seo-score');
export const getReports            = (id)             => intel(id, 'reports');
export const createReport          = (id, type)       => api.post(`/websites/${id}/reports`, { type });
export const getGBPProfile         = (id)             => intel(id, 'gbp');
export const getGBPAccounts        = (id)             => intel(id, 'gbp/accounts');
export const syncGBP               = (id)             => api.post(`/websites/${id}/gbp/sync`);
export const linkGBP               = (id, data)       => api.post(`/websites/${id}/gbp/link`, data);
export const getCompetitors        = (id)             => intel(id, 'competitors');
export const addCompetitor         = (id, data)       => api.post(`/websites/${id}/competitors`, data);
export const removeCompetitor      = (id, cId)        => api.delete(`/websites/${id}/competitors/${cId}`);

export const getKeywordChanges     = (id, lookback=7) => intel(id, 'keywords', { lookback });
export const getKeywordHistory     = (id, kw, days=90)=> intel(id, `keywords/${encodeURIComponent(kw)}/history`, { days });

export const getRecommendations    = (id, p={})       => intel(id, 'recommendations', p);
export const patchRecommendation   = (id, rId, data)  => intelPatch(id, `recommendations/${rId}`, data);

export const getOpportunities      = (id, p={})       => intel(id, 'opportunities', p);
export const patchOpportunity      = (id, oId, data)  => intelPatch(id, `opportunities/${oId}`, data);

export const getAlerts             = (id, p={})       => intel(id, 'alerts', p);
export const markAlertsRead        = (id, ids)        => api.post(`/websites/${id}/alerts/read`, { ids });
export const dismissAlert          = (id, aId)        => intelPatch(id, `alerts/${aId}/dismiss`, {});

export const getGeoSnapshot        = (id, days = 30)  => intel(id, 'geo', { days });
export const getGeoTrend           = (id, cc, days=30)=> intel(id, `geo/${cc}/trend`, { days });

// ── Legacy live Google APIs ────────────────────────────────────────────────────
// (used by AnalyticsPanel, SearchConsolePanel, Settings, and Debug pages)
export const getGA4Accounts    = ()            => api.get('/analytics/accounts');
export const getGA4Properties  = ()            => api.get('/analytics/properties');
export const getGA4Report      = (propertyId, startDate, endDate) =>
  api.get('/analytics/report', { params: { propertyId, startDate, endDate } });
export const getGA4Timeseries  = (propertyId, days) =>
  api.get('/analytics/timeseries', { params: { propertyId, days } });
export const getGSCSites       = ()            => api.get('/search-console/sites');
export const getGSCReport      = (siteUrl)     => api.get('/search-console/report',     { params: { siteUrl } });
export const getGSCTimeseries  = (siteUrl, days) => api.get('/search-console/timeseries', { params: { siteUrl, days } });
export const checkIndexing     = (p, s)        => api.get('/search-console/indexing',   { params: { pageUrl: p, siteUrl: s } });
export const updateGoogleSettings = (d)        => api.put('/auth/google/settings', d);
export const disconnectGoogle  = ()            => api.delete('/auth/google/disconnect');
export const getGoogleDebug    = ()            => api.get('/auth/google/debug');

export default api;
