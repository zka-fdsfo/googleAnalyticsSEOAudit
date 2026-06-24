import { useQuery } from '@tanstack/react-query';
import { Search, TrendingUp, Eye, MousePointerClick, BarChart2, AlertCircle, RefreshCw } from 'lucide-react';
import { getWebsiteGSC, getGSCSeries } from '../../services/api';
import { ClicksLineChart, KeywordPositionChart, DeviceBreakdownChart } from '../charts/TrafficChart';
import Loader from '../common/Loader';

const StatCard = ({ icon, label, value, sub, iconColor = 'text-brand-400' }) => (
  <div className="card p-4">
    <div className="flex items-center justify-between mb-3">
      <span className="text-slate-400 text-sm">{label}</span>
      <div className={`w-8 h-8 bg-dark-700 rounded-lg flex items-center justify-center ${iconColor}`}>
        {icon}
      </div>
    </div>
    <div className="text-2xl font-bold text-white">{value}</div>
    {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
  </div>
);

/**
 * SearchConsolePanel
 * days prop drives the timeseries chart period.
 * Snapshot (overview + topKeywords) always reflects the latest stored 28-day window.
 */
export default function SearchConsolePanel({ websiteId, website, days = 30 }) {
  const {
    data: snapResp,
    isLoading: snapLoading,
    error: snapError,
    refetch,
  } = useQuery({
    queryKey: ['gsc-snap', websiteId],
    queryFn:  () => getWebsiteGSC(websiteId),
    enabled:  !!websiteId,
  });

  const { data: seriesResp } = useQuery({
    queryKey: ['gsc-series', websiteId, days, null, null],
    queryFn:  () => getGSCSeries(websiteId, days),
    enabled:  !!websiteId,
  });

  const snapshot  = snapResp?.data?.snapshot ?? null;
  const timeseries = seriesResp?.data?.series || [];
  const loading   = snapLoading;
  const error     = snapError?.response?.data?.error;

  if (!websiteId) return (
    <div className="card p-8 text-center">
      <Search size={32} className="text-slate-500 mx-auto mb-3" />
      <h3 className="font-semibold text-slate-200 mb-2">No website selected</h3>
      <p className="text-slate-400 text-sm">Select a website from the switcher above.</p>
    </div>
  );

  if (website && !website.gsc?.siteUrl) return (
    <div className="card p-8 text-center">
      <Search size={32} className="text-slate-500 mx-auto mb-3" />
      <h3 className="font-semibold text-slate-200 mb-2">Search Console not linked</h3>
      <p className="text-slate-400 text-sm mb-4">
        No Search Console property is linked to <strong>{website.domain}</strong>.
      </p>
      <a href="/settings" className="btn-primary inline-block text-sm">Go to Settings</a>
    </div>
  );

  if (loading) return <div className="py-16 flex justify-center"><Loader size="lg" text="Loading Search Console…" /></div>;

  if (error) return (
    <div className="card p-6 text-center">
      <AlertCircle size={24} className="text-red-400 mx-auto mb-2" />
      <p className="text-red-400 text-sm mb-3">{error}</p>
      <button onClick={refetch} className="btn-secondary text-sm">Retry</button>
    </div>
  );

  if (!snapshot) return (
    <div className="card p-8 text-center">
      <Search size={32} className="text-slate-500 mx-auto mb-3" />
      <h3 className="font-semibold text-slate-200 mb-2">No data synced yet</h3>
      <p className="text-slate-400 text-sm mb-4">
        {website?.gsc?.siteUrl
          ? `Collecting data for ${website.gsc.siteUrl}…`
          : 'Connect Google and sync to see Search Console data.'}
      </p>
      <a href="/settings" className="btn-secondary inline-block text-sm mr-2">Settings</a>
    </div>
  );

  const { overview, topKeywords, topPages, devices } = snapshot;
  const hasData = overview?.clicks > 0 || overview?.impressions > 0;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Search size={18} className="text-brand-400" /> Google Search Console
          </h2>
          {website?.gsc?.siteUrl && (
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{website.gsc.siteUrl}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {snapshot.fetchedAt && (
            <span className="text-xs text-slate-600">
              Updated {new Date(snapshot.fetchedAt).toLocaleTimeString()}
            </span>
          )}
          <button onClick={refetch} className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-dark-700">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {!hasData && (
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            <strong>No organic traffic recorded</strong> — verify that {website?.gsc?.siteUrl} has data in{' '}
            <a href={import.meta.env.VITE_GOOGLE_SEARCH_CONSOLE_URL} target="_blank" rel="noreferrer" className="underline">
              Search Console
            </a>.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<MousePointerClick size={15} />} label="Total Clicks"
          value={(overview?.clicks || 0).toLocaleString()} />
        <StatCard icon={<Eye size={15} />} label="Impressions"
          value={(overview?.impressions || 0).toLocaleString()} />
        <StatCard icon={<TrendingUp size={15} />} label="Avg. CTR"
          value={`${overview?.ctr || 0}%`} iconColor="text-emerald-400" />
        <StatCard icon={<BarChart2 size={15} />} label="Avg. Position"
          value={overview?.position > 0 ? `#${overview.position}` : '—'} iconColor="text-amber-400" />
      </div>

      {timeseries.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">
            Clicks & Impressions ({days}d)
          </h3>
          <ClicksLineChart data={timeseries} />
        </div>
      )}

      {hasData && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {topKeywords?.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Keywords by Position</h3>
                <KeywordPositionChart data={topKeywords.slice(0, 8)} />
              </div>
            )}
            {devices?.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Clicks by Device</h3>
                <DeviceBreakdownChart data={devices} />
              </div>
            )}
          </div>

          {topKeywords?.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Keywords</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 text-xs border-b border-dark-700">
                      <th className="pb-3 font-medium">Keyword</th>
                      <th className="pb-3 font-medium text-right">Clicks</th>
                      <th className="pb-3 font-medium text-right">Impr.</th>
                      <th className="pb-3 font-medium text-right">CTR</th>
                      <th className="pb-3 font-medium text-right">Position</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-700">
                    {topKeywords.slice(0, 20).map((kw, i) => (
                      <tr key={i} className="hover:bg-dark-700/30">
                        <td className="py-2.5 text-slate-300">{kw.query}</td>
                        <td className="py-2.5 text-right text-slate-300">{kw.clicks?.toLocaleString()}</td>
                        <td className="py-2.5 text-right text-slate-400">{kw.impressions?.toLocaleString()}</td>
                        <td className="py-2.5 text-right text-slate-400">{kw.ctr}%</td>
                        <td className="py-2.5 text-right">
                          <span className={kw.position <= 3 ? 'text-emerald-400 font-bold' : kw.position <= 10 ? 'text-amber-400' : 'text-slate-400'}>
                            #{kw.position}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}