import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Globe, ExternalLink, RefreshCw, Share2, CheckCircle2,
  AlertTriangle, XCircle, Clock, FileText, Image, Link2, Zap, Shield,
} from 'lucide-react';
import { getAudit } from '../services/api';
import ScoreGauge from '../components/charts/ScoreGauge';
import CategorySection from '../components/audit/CategorySection';
import { AnalyzingLoader, PageLoader } from '../components/common/Loader';
import toast from 'react-hot-toast';

const MetricCard = ({ icon, label, value, sub, colorClass = 'text-slate-100' }) => (
  <div className="card p-4">
    <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
      {icon}
      {label}
    </div>
    <div className={`text-lg font-bold ${colorClass}`}>{value ?? '—'}</div>
    {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
  </div>
);

const formatBytes = (bytes) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatMs = (ms) => {
  if (!ms) return '—';
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
};

export default function AuditReport() {
  const { id } = useParams();
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const pollRef = useRef(null);

  const fetchAudit = useCallback(async () => {
    try {
      const { data } = await getAudit(id);
      setAudit(data.audit);

      if (data.audit.status === 'completed' || data.audit.status === 'failed') {
        clearInterval(pollRef.current);
        setLoading(false);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load audit report.');
      clearInterval(pollRef.current);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAudit();
    pollRef.current = setInterval(fetchAudit, 3000);
    return () => clearInterval(pollRef.current);
  }, [fetchAudit]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied to clipboard!');
  };

  if (loading && !audit) return <PageLoader text="Starting analysis..." />;
  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <XCircle size={40} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Analysis Failed</h2>
        <p className="text-slate-400 mb-6">{error}</p>
        <Link to="/" className="btn-primary inline-flex items-center gap-2">
          <ArrowLeft size={16} /> Try Another URL
        </Link>
      </div>
    );
  }
  if (!audit) return <PageLoader />;

  const isProcessing = audit.status === 'processing' || audit.status === 'pending';
  const isFailed = audit.status === 'failed';

  if (isProcessing) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={14} /> New Audit
          </Link>
        </div>
        <div className="card p-6 mb-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Globe size={14} />
            <a href={audit.url} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline truncate">{audit.url}</a>
          </div>
        </div>
        <AnalyzingLoader />
      </div>
    );
  }

  const { pageData, categories, links, images, technical, performance, keywords } = audit;
  const summary = {
    passed: (categories || []).reduce((s, c) => s + c.passedCount, 0),
    warning: (categories || []).reduce((s, c) => s + c.warningCount, 0),
    critical: (categories || []).reduce((s, c) => s + c.criticalCount, 0),
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'issues', label: `Issues (${summary.critical + summary.warning})` },
    { id: 'technical', label: 'Technical' },
    { id: 'performance', label: 'Performance' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={14} /> New Audit
        </Link>
        <div className="flex gap-2">
          <button onClick={handleShare} className="btn-outline text-xs flex items-center gap-1.5 py-1.5 px-3">
            <Share2 size={13} /> Share
          </button>
          <Link to="/" className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3">
            <RefreshCw size={13} /> Re-analyze
          </Link>
        </div>
      </div>

      {/* URL bar */}
      <div className="card p-4 mb-6 flex items-center gap-3">
        <Globe size={16} className="text-slate-500 flex-shrink-0" />
        <a
          href={audit.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-300 hover:text-brand-400 transition-colors text-sm font-medium flex items-center gap-1.5 truncate"
        >
          {audit.url}
          <ExternalLink size={12} className="flex-shrink-0" />
        </a>
        {isFailed && (
          <span className="ml-auto text-xs text-red-400 font-medium">{audit.error}</span>
        )}
      </div>

      {!isFailed && (
        <>
          {/* Hero score row */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
            {/* Score */}
            <div className="card p-6 flex flex-col items-center justify-center lg:col-span-1">
              <div className="text-sm text-slate-400 mb-4 font-medium">SEO Score</div>
              <ScoreGauge score={audit.score} size="lg" />
            </div>

            {/* Summary stats */}
            <div className="lg:col-span-3 grid grid-cols-3 gap-4">
              <div className="card p-5 flex flex-col items-center justify-center text-center">
                <CheckCircle2 size={22} className="text-emerald-400 mb-2" />
                <div className="text-3xl font-black text-emerald-400">{summary.passed}</div>
                <div className="text-xs text-slate-400 mt-1">Passed</div>
              </div>
              <div className="card p-5 flex flex-col items-center justify-center text-center">
                <AlertTriangle size={22} className="text-amber-400 mb-2" />
                <div className="text-3xl font-black text-amber-400">{summary.warning}</div>
                <div className="text-xs text-slate-400 mt-1">Warnings</div>
              </div>
              <div className="card p-5 flex flex-col items-center justify-center text-center">
                <XCircle size={22} className="text-red-400 mb-2" />
                <div className="text-3xl font-black text-red-400">{summary.critical}</div>
                <div className="text-xs text-slate-400 mt-1">Critical</div>
              </div>
            </div>
          </div>

          {/* Category score bars */}
          <div className="card p-5 mb-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Category Scores</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(categories || []).map((cat) => (
                <div key={cat.name}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-400 truncate">{cat.name}</span>
                    <span className={`font-bold ${cat.score >= 80 ? 'text-emerald-400' : cat.score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                      {cat.score}%
                    </span>
                  </div>
                  <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${cat.score >= 80 ? 'bg-emerald-500' : cat.score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${cat.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-dark-700 mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 ${
                  activeTab === tab.id
                    ? 'text-brand-400 border-brand-500'
                    : 'text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Page info */}
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                  <FileText size={14} /> Page Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  {[
                    ['Title', pageData?.title || '—'],
                    ['Meta Description', pageData?.metaDescription ? `${pageData.metaDescription.substring(0, 80)}…` : '—'],
                    ['H1', pageData?.h1?.[0] || '—'],
                    ['Word Count', pageData?.wordCount?.toLocaleString() || '—'],
                    ['Language', pageData?.language || '—'],
                    ['Charset', pageData?.charset || '—'],
                    ['Canonical', pageData?.canonical || 'Not set'],
                    ['HTTP Status', pageData?.httpStatusCode || '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex gap-2">
                      <span className="text-slate-500 w-36 flex-shrink-0">{label}:</span>
                      <span className="text-slate-300 font-medium truncate">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard icon={<Link2 size={13} />} label="Total Links" value={links?.totalCount} sub={`${links?.internalCount || 0} internal · ${links?.externalCount || 0} external`} />
                <MetricCard
                  icon={<XCircle size={13} />}
                  label="Broken Links"
                  value={links?.brokenCount || 0}
                  colorClass={links?.brokenCount > 0 ? 'text-red-400' : 'text-emerald-400'}
                />
                <MetricCard icon={<Image size={13} />} label="Images" value={images?.total} sub={`${images?.withoutAlt || 0} missing alt`} />
                <MetricCard
                  icon={<Clock size={13} />}
                  label="Load Time"
                  value={formatMs(performance?.loadTime)}
                  colorClass={performance?.loadTime > 3000 ? 'text-red-400' : performance?.loadTime > 1500 ? 'text-amber-400' : 'text-emerald-400'}
                />
              </div>

              {/* Top keywords */}
              {keywords?.topKeywords?.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Keywords</h3>
                  <div className="flex flex-wrap gap-2">
                    {keywords.topKeywords.map((kw) => (
                      <div key={kw.word} className="flex items-center gap-2 px-3 py-1.5 bg-dark-700 rounded-full text-xs">
                        <span className="text-slate-300 font-medium">{kw.word}</span>
                        <span className="text-slate-500">{kw.count}×</span>
                        <span className="text-brand-400">{kw.density}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Issues */}
          {activeTab === 'issues' && (
            <div className="space-y-3">
              {(categories || []).map((cat, i) => (
                <CategorySection key={cat.name} category={cat} defaultOpen={i === 0} />
              ))}
            </div>
          )}

          {/* Tab: Technical */}
          {activeTab === 'technical' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {[
                  { label: 'HTTPS', value: technical?.isHttps, type: 'bool' },
                  { label: 'Canonical', value: technical?.hasCanonical, type: 'bool' },
                  { label: 'Viewport', value: technical?.hasViewport, type: 'bool' },
                  { label: 'Robots.txt', value: technical?.hasRobotsTxt, type: 'bool' },
                  { label: 'XML Sitemap', value: technical?.hasSitemap, type: 'bool' },
                  { label: 'Structured Data', value: technical?.hasStructuredData, type: 'bool' },
                  { label: 'Open Graph', value: technical?.hasOpenGraph, type: 'bool' },
                  { label: 'Twitter Card', value: technical?.hasTwitterCard, type: 'bool' },
                ].map(({ label, value }) => (
                  <div key={label} className="card p-4">
                    <div className="text-xs text-slate-400 mb-2">{label}</div>
                    <div className={`text-sm font-semibold flex items-center gap-1.5 ${value ? 'text-emerald-400' : 'text-red-400'}`}>
                      {value ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      {value ? 'Yes' : 'No'}
                    </div>
                  </div>
                ))}
              </div>

              {technical?.structuredDataTypes?.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                    <Zap size={14} /> Structured Data Types
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {technical.structuredDataTypes.map((t) => (
                      <span key={t} className="px-3 py-1 bg-brand-500/10 text-brand-400 rounded-full text-xs font-medium border border-brand-500/20">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {technical?.sitemapUrl && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3">Sitemap</h3>
                  <div className="flex items-center gap-2 text-sm">
                    <a href={technical.sitemapUrl} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline font-mono text-xs">
                      {technical.sitemapUrl}
                    </a>
                    {technical.sitemapPageCount > 0 && (
                      <span className="text-slate-500">({technical.sitemapPageCount} URLs)</span>
                    )}
                  </div>
                </div>
              )}

              {links?.broken?.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                    <XCircle size={14} /> Broken Links ({links.broken.length})
                  </h3>
                  <div className="space-y-2">
                    {links.broken.map((link, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs p-2.5 bg-red-500/5 border border-red-500/10 rounded-lg">
                        <span className="text-red-400 font-mono font-bold w-12 flex-shrink-0">{link.statusCode || 'ERR'}</span>
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white truncate flex-1 font-mono">
                          {link.url}
                        </a>
                        <span className="text-slate-600 flex-shrink-0">{link.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Performance */}
          {activeTab === 'performance' && (
            <div className="space-y-4">
              {performance?.score !== undefined ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Performance Score', value: `${performance.score}/100`, color: performance.score >= 90 ? 'text-emerald-400' : performance.score >= 50 ? 'text-amber-400' : 'text-red-400' },
                    { label: 'LCP', value: formatMs(performance.lcp), color: performance.lcp < 2500 ? 'text-emerald-400' : performance.lcp < 4000 ? 'text-amber-400' : 'text-red-400' },
                    { label: 'CLS', value: performance.cls?.toFixed(3) ?? '—', color: performance.cls < 0.1 ? 'text-emerald-400' : performance.cls < 0.25 ? 'text-amber-400' : 'text-red-400' },
                    { label: 'FCP', value: formatMs(performance.fcp), color: performance.fcp < 1800 ? 'text-emerald-400' : performance.fcp < 3000 ? 'text-amber-400' : 'text-red-400' },
                    { label: 'TTFB', value: formatMs(performance.ttfb), color: performance.ttfb < 800 ? 'text-emerald-400' : performance.ttfb < 1800 ? 'text-amber-400' : 'text-red-400' },
                    { label: 'Speed Index', value: formatMs(performance.speedIndex) },
                    { label: 'Load Time', value: formatMs(performance.loadTime) },
                    { label: 'Page Size', value: formatBytes(performance.pageSize) },
                  ].map(({ label, value, color = 'text-slate-100' }) => (
                    <MetricCard key={label} icon={<Zap size={13} />} label={label} value={value} colorClass={color} />
                  ))}
                </div>
              ) : (
                <div className="card p-8 text-center">
                  <Shield size={28} className="text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">PageSpeed data not available.</p>
                  <p className="text-slate-500 text-xs mt-1">Add a GOOGLE_PAGESPEED_API_KEY to enable Core Web Vitals.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
