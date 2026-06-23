import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Plus, Minus, Search, RefreshCw } from 'lucide-react';
import { getKeywordChanges } from '../../services/api';
import Loader from '../common/Loader';

const TABS = [
  { id: 'rising',       label: 'Rising',   icon: <TrendingUp size={13} className="text-emerald-400" />, color: 'text-emerald-400' },
  { id: 'falling',      label: 'Falling',  icon: <TrendingDown size={13} className="text-red-400" />,   color: 'text-red-400' },
  { id: 'newKeywords',  label: 'New',      icon: <Plus size={13} className="text-brand-400" />,          color: 'text-brand-400' },
  { id: 'lostKeywords', label: 'Lost',     icon: <Minus size={13} className="text-slate-500" />,         color: 'text-slate-500' },
];

const PositionBadge = ({ pos }) => {
  const color = pos <= 3 ? 'text-emerald-400 bg-emerald-500/10' : pos <= 10 ? 'text-amber-400 bg-amber-500/10' : 'text-slate-400 bg-dark-700';
  return <span className={`text-xs font-bold px-2 py-0.5 rounded ${color}`}>#{Math.round(pos)}</span>;
};

const ChangeBadge = ({ change }) => {
  if (!change) return null;
  const isImproved = change > 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-semibold ${isImproved ? 'text-emerald-400' : 'text-red-400'}`}>
      {isImproved ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(Math.round(change))}
    </span>
  );
};

// Clamp the outer days to the supported 7/14/30 choices for keyword lookback.
const clampLookback = (days) => {
  if (days <= 7)  return 7;
  if (days <= 14) return 14;
  return 30;
};

export default function KeywordChanges({ websiteId, days = 30 }) {
  const [tab, setTab]           = useState('rising');
  const [lookback, setLookback] = useState(() => clampLookback(days));
  const [search, setSearch]     = useState('');
  const queryClient             = useQueryClient();

  // Sync lookback when the parent date range changes.
  useEffect(() => { setLookback(clampLookback(days)); }, [days]);

  const { data: resp, isLoading: loading } = useQuery({
    queryKey: ['keyword-changes', websiteId, lookback],
    queryFn:  () => getKeywordChanges(websiteId, lookback),
    enabled:  !!websiteId,
  });

  const data = resp?.data ?? null;
  const load = () => queryClient.invalidateQueries({ queryKey: ['keyword-changes', websiteId, lookback] });

  const rows = (data?.[tab] || []).filter((k) =>
    !search || (k.query || k.keyword || '').toLowerCase().includes(search.toLowerCase())
  );

  const counts = {
    rising:       data?.rising?.length       || 0,
    falling:      data?.falling?.length      || 0,
    newKeywords:  data?.newKeywords?.length  || 0,
    lostKeywords: data?.lostKeywords?.length || 0,
  };

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-200">Keyword Movement</h3>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setLookback(d)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                lookback === d ? 'bg-brand-500 text-white' : 'bg-dark-700 text-slate-400 hover:text-white'
              }`}
            >
              {d}d
            </button>
          ))}
          <button onClick={load} className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-dark-700">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
              tab === t.id ? 'bg-dark-700 text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.icon}
            {t.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
              tab === t.id ? t.color : 'text-slate-600'
            } bg-dark-700`}>
              {counts[t.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter keywords..."
          className="input-field pl-8 py-2 text-xs"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-8 flex justify-center"><Loader size="sm" text="Loading keyword data..." /></div>
      ) : !data ? (
        <div className="text-center py-8 text-slate-500 text-sm">No keyword data available yet. Sync your website first.</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-sm">
          No {TABS.find((t) => t.id === tab)?.label.toLowerCase()} keywords found in this period.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs border-b border-dark-700">
                <th className="pb-2.5 font-medium">Keyword</th>
                <th className="pb-2.5 font-medium text-center">Position</th>
                {(tab === 'rising' || tab === 'falling') && (
                  <th className="pb-2.5 font-medium text-center">Change</th>
                )}
                <th className="pb-2.5 font-medium text-right">Clicks</th>
                <th className="pb-2.5 font-medium text-right">Impressions</th>
                <th className="pb-2.5 font-medium text-right">CTR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/50">
              {rows.slice(0, 50).map((kw, i) => (
                <tr key={i} className="hover:bg-dark-700/20 transition-colors">
                  <td className="py-2.5 text-slate-200 max-w-[200px] truncate">{kw.query}</td>
                  <td className="py-2.5 text-center">
                    <PositionBadge pos={kw.position} />
                  </td>
                  {(tab === 'rising' || tab === 'falling') && (
                    <td className="py-2.5 text-center">
                      <ChangeBadge change={kw.positionChange} />
                    </td>
                  )}
                  <td className="py-2.5 text-right text-slate-300">{kw.clicks?.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-slate-400">{kw.impressions?.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-slate-400">{kw.ctr}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
