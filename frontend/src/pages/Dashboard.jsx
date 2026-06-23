import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Search, TrendingUp, History, Plus, RefreshCw, Globe,
  AlertCircle, Loader2, Users, MousePointerClick, Eye, BarChart2, Target,
  Lightbulb, Map, FileText,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWebsite } from '../context/WebsiteContext';
import {
  getExecutive, getAnalyticsSeries, getGSCSeries,
  getWebsiteAnalytics, getWebsiteGSC,
} from '../services/api';
import KPICard from '../components/dashboard/KPICard';
import DateRangePicker from '../components/common/DateRangePicker';
import AlertsBanner from '../components/dashboard/AlertsBanner';
import KeywordChanges from '../components/dashboard/KeywordChanges';
import KeywordDistribution from '../components/dashboard/KeywordDistribution';
import PageIntelligence from '../components/dashboard/PageIntelligence';
import SEOScoreWidget from '../components/dashboard/SEOScoreWidget';
import WorldMap from '../components/dashboard/WorldMap';
import RecommendationsPanel from '../components/dashboard/RecommendationsPanel';
import OpportunitiesPanel from '../components/dashboard/OpportunitiesPanel';
import AuditHistory from '../components/dashboard/AuditHistory';
import {
  SessionsLineChart, ClicksLineChart, TrafficSourcesChart,
  DeviceBreakdownChart, KeywordPositionChart,
} from '../components/charts/TrafficChart';
import Loader from '../components/common/Loader';

const TABS = [
  { id: 'overview',        label: 'Overview',       icon: <LayoutDashboard size={14} /> },
  { id: 'analytics',       label: 'Analytics',      icon: <TrendingUp size={14} /> },
  { id: 'search-console',  label: 'Search Console', icon: <Search size={14} /> },
  { id: 'keywords',        label: 'Keywords',       icon: <Target size={14} /> },
  { id: 'geo',             label: 'Geo',            icon: <Map size={14} /> },
  { id: 'opportunities',   label: 'Opportunities',  icon: <Lightbulb size={14} /> },
  { id: 'recommendations', label: 'Recommendations',icon: <FileText size={14} /> },
  { id: 'history',         label: 'Audit History',  icon: <History size={14} /> },
];

const Stat = ({ label, value, color = 'text-white', sub }) => (
  <div className="card p-4">
    <div className="text-xs text-slate-400 mb-2 font-medium">{label}</div>
    <div className={`text-xl font-black ${color}`}>{value ?? '—'}</div>
    {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
  </div>
);

const SyncBanner = ({ syncing, onSync, websiteId }) => {
  if (!syncing) return null;
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400 mb-4">
      <Loader2 size={12} className="animate-spin" /> Syncing data…
    </div>
  );
};

const NoDataCard = ({ label, hasProperty }) => (
  <div className="card p-8 text-center">
    <AlertCircle size={28} className="text-slate-600 mx-auto mb-3" />
    <h3 className="font-medium text-slate-300 mb-1">{label} not configured</h3>
    <p className="text-slate-500 text-sm mb-4">
      {hasProperty ? 'Data is being synced. Check back in a few minutes.' : `No ${label} property linked. Go to Settings.`}
    </p>
    {!hasProperty && <Link to="/settings" className="btn-primary text-sm inline-block">Go to Settings</Link>}
  </div>
);

// ─── React Query key factories ────────────────────────────────────────────────
const qk = {
  executive:       (id, days, sd, ed) => ['executive',        id, days, sd, ed],
  analyticsSeries: (id, days, sd, ed) => ['analytics-series', id, days, sd, ed],
  gscSeries:       (id, days, sd, ed) => ['gsc-series',       id, days, sd, ed],
  analyticsSnap:   (id)               => ['analytics-snap',   id],
  gscSnap:         (id)               => ['gsc-snap',         id],
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const { activeWebsite, triggerSync, syncing, dateRange, setDateRange } = useWebsite();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('overview');

  const id  = activeWebsite?._id;
  const { days, startDate: sd, endDate: ed } = dateRange;

  // ── Executive (KPIs + growth) ─────────────────────────────────────────────
  const {
    data: execResp,
    isLoading: execLoading,
    error: execError,
  } = useQuery({
    queryKey: qk.executive(id, days, sd, ed),
    queryFn:  () => getExecutive(id, days),
    enabled:  !!id,
  });

  // ── Chart series ──────────────────────────────────────────────────────────
  const { data: anSeriesResp } = useQuery({
    queryKey: qk.analyticsSeries(id, days, sd, ed),
    queryFn:  () => getAnalyticsSeries(id, days),
    enabled:  !!id,
  });

  const { data: gscSeriesResp } = useQuery({
    queryKey: qk.gscSeries(id, days, sd, ed),
    queryFn:  () => getGSCSeries(id, days),
    enabled:  !!id,
  });

  const exec     = execResp?.data;
  const anSeries = anSeriesResp?.data?.series || [];
  const gscSeries= gscSeriesResp?.data?.series || [];
  const loading  = execLoading;
  const error    = execError?.response?.data?.error || (execError ? 'Failed to load dashboard.' : null);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['executive',        id] });
    queryClient.invalidateQueries({ queryKey: ['analytics-series', id] });
    queryClient.invalidateQueries({ queryKey: ['gsc-series',       id] });
    queryClient.invalidateQueries({ queryKey: ['gsc-snap',         id] });
    queryClient.invalidateQueries({ queryKey: ['analytics-snap',   id] });
  };

  // ── No website ────────────────────────────────────────────────────────────
  if (!activeWebsite) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center animate-fade-in">
        <Globe size={40} className="text-slate-600 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No websites yet</h2>
        <p className="text-slate-400 mb-6">
          {user?.isGoogleConnected
            ? 'Click "Sync Google Properties" in the website switcher above.'
            : 'Connect your Google account to auto-discover your websites.'}
        </p>
        {!user?.isGoogleConnected && (
          <Link to="/settings" className="btn-primary inline-flex items-center gap-2">Connect Google Account</Link>
        )}
      </div>
    );
  }

  const analytics  = exec?.summary?.analytics;
  const gsc        = exec?.summary?.gsc;
  const anSnap     = analytics?.current;
  const anChanges  = analytics?.changes;
  const gscSnap    = gsc?.current;
  const gscChanges = gsc?.changes;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 animate-fade-in">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <LayoutDashboard size={18} className="text-brand-400" />
            {activeWebsite.displayName || activeWebsite.domain}
          </h1>
          {activeWebsite.gsc?.siteUrl && (
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{activeWebsite.gsc.siteUrl}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* DateRangePicker now receives the full dateRange object */}
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <button
            onClick={handleRefresh}
            disabled={syncing || loading}
            className="btn-outline text-xs flex items-center gap-1.5 py-2"
          >
            <RefreshCw size={12} className={(syncing || loading) ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Refresh'}
          </button>
          <Link to="/" className="btn-primary text-xs flex items-center gap-1.5 py-2">
            <Plus size={12} /> New Audit
          </Link>
        </div>
      </div>

      <AlertsBanner websiteId={id} />
      <SyncBanner syncing={syncing} onSync={triggerSync} websiteId={id} />

      {/* ── KPI row 1: GSC + Organic Traffic ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <KPICard
          label="Organic Traffic"
          value={anSnap?.sessions}
          previousValue={analytics?.previous?.sessions}
          change={anChanges?.sessions}
          icon={<TrendingUp size={14} />}
          loading={loading}
          period={`${analytics?.periodDays || days}d`}
        />
        <KPICard
          label="Total Clicks"
          value={gscSnap?.clicks}
          previousValue={gsc?.previous?.clicks}
          change={gscChanges?.clicks}
          icon={<MousePointerClick size={14} />}
          loading={loading}
          period={`${gsc?.periodDays || days}d`}
        />
        <KPICard
          label="Impressions"
          value={gscSnap?.impressions}
          previousValue={gsc?.previous?.impressions}
          change={gscChanges?.impressions}
          icon={<Eye size={14} />}
          loading={loading}
          period={`${gsc?.periodDays || days}d`}
        />
        <KPICard
          label="Avg Position"
          value={gscSnap?.position ? `#${gscSnap.position}` : null}
          previousValue={gsc?.previous?.position ? `#${gsc.previous.position}` : null}
          change={gscChanges?.position != null ? -gscChanges.position : null}
          higherIsBetter={false}
          icon={<BarChart2 size={14} />}
          loading={loading}
          period={`${gsc?.periodDays || days}d`}
        />
      </div>

      {/* ── KPI row 2: Analytics detail ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KPICard
          label="Users"
          value={anSnap?.users}
          previousValue={analytics?.previous?.users}
          change={anChanges?.users}
          icon={<Users size={14} />}
          loading={loading}
          period={`${analytics?.periodDays || days}d`}
        />
        <KPICard
          label="CTR"
          value={gscSnap?.ctr != null ? `${gscSnap.ctr}%` : null}
          previousValue={gsc?.previous?.ctr != null ? `${gsc.previous.ctr}%` : null}
          change={gscChanges?.ctr}
          icon={<MousePointerClick size={14} />}
          loading={loading}
          period={`${gsc?.periodDays || days}d`}
        />
        <KPICard
          label="Bounce Rate"
          value={anSnap?.bounceRate != null ? `${anSnap.bounceRate}%` : null}
          previousValue={analytics?.previous?.bounceRate != null ? `${analytics.previous.bounceRate}%` : null}
          change={anChanges?.bounceRate}
          higherIsBetter={false}
          icon={<TrendingUp size={14} />}
          loading={loading}
          period={`${analytics?.periodDays || days}d`}
        />
        <KPICard
          label="Page Views"
          value={anSnap?.pageViews}
          previousValue={analytics?.previous?.pageViews}
          change={anChanges?.pageViews}
          icon={<Eye size={14} />}
          loading={loading}
          period={`${analytics?.periodDays || days}d`}
        />
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-dark-700 mb-6 overflow-x-auto gap-0 -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-all border-b-2 flex-shrink-0 ${
              activeTab === t.id
                ? 'text-brand-400 border-brand-500'
                : 'text-slate-500 border-transparent hover:text-slate-200'
            }`}
          >
            {t.icon}{t.label}
            {t.id === 'recommendations' && exec?.recommendations?.open > 0 && (
              <span className="text-xs bg-red-500 text-white rounded-full px-1.5 font-bold">
                {exec.recommendations.open}
              </span>
            )}
            {t.id === 'opportunities' && exec?.summary?.keywords?.rising?.length > 0 && (
              <span className="text-xs bg-brand-500 text-white rounded-full px-1.5 font-bold">
                {exec.summary.keywords.rising.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && !exec && (
        <div className="py-16 flex justify-center">
          <Loader size="lg" text="Loading dashboard…" />
        </div>
      )}
      {!loading && error && (
        <div className="card p-6 text-center">
          <AlertCircle size={24} className="text-red-400 mx-auto mb-2" />
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={handleRefresh} className="btn-secondary text-sm mt-3">Retry</button>
        </div>
      )}

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      {(!loading || exec) && !error && (
        <>
          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <SEOScoreWidget websiteId={id} websiteDomain={activeWebsite.domain} />
                <div className="lg:col-span-2 card p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4">Organic Traffic Trend</h3>
                  {anSeries.length > 0
                    ? <SessionsLineChart data={anSeries} />
                    : <div className="h-[180px] flex items-center justify-center text-slate-500 text-sm">No traffic data yet</div>}
                </div>
              </div>

              {gscSeries.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4">Search Performance Trend</h3>
                  <ClicksLineChart data={gscSeries} />
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {exec?.summary?.topKeywords?.length > 0 && (
                  <div className="card p-5">
                    <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Keywords</h3>
                    <KeywordPositionChart data={exec.summary.topKeywords.slice(0, 8)} />
                  </div>
                )}
                {exec?.alerts?.length > 0 && (
                  <div className="card p-5">
                    <h3 className="text-sm font-semibold text-slate-300 mb-3">Recent Alerts</h3>
                    <div className="space-y-2">
                      {exec.alerts.slice(0, 5).map((a) => (
                        <div key={a._id} className="flex items-start gap-3 text-sm">
                          <AlertCircle size={13} className={a.severity === 'critical' ? 'text-red-400 mt-0.5' : 'text-amber-400 mt-0.5'} />
                          <div>
                            <span className="text-slate-200 font-medium">{a.title}</span>
                            {a.changePercent && (
                              <span className={`ml-2 text-xs font-bold ${a.changePercent < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {a.changePercent > 0 ? '+' : ''}{Math.round(a.changePercent)}%
                              </span>
                            )}
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-1">{a.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ANALYTICS */}
          {activeTab === 'analytics' && (
            <AnalyticsTab
              websiteId={id}
              anSeries={anSeries}
              days={days}
              analyticsComp={analytics}
            />
          )}

          {/* SEARCH CONSOLE */}
          {activeTab === 'search-console' && (
            <GSCTab
              websiteId={id}
              gscSeries={gscSeries}
              days={days}
              gscComp={gsc}
            />
          )}

          {/* KEYWORDS */}
          {activeTab === 'keywords' && (
            <div className="space-y-4">
              <div className="card p-5">
                <KeywordDistribution websiteId={id} days={days} />
              </div>
              <div className="card p-5">
                <KeywordChanges websiteId={id} days={days} />
              </div>
            </div>
          )}

          {/* GEO */}
          {activeTab === 'geo' && (
            <div className="card p-5">
              <WorldMap websiteId={id} days={days} />
            </div>
          )}

          {/* OPPORTUNITIES */}
          {activeTab === 'opportunities' && (
            <OpportunitiesPanel websiteId={id} days={days} />
          )}

          {/* RECOMMENDATIONS */}
          {activeTab === 'recommendations' && (
            <RecommendationsPanel websiteId={id} days={days} />
          )}

          {/* AUDIT HISTORY */}
          {activeTab === 'history' && <AuditHistory days={days} />}
        </>
      )}
    </div>
  );
}

// ─── Analytics sub-tab ────────────────────────────────────────────────────────
// analyticsComp = exec.summary.analytics — period-accurate sessions/users/pageViews.
// Snapshot is still fetched for secondary breakdowns (sources, devices, pages) that
// require the full snapshot detail and don't change with the period selector.
function AnalyticsTab({ websiteId, anSeries, days, analyticsComp }) {
  const { data: resp, isLoading } = useQuery({
    queryKey: qk.analyticsSnap(websiteId),
    queryFn:  () => getWebsiteAnalytics(websiteId),
    enabled:  !!websiteId,
  });
  const snap = resp?.data?.snapshot;

  // Period-accurate values from the exec comparison engine.
  const cur = analyticsComp?.current;

  if (isLoading && !cur) {
    return <div className="py-16 flex justify-center"><Loader size="md" text="Loading analytics…" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* ── Period-accurate primary stats ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Sessions',   cur?.sessions],
          ['Users',      cur?.users],
          ['Page Views', cur?.pageViews],
          // Engagement metrics come from the snapshot (rate metrics, not in timeseries).
          ['Bounce Rate',      snap ? `${snap.overview.bounceRate}%`         : null],
          ['Engagement Rate',  snap ? `${snap.overview.engagementRate}%`     : null],
          ['Avg Duration',     snap ? `${Math.round(snap.overview.avgSessionDuration)}s` : null],
          ['New Users',        snap?.overview.newUsers],
          ['Engaged Sessions', snap?.overview.engagedSessions],
        ].map(([label, value]) => (
          <Stat key={label} label={label} value={typeof value === 'number' ? value?.toLocaleString() : value} />
        ))}
      </div>

      {/* ── Trend chart (date-aware — passed from parent) ────────────────── */}
      {anSeries.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Sessions & Users ({days}d)</h3>
          <SessionsLineChart data={anSeries} />
        </div>
      )}

      {/* ── Secondary breakdowns from latest snapshot ────────────────────── */}
      {snap && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Traffic Sources</h3>
              <TrafficSourcesChart data={snap.trafficSources} />
            </div>
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Device Breakdown</h3>
              <DeviceBreakdownChart data={snap.devices} />
            </div>
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Pages</h3>
            <PagesTable rows={snap.topPages} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── GSC sub-tab ──────────────────────────────────────────────────────────────
// gscComp = exec.summary.gsc — period-accurate clicks/impressions/ctr/position.
// Snapshot is still fetched for keyword/page/device tables.
function GSCTab({ websiteId, gscSeries, days, gscComp }) {
  const { data: resp, isLoading } = useQuery({
    queryKey: qk.gscSnap(websiteId),
    queryFn:  () => getWebsiteGSC(websiteId),
    enabled:  !!websiteId,
  });
  const snap = resp?.data?.snapshot;

  const cur = gscComp?.current;

  if (isLoading && !cur) {
    return <div className="py-16 flex justify-center"><Loader size="md" text="Loading Search Console…" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* ── Period-accurate primary stats ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Clicks',      cur?.clicks,                                       'text-brand-400'],
          ['Impressions', cur?.impressions?.toLocaleString?.() ?? cur?.impressions, 'text-white'],
          ['CTR',         cur?.ctr != null ? `${cur.ctr}%` : null,           'text-white'],
          ['Avg Position',cur?.position ? `#${cur.position}` : null,
            (cur?.position ?? 99) <= 10 ? 'text-emerald-400' : 'text-amber-400'],
        ].map(([label, value, color]) => (
          <Stat key={label} label={label} value={value} color={color} />
        ))}
      </div>

      {/* ── Trend chart (date-aware — passed from parent) ────────────────── */}
      {gscSeries.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Clicks & Impressions ({days}d)</h3>
          <ClicksLineChart data={gscSeries} />
        </div>
      )}

      {/* ── Keyword/page/device tables from latest snapshot ──────────────── */}
      {snap && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Keywords by Position</h3>
              <KeywordPositionChart data={snap.topKeywords?.slice(0, 8)} />
            </div>
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Clicks by Device</h3>
              <DeviceBreakdownChart data={snap.devices} />
            </div>
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Keywords</h3>
            <KeywordsTable rows={snap.topKeywords?.slice(0, 25)} />
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Pages</h3>
            <GSCPagesTable rows={snap.topPages?.slice(0, 15)} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Table helpers ────────────────────────────────────────────────────────────
const PagesTable = ({ rows = [] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead><tr className="text-left text-slate-500 text-xs border-b border-dark-700">
        <th className="pb-2.5 font-medium">Path</th>
        <th className="pb-2.5 font-medium text-right">Views</th>
        <th className="pb-2.5 font-medium text-right">Users</th>
        <th className="pb-2.5 font-medium text-right">Bounce</th>
      </tr></thead>
      <tbody className="divide-y divide-dark-700/40">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-dark-700/20">
            <td className="py-2 text-slate-300 font-mono text-xs truncate max-w-[250px]">{r.path}</td>
            <td className="py-2 text-right text-slate-300">{r.pageViews?.toLocaleString()}</td>
            <td className="py-2 text-right text-slate-400">{r.users?.toLocaleString()}</td>
            <td className="py-2 text-right text-slate-400">{r.bounceRate?.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const KeywordsTable = ({ rows = [] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead><tr className="text-left text-slate-500 text-xs border-b border-dark-700">
        <th className="pb-2.5 font-medium">Keyword</th>
        <th className="pb-2.5 font-medium text-right">Clicks</th>
        <th className="pb-2.5 font-medium text-right">Impr.</th>
        <th className="pb-2.5 font-medium text-right">CTR</th>
        <th className="pb-2.5 font-medium text-right">Pos.</th>
      </tr></thead>
      <tbody className="divide-y divide-dark-700/40">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-dark-700/20">
            <td className="py-2 text-slate-300">{r.query}</td>
            <td className="py-2 text-right text-slate-300">{r.clicks?.toLocaleString()}</td>
            <td className="py-2 text-right text-slate-400">{r.impressions?.toLocaleString()}</td>
            <td className="py-2 text-right text-slate-400">{r.ctr}%</td>
            <td className="py-2 text-right">
              <span className={r.position <= 3 ? 'text-emerald-400 font-bold' : r.position <= 10 ? 'text-amber-400' : 'text-slate-400'}>
                #{r.position}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const GSCPagesTable = ({ rows = [] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead><tr className="text-left text-slate-500 text-xs border-b border-dark-700">
        <th className="pb-2.5 font-medium">Page</th>
        <th className="pb-2.5 font-medium text-right">Clicks</th>
        <th className="pb-2.5 font-medium text-right">Impr.</th>
        <th className="pb-2.5 font-medium text-right">CTR</th>
        <th className="pb-2.5 font-medium text-right">Pos.</th>
      </tr></thead>
      <tbody className="divide-y divide-dark-700/40">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-dark-700/20">
            <td className="py-2 text-slate-300 font-mono text-xs truncate max-w-[220px]">{r.page}</td>
            <td className="py-2 text-right text-slate-300">{r.clicks?.toLocaleString()}</td>
            <td className="py-2 text-right text-slate-400">{r.impressions?.toLocaleString()}</td>
            <td className="py-2 text-right text-slate-400">{r.ctr}%</td>
            <td className="py-2 text-right text-slate-400">#{r.position}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);