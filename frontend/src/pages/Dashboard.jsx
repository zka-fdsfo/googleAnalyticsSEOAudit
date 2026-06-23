import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, RefreshCw, Plus, Globe, AlertCircle, Download,
  Users, TrendingUp, Eye, MousePointerClick, BarChart2,
  Navigation, Phone, Search, Activity,
} from 'lucide-react';
import { useAuth }    from '../context/AuthContext';
import { useWebsite, localToday } from '../context/WebsiteContext';
import { getLiveMetrics, exportLiveMetrics, discoverWebsites, listGSCSites, linkGSCProperty } from '../services/api';
import KPICard         from '../components/dashboard/KPICard';
import DateRangePicker from '../components/common/DateRangePicker';
import Loader          from '../components/common/Loader';
import {
  SessionsLineChart,
  ClicksLineChart,
  DeviceBreakdownChart,
} from '../components/charts/TrafficChart';

// ── Source badge ──────────────────────────────────────────────────────────────

const SOURCE_STYLES = {
  GA4:   'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  GSC:   'bg-blue-500/15  text-blue-400  border border-blue-500/30',
  GBP:   'bg-green-500/15 text-green-400 border border-green-500/30',
  Today: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
};
const SourceBadge = ({ source }) => (
  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SOURCE_STYLES[source] || ''}`}>
    {source}
  </span>
);

// ── Small layout helpers ──────────────────────────────────────────────────────

const Section = ({ title, badge, children }) => (
  <div className="card p-5">
    <div className="flex items-center gap-2 mb-4">
      <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
      {badge && <SourceBadge source={badge} />}
    </div>
    {children}
  </div>
);

const SimpleTable = ({ headers, rows }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 text-xs border-b border-dark-700">
          {headers.map((h) => <th key={h} className="pb-2.5 font-medium pr-4">{h}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-dark-700/40">
        {rows.map((row, i) => (
          <tr key={i} className="hover:bg-dark-700/20">
            {row.map((cell, j) => (
              <td key={j} className={`py-2 pr-4 text-xs ${
                j === 0 ? 'text-slate-300 font-mono truncate max-w-[240px]' : 'text-right text-slate-400'
              }`}>
                {cell ?? '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ── DateRange display pill ────────────────────────────────────────────────────

const DatePill = ({ startDate, endDate, label }) => {
  if (!startDate) return null;
  const same = startDate === endDate;
  return (
    <span className="text-xs text-slate-500 bg-dark-700 px-2.5 py-1 rounded-lg font-mono">
      {same ? startDate : `${startDate} → ${endDate}`}
    </span>
  );
};

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'analytics',      label: 'Analytics',      badge: 'GA4' },
  { id: 'search-console', label: 'Search Console', badge: 'GSC' },
];

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user }                                            = useAuth();
  const { activeWebsite, syncing, dateRange, setDateRange } = useWebsite();
  const queryClient                                         = useQueryClient();

  const [activeTab,       setActiveTab]       = useState('analytics');
  const [forceRefreshKey, setForceRefreshKey] = useState(0);
  const [discovering,     setDiscovering]     = useState(false);

  const { startDate, endDate, label } = dateRange;
  const id     = activeWebsite?._id;
  const isToday = label === 'Today';

  // ── Main period query ────────────────────────────────────────────────────
  const {
    data: resp,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    // forceRefreshKey in key: incrementing it causes React Query to treat this as
    // a NEW query and re-fetch — combined with forceRefresh=true it also bypasses
    // the server-side 10-min cache.
    queryKey: ['live-metrics', id, startDate, endDate, forceRefreshKey],
    queryFn:  () => getLiveMetrics(id, startDate, endDate, { forceRefresh: forceRefreshKey > 0 }),
    enabled:  !!id && !!startDate && !!endDate,
    staleTime: 10 * 60 * 1000,
  });

  // ── Separate "Today" query (always fetched alongside the period query) ───
  const todayDate = localToday();
  const { data: todayResp, isLoading: todayLoading } = useQuery({
    queryKey: ['live-metrics', id, todayDate, todayDate, 0],
    queryFn:  () => getLiveMetrics(id, todayDate, todayDate),
    enabled:  !!id && !isToday, // don't double-fetch if user already selected Today
    staleTime: 5 * 60 * 1000,
  });

  const d           = resp?.data;
  const ga4         = d?.ga4;
  const gsc         = d?.gsc;
  const gbp         = d?.gbp;
  const todayD      = isToday ? d : todayResp?.data;
  const todayGA4    = todayD?.ga4;
  const todayGSC    = todayD?.gsc;
  const loading     = isLoading || isFetching;

  const handleRefresh = () => {
    setForceRefreshKey((k) => k + 1);
  };

  // Re-runs Google property discovery to link any GSC/GA4 sites the user has access to
  const handleRediscover = async () => {
    setDiscovering(true);
    try {
      await discoverWebsites();
      // Invalidate the metrics cache so fresh data is loaded with updated siteUrl
      queryClient.invalidateQueries({ queryKey: ['live-metrics', id] });
      // Also trigger a page refresh of the website list so the new siteUrl appears
      window.location.reload();
    } catch {
      setDiscovering(false);
    }
  };

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!activeWebsite) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center animate-fade-in">
        <Globe size={40} className="text-slate-600 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No websites yet</h2>
        <p className="text-slate-400 mb-6">
          {user?.isGoogleConnected
            ? 'Click "Sync Google Properties" in the website switcher above.'
            : 'Connect your Google account to get started.'}
        </p>
        {!user?.isGoogleConnected && (
          <Link to="/settings" className="btn-primary inline-flex items-center gap-2">
            Connect Google Account
          </Link>
        )}
      </div>
    );
  }

  const errMsg = error?.response?.data?.error || (error ? 'Failed to load data.' : null);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <LayoutDashboard size={18} className="text-brand-400" />
            {activeWebsite.displayName || activeWebsite.domain}
          </h1>
          {/* Show the exact dates being queried — instant transparency */}
          <div className="flex items-center gap-2 mt-1">
            <DatePill startDate={startDate} endDate={endDate} label={label} />
            {d?.fromCache && (
              <span className="text-[10px] text-slate-600">cached · <button onClick={handleRefresh} className="underline hover:text-slate-400">refresh</button></span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker value={dateRange} onChange={setDateRange} />

          {/* Refresh — bypasses both React Query and server cache */}
          <button
            onClick={handleRefresh}
            disabled={loading || syncing}
            className="btn-outline text-xs flex items-center gap-1.5 py-2"
            title="Fetch fresh data directly from Google APIs"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>

          {/* Export CSV */}
          {d && (
            <a
              href={exportLiveMetrics(id, startDate, endDate)}
              download
              className="btn-secondary text-xs flex items-center gap-1.5 py-2"
            >
              <Download size={12} /> Export CSV
            </a>
          )}

          <Link to="/" className="btn-primary text-xs flex items-center gap-1.5 py-2">
            <Plus size={12} /> New Audit
          </Link>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {errMsg && (
        <div className="card p-4 flex items-center gap-3 text-red-400 text-sm">
          <AlertCircle size={16} />
          <span>{errMsg}</span>
          {errMsg.toLowerCase().includes('expired') && (
            <Link to="/settings" className="ml-auto text-xs text-brand-400 underline">
              Reconnect Google →
            </Link>
          )}
        </div>
      )}

      {/* ── Today snapshot (always visible, separate from period filter) ── */}
      {!isToday && (todayGA4 || todayGSC) && (
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={13} className="text-purple-400" />
            <span className="text-xs font-semibold text-purple-300">Today — {todayDate}</span>
            <SourceBadge source="Today" />
            <span className="text-[10px] text-slate-600 ml-1">(partial day — data updates throughout the day)</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {todayGA4?.current && (
              <>
                <KPICard label="Users Today"    value={todayGA4.current.users}    icon={<Users size={12} />}            size="sm" loading={todayLoading} />
                <KPICard label="Sessions Today" value={todayGA4.current.sessions} icon={<TrendingUp size={12} />}       size="sm" loading={todayLoading} />
                <KPICard label="Pages Today"    value={todayGA4.current.pageViews}icon={<Eye size={12} />}              size="sm" loading={todayLoading} />
              </>
            )}
            {todayGSC?.current && (
              <>
                <KPICard label="Clicks Today"      value={todayGSC.current.clicks}      icon={<MousePointerClick size={12} />} size="sm" loading={todayLoading} />
                <KPICard label="Impressions Today" value={todayGSC.current.impressions} icon={<Eye size={12} />}              size="sm" loading={todayLoading} />
                <KPICard label="Avg Position"      value={todayGSC.current.position ? `#${todayGSC.current.position}` : null} icon={<BarChart2 size={12} />} size="sm" loading={todayLoading} />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {loading && !d && (
        <div className="py-16 flex justify-center">
          <Loader size="lg" text={`Fetching ${label} data from Google…`} />
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      {(d || loading) && (
        <>
          <div className="flex border-b border-dark-700 gap-0 -mx-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
                  activeTab === t.id
                    ? 'text-brand-400 border-brand-500'
                    : 'text-slate-500 border-transparent hover:text-slate-200'
                }`}
              >
                {t.label}
                <SourceBadge source={t.badge} />
              </button>
            ))}
          </div>

          {/* ── ANALYTICS TAB (GA4) ─────────────────────────────────────── */}
          {activeTab === 'analytics' && (
            <div className="space-y-5">
              {/* KPI row */}
              {ga4?.current ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Google Analytics 4
                    </p>
                    <SourceBadge source="GA4" />
                    <DatePill startDate={startDate} endDate={endDate} label={label} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <KPICard label="Users"           value={ga4.current.users}          previousValue={ga4.previous?.users}          change={ga4.changes?.users}          icon={<Users size={13} />}            loading={loading} period={label} />
                    <KPICard label="New Users"        value={ga4.current.newUsers}       previousValue={ga4.previous?.newUsers}       change={ga4.changes?.newUsers}       icon={<Users size={13} />}            loading={loading} period={label} />
                    <KPICard label="Returning Users"  value={ga4.current.returningUsers} previousValue={ga4.previous?.returningUsers} change={ga4.changes?.returningUsers} icon={<Users size={13} />}            loading={loading} period={label} />
                    <KPICard label="Sessions"         value={ga4.current.sessions}       previousValue={ga4.previous?.sessions}       change={ga4.changes?.sessions}       icon={<TrendingUp size={13} />}       loading={loading} period={label} />
                    <KPICard label="Engagement Rate"  value={ga4.current.engagementRate != null ? `${ga4.current.engagementRate}%` : null} previousValue={ga4.previous?.engagementRate != null ? `${ga4.previous.engagementRate}%` : null} change={ga4.changes?.engagementRate} icon={<BarChart2 size={13} />} loading={loading} period={label} />
                    <KPICard label="Pages & Screens"  value={ga4.current.pageViews}      previousValue={ga4.previous?.pageViews}      change={ga4.changes?.pageViews}      icon={<Eye size={13} />}              loading={loading} period={label} />
                  </div>
                </div>
              ) : (
                <NoPropertyCard type="GA4" />
              )}

              {/* Trend chart */}
              {ga4?.current?.timeseries?.length > 0 && (
                <Section title={`Sessions & Users — ${label}`} badge="GA4">
                  <SessionsLineChart data={ga4.current.timeseries} />
                </Section>
              )}

              {/* Top Pages + Device */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {ga4?.current?.topPages?.length > 0 && (
                  <Section title="Top Pages" badge="GA4">
                    <SimpleTable
                      headers={['Page', 'Views', 'Users']}
                      rows={ga4.current.topPages.slice(0, 10).map((p) => [
                        p.path,
                        p.pageViews?.toLocaleString(),
                        p.users?.toLocaleString(),
                      ])}
                    />
                  </Section>
                )}
                {ga4?.current?.devices?.length > 0 && (
                  <Section title="Device Breakdown" badge="GA4">
                    <DeviceBreakdownChart data={ga4.current.devices} />
                    {ga4.current.browsers?.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-slate-500 font-medium mb-2">Browsers</p>
                        <SimpleTable
                          headers={['Browser', 'Users', 'Sessions']}
                          rows={ga4.current.browsers.slice(0, 6).map((b) => [
                            b.browser,
                            b.users?.toLocaleString(),
                            b.sessions?.toLocaleString(),
                          ])}
                        />
                      </div>
                    )}
                  </Section>
                )}
              </div>

              {/* GBP under Analytics tab */}
              {gbp && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Google Business Profile
                    </p>
                    <SourceBadge source="GBP" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <KPICard label="Website Clicks"     value={gbp.websiteClicks}     icon={<MousePointerClick size={13} />} loading={loading} />
                    <KPICard label="Direction Requests" value={gbp.directionRequests} icon={<Navigation size={13} />}       loading={loading} />
                    <KPICard label="Phone Calls"        value={gbp.phoneCalls}        icon={<Phone size={13} />}            loading={loading} />
                  </div>
                  {gbp.lastSyncedAt && (
                    <p className="text-xs text-slate-600 mt-2">
                      GBP last synced {new Date(gbp.lastSyncedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── SEARCH CONSOLE TAB (GSC) ────────────────────────────────── */}
          {activeTab === 'search-console' && (
            <div className="space-y-5">
              {gsc?.current ? (
                <>
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Google Search Console
                      </p>
                      <SourceBadge source="GSC" />
                      <DatePill startDate={startDate} endDate={endDate} label={label} />
                      {label === 'Today' && (
                        <span className="text-[10px] text-slate-600">
                          GSC data may have a 2–3 day lag — today's numbers may be 0
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <KPICard label="Clicks"       value={gsc.current.clicks}      previousValue={gsc.previous?.clicks}      change={gsc.changes?.clicks}      icon={<MousePointerClick size={13} />} loading={loading} period={label} />
                      <KPICard label="Impressions"  value={gsc.current.impressions} previousValue={gsc.previous?.impressions} change={gsc.changes?.impressions} icon={<Eye size={13} />}              loading={loading} period={label} />
                      <KPICard label="Avg CTR"      value={gsc.current.ctr != null ? `${gsc.current.ctr}%` : null} previousValue={gsc.previous?.ctr != null ? `${gsc.previous.ctr}%` : null} change={gsc.changes?.ctr} icon={<TrendingUp size={13} />} loading={loading} period={label} />
                      <KPICard label="Avg Position" value={gsc.current.position ? `#${gsc.current.position}` : null} previousValue={gsc.previous?.position ? `#${gsc.previous.position}` : null} change={gsc.changes?.position != null ? -gsc.changes.position : null} higherIsBetter={false} icon={<BarChart2 size={13} />} loading={loading} period={label} />
                    </div>
                  </div>

                  {gsc.current.timeseries?.length > 0 && (
                    <Section title={`Clicks & Impressions — ${label}`} badge="GSC">
                      <ClicksLineChart data={gsc.current.timeseries} />
                    </Section>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {gsc.current.topKeywords?.length > 0 && (
                      <Section title="Top Keywords" badge="GSC">
                        <SimpleTable
                          headers={['Keyword', 'Clicks', 'Impr.', 'CTR', 'Pos.']}
                          rows={gsc.current.topKeywords.map((k) => [
                            k.query,
                            k.clicks?.toLocaleString(),
                            k.impressions?.toLocaleString(),
                            `${k.ctr}%`,
                            `#${k.position}`,
                          ])}
                        />
                      </Section>
                    )}
                    {gsc.current.topPages?.length > 0 && (
                      <Section title="Top Pages (Search)" badge="GSC">
                        <SimpleTable
                          headers={['Page', 'Clicks', 'Impr.', 'Pos.']}
                          rows={gsc.current.topPages.slice(0, 10).map((p) => [
                            p.page,
                            p.clicks?.toLocaleString(),
                            p.impressions?.toLocaleString(),
                            `#${p.position}`,
                          ])}
                        />
                      </Section>
                    )}
                  </div>
                </>
              ) : (
                <GSCDiagnosticCard
                  gsc={gsc}
                  activeWebsite={activeWebsite}
                  discovering={discovering}
                  onRediscover={handleRediscover}
                  onLinked={() => {
                    // After manually linking a GSC property, force-refresh all data
                    queryClient.invalidateQueries({ queryKey: ['live-metrics', id] });
                    window.location.reload();
                  }}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Generic no-property placeholder ──────────────────────────────────────────

function NoPropertyCard({ type }) {
  const labels = { GA4: 'Google Analytics 4 property', GSC: 'Search Console property' };
  return (
    <div className="card p-10 text-center">
      <Search size={28} className="text-slate-600 mx-auto mb-3" />
      <h3 className="font-medium text-slate-300 mb-2">No {labels[type]} linked</h3>
      <p className="text-slate-500 text-sm mb-4">Link a {labels[type]} in Settings.</p>
      <Link to="/settings" className="btn-primary text-sm inline-block">Go to Settings</Link>
    </div>
  );
}

// ── Smart GSC diagnostic card ─────────────────────────────────────────────────
// Fetches available GSC sites from the user's Google account and lets them
// manually pick the right one if auto-discovery failed.

function GSCDiagnosticCard({ gsc, activeWebsite, discovering, onRediscover, onLinked }) {
  const [availableSites, setAvailableSites] = useState(null);  // null=not loaded, []= empty
  const [sitesLoading,   setSitesLoading]   = useState(false);
  const [sitesError,     setSitesError]     = useState(null);
  const [selectedSite,   setSelectedSite]   = useState('');
  const [linking,        setLinking]        = useState(false);
  const [linkError,      setLinkError]      = useState(null);

  const linkedSiteUrl = gsc?.siteUrl || activeWebsite?.gsc?.siteUrl;
  const configured    = gsc?.configured ?? !!linkedSiteUrl;
  const apiError      = gsc?.error;

  // Classified error types for targeted advice
  const isApiNotEnabled = apiError && /has not been used|SERVICE_DISABLED|is disabled/i.test(apiError);
  const isAuthError     = apiError && /invalid_grant|unauthenticated|credential/i.test(apiError);
  const isPermError     = apiError && /permission|forbidden|not a member/i.test(apiError);

  const loadAvailableSites = async () => {
    setSitesLoading(true);
    setSitesError(null);
    try {
      const { data } = await listGSCSites();
      setAvailableSites(data.sites || []);
    } catch (err) {
      setSitesError(err.response?.data?.diagnosis || err.response?.data?.error || err.message);
      setAvailableSites([]);
    } finally {
      setSitesLoading(false);
    }
  };

  const handleLink = async () => {
    if (!selectedSite) return;
    setLinking(true);
    setLinkError(null);
    try {
      await linkGSCProperty(activeWebsite._id, selectedSite);
      onLinked?.(); // refresh dashboard data
    } catch (err) {
      setLinkError(err.response?.data?.error || err.message);
    } finally {
      setLinking(false);
    }
  };

  // ── Manual link picker (shown in all not-working states) ──────────────────
  const ManualLinkPanel = () => (
    <div className="mt-5 pt-5 border-t border-dark-700">
      <p className="text-xs font-semibold text-slate-300 mb-3">
        Manually link a Search Console property
      </p>

      {availableSites === null ? (
        <button
          onClick={loadAvailableSites}
          disabled={sitesLoading}
          className="btn-secondary text-xs flex items-center gap-2"
        >
          {sitesLoading
            ? <><span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> Loading sites…</>
            : 'Fetch my Search Console sites'}
        </button>
      ) : sitesError ? (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300 space-y-2">
          <p><strong>Could not fetch GSC sites:</strong> {sitesError}</p>
          {/has not been used|SERVICE_DISABLED|is disabled/i.test(sitesError) && (
            <p>
              The <strong>Google Search Console API</strong> is not enabled in your Google Cloud project.{' '}
              <a
                href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com"
                target="_blank"
                rel="noreferrer"
                className="underline text-brand-400"
              >
                Enable it here →
              </a>
            </p>
          )}
          <button onClick={loadAvailableSites} className="text-xs text-slate-400 underline">Retry</button>
        </div>
      ) : availableSites.length === 0 ? (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
          <p><strong>No Search Console properties found</strong> in your Google account.</p>
          <p>
            Add and verify your website at{' '}
            <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="underline">
              search.google.com/search-console
            </a>
            , then come back and try again.
          </p>
          <button onClick={loadAvailableSites} className="text-xs text-slate-400 underline">Refresh list</button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Found {availableSites.length} site{availableSites.length !== 1 ? 's' : ''} in your Search Console account:
          </p>
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="">— Select a property to link —</option>
            {availableSites.map((s) => (
              <option key={s.siteUrl} value={s.siteUrl}>
                {s.siteUrl} ({s.permissionLevel})
              </option>
            ))}
          </select>

          {linkError && (
            <p className="text-xs text-red-400">{linkError}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleLink}
              disabled={!selectedSite || linking}
              className="btn-primary text-xs py-2 flex items-center gap-2 disabled:opacity-40"
            >
              {linking
                ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Linking…</>
                : 'Link this property'}
            </button>
            <button onClick={() => setAvailableSites(null)} className="text-xs text-slate-500 hover:text-slate-300">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── State 1: siteUrl never set ───────────────────────────────────────────
  if (!configured) {
    return (
      <div className="card p-7">
        <div className="flex items-start gap-3 mb-5">
          <Search size={22} className="text-slate-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-slate-200 mb-1">Search Console not linked</h3>
            <p className="text-slate-500 text-sm">
              No Search Console property is linked to{' '}
              <strong className="text-slate-300">{activeWebsite?.domain}</strong>.
            </p>
            <p className="text-slate-600 text-xs mt-1">
              This usually means the website was auto-discovered from GA4 only,
              and no matching Search Console property was found.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap mb-2">
          <button
            onClick={onRediscover}
            disabled={discovering}
            className="btn-primary text-xs flex items-center gap-2"
          >
            {discovering
              ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Discovering…</>
              : 'Auto-discover properties'}
          </button>
          <Link to="/settings" className="btn-secondary text-xs">Settings</Link>
        </div>

        <ManualLinkPanel />
      </div>
    );
  }

  // ── State 2: configured but API query failed ─────────────────────────────
  if (apiError) {
    return (
      <div className="card p-7">
        <div className="flex items-start gap-3 mb-4">
          <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-slate-200 mb-1">Search Console query failed</h3>
            <p className="text-xs text-slate-400 mb-1">
              Linked property: <span className="font-mono text-slate-300">{linkedSiteUrl}</span>
            </p>
            <p className="text-xs text-red-300 font-mono break-all">{apiError}</p>

            {isApiNotEnabled && (
              <div className="mt-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs text-orange-300 space-y-1">
                <p><strong>Google Search Console API is not enabled</strong> in your Google Cloud project.</p>
                <p>
                  Go to{' '}
                  <a
                    href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com"
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-brand-400"
                  >
                    console.cloud.google.com → APIs & Services → Library → "Google Search Console API" → Enable
                  </a>
                  , then click Refresh.
                </p>
              </div>
            )}
            {isAuthError && (
              <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                <strong>Session expired</strong> — Go to{' '}
                <Link to="/settings" className="underline">Settings</Link>{' '}
                and reconnect your Google account.
              </div>
            )}
            {isPermError && (
              <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                <strong>Permission denied</strong> — Your account doesn't have access to{' '}
                <span className="font-mono">{linkedSiteUrl}</span>. Use the manual picker below to select
                a property you do have access to.
              </div>
            )}
            {!isApiNotEnabled && !isAuthError && !isPermError && (
              <p className="text-xs text-slate-500 mt-2">
                Run the diagnostic at{' '}
                <span className="font-mono text-slate-400">/api/debug/gsc</span> to see the full breakdown.
              </p>
            )}
          </div>
        </div>

        {isAuthError && (
          <Link to="/settings" className="btn-primary text-xs mr-3">Reconnect Google →</Link>
        )}

        <ManualLinkPanel />
      </div>
    );
  }

  // ── State 3: configured, no error, but returned no data ─────────────────
  return (
    <div className="card p-7 text-center">
      <Search size={26} className="text-slate-600 mx-auto mb-3" />
      <h3 className="font-medium text-slate-300 mb-1">No Search Console data for this period</h3>
      <p className="text-slate-500 text-sm">
        Property: <span className="font-mono text-slate-400">{linkedSiteUrl}</span>
      </p>
      <p className="text-slate-600 text-xs mt-2">
        The site may have no organic impressions for the selected date range,
        or the data is still being processed by Google (can take 2–3 days).
      </p>
    </div>
  );
}