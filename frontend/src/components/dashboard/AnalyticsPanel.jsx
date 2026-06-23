import { useQuery } from '@tanstack/react-query';
import { Users, TrendingUp, Clock, MousePointerClick, Eye, AlertCircle, RefreshCw } from 'lucide-react';
import { getWebsiteAnalytics, getAnalyticsSeries } from '../../services/api';
import { SessionsLineChart, TrafficSourcesChart, DeviceBreakdownChart } from '../charts/TrafficChart';
import Loader from '../common/Loader';

const StatCard = ({ icon, label, value, sub }) => (
  <div className="card p-4">
    <div className="flex items-center justify-between mb-3">
      <span className="text-slate-400 text-sm">{label}</span>
      <div className="w-8 h-8 bg-dark-700 rounded-lg flex items-center justify-center text-brand-400">
        {icon}
      </div>
    </div>
    <div className="text-2xl font-bold text-white">{value}</div>
    {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
  </div>
);

const formatDuration = (s) => {
  if (!s) return '0s';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};

/**
 * AnalyticsPanel
 * days prop drives the timeseries chart period.
 * Snapshot always reflects the latest stored 30-day window.
 */
export default function AnalyticsPanel({ websiteId, website, days = 30 }) {
  const {
    data: snapResp,
    isLoading: snapLoading,
    error: snapError,
    refetch,
  } = useQuery({
    queryKey: ['analytics-snap', websiteId],
    queryFn:  () => getWebsiteAnalytics(websiteId),
    enabled:  !!websiteId,
  });

  const { data: seriesResp } = useQuery({
    queryKey: ['analytics-series', websiteId, days, null, null],
    queryFn:  () => getAnalyticsSeries(websiteId, days),
    enabled:  !!websiteId,
  });

  const snapshot  = snapResp?.data?.snapshot ?? null;
  const timeseries = seriesResp?.data?.series || [];
  const loading   = snapLoading;
  const error     = snapError?.response?.data?.error;

  if (!websiteId) return (
    <div className="card p-8 text-center">
      <Users size={32} className="text-slate-500 mx-auto mb-3" />
      <h3 className="font-semibold text-slate-200 mb-2">No website selected</h3>
    </div>
  );

  if (website && !website.ga4?.propertyId) return (
    <div className="card p-8 text-center">
      <Users size={32} className="text-slate-500 mx-auto mb-3" />
      <h3 className="font-semibold text-slate-200 mb-2">Google Analytics not linked</h3>
      <p className="text-slate-400 text-sm mb-4">No GA4 property linked to <strong>{website.domain}</strong>.</p>
      <a href="/settings" className="btn-primary inline-block text-sm">Go to Settings</a>
    </div>
  );

  if (loading) return <div className="py-16 flex justify-center"><Loader size="lg" text="Loading Analytics…" /></div>;

  if (error) return (
    <div className="card p-6 text-center">
      <AlertCircle size={24} className="text-red-400 mx-auto mb-2" />
      <p className="text-red-400 text-sm mb-3">{error}</p>
      <button onClick={refetch} className="btn-secondary text-sm">Retry</button>
    </div>
  );

  if (!snapshot) return (
    <div className="card p-8 text-center">
      <Users size={32} className="text-slate-500 mx-auto mb-3" />
      <h3 className="font-semibold text-slate-200 mb-2">No data synced yet</h3>
      <p className="text-slate-400 text-sm">Analytics data is being collected. Check back after syncing.</p>
    </div>
  );

  const { overview, trafficSources, topPages, devices } = snapshot;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <TrendingUp size={18} className="text-brand-400" /> Google Analytics 4
        </h2>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users size={15} />}           label="Users"             value={(overview?.users || 0).toLocaleString()} />
        <StatCard icon={<TrendingUp size={15} />}      label="Sessions"          value={(overview?.sessions || 0).toLocaleString()} />
        <StatCard icon={<MousePointerClick size={15}/>} label="Bounce Rate"      value={`${overview?.bounceRate || 0}%`} />
        <StatCard icon={<Clock size={15} />}           label="Avg. Duration"     value={formatDuration(overview?.avgSessionDuration)} />
        <StatCard icon={<Users size={15} />}           label="New Users"         value={(overview?.newUsers || 0).toLocaleString()} />
        <StatCard icon={<Eye size={15} />}             label="Page Views"        value={(overview?.pageViews || 0).toLocaleString()} />
        <StatCard icon={<TrendingUp size={15} />}      label="Engaged Sessions"  value={(overview?.engagedSessions || 0).toLocaleString()} />
        <StatCard icon={<Users size={15} />}           label="Engagement Rate"   value={`${overview?.engagementRate || 0}%`} />
      </div>

      {timeseries.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Sessions & Users ({days}d)</h3>
          <SessionsLineChart data={timeseries} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {trafficSources?.length > 0 && (
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Traffic Sources</h3>
            <TrafficSourcesChart data={trafficSources} />
          </div>
        )}
        {devices?.length > 0 && (
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Device Breakdown</h3>
            <DeviceBreakdownChart data={devices} />
          </div>
        )}
      </div>

      {topPages?.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Pages</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 text-xs border-b border-dark-700">
                  <th className="pb-3 font-medium">Page</th>
                  <th className="pb-3 font-medium text-right">Views</th>
                  <th className="pb-3 font-medium text-right">Users</th>
                  <th className="pb-3 font-medium text-right">Bounce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {topPages.map((p, i) => (
                  <tr key={i} className="hover:bg-dark-700/30">
                    <td className="py-2.5 text-slate-300 font-mono text-xs truncate max-w-[250px]">
                      {p.path}
                      {p.title && <span className="block text-slate-500 not-italic">{p.title}</span>}
                    </td>
                    <td className="py-2.5 text-right text-slate-300">{p.pageViews?.toLocaleString()}</td>
                    <td className="py-2.5 text-right text-slate-400">{p.users?.toLocaleString()}</td>
                    <td className="py-2.5 text-right text-slate-400">{p.bounceRate?.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}