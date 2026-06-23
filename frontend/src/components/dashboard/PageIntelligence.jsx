import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, MousePointerClick, RefreshCw } from 'lucide-react';
import { getPageIntelligence } from '../../services/api';
import Loader from '../common/Loader';

const TABS = [
  { id: 'growing',   label: 'Growing',     icon: <TrendingUp size={13} className="text-emerald-400" /> },
  { id: 'declining', label: 'Declining',   icon: <TrendingDown size={13} className="text-red-400" /> },
  { id: 'lowCTR',   label: 'Low CTR',     icon: <MousePointerClick size={13} className="text-amber-400" /> },
  { id: 'improving', label: 'Rising Rank', icon: <TrendingUp size={13} className="text-brand-400" /> },
];

const ChangeCell = ({ val, suffix = '%', flip = false }) => {
  if (val === null || val === undefined) return <span className="text-slate-600">—</span>;
  const isGood = flip ? val < 0 : val > 0;
  return (
    <span className={`flex items-center gap-0.5 justify-end text-xs font-semibold ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
      {val > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {Math.abs(val).toFixed(1)}{suffix}
    </span>
  );
};

const clampLookback = (days) => {
  if (days <= 7)  return 7;
  if (days <= 14) return 14;
  return 30;
};

export default function PageIntelligence({ websiteId, days = 30 }) {
  const [tab, setTab]           = useState('growing');
  const [lookback, setLookback] = useState(() => clampLookback(days));
  const queryClient             = useQueryClient();

  // Sync lookback when the parent date range changes.
  useEffect(() => { setLookback(clampLookback(days)); }, [days]);

  const { data: resp, isLoading: loading } = useQuery({
    queryKey: ['page-intelligence', websiteId, lookback],
    queryFn:  () => getPageIntelligence(websiteId, lookback),
    enabled:  !!websiteId,
  });

  const data = resp?.data ?? null;
  const load = () => queryClient.invalidateQueries({ queryKey: ['page-intelligence', websiteId, lookback] });

  const rows = data?.[tab] || [];

  const isEmpty = !loading && (!data || rows.length === 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-200">Page Intelligence</h3>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((d) => (
            <button key={d} onClick={() => setLookback(d)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${lookback === d ? 'bg-brand-500 text-white' : 'bg-dark-700 text-slate-400 hover:text-white'}`}>
              {d}d
            </button>
          ))}
          <button onClick={load} className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-dark-700">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => {
          const count = data?.[t.id]?.length || 0;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${tab === t.id ? 'bg-dark-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
              {t.icon}{t.label}
              {count > 0 && (
                <span className={`text-xs font-bold px-1.5 rounded-full ${tab === t.id ? 'bg-brand-500 text-white' : 'bg-dark-700 text-slate-500'}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-8 flex justify-center"><Loader size="sm" text="Analyzing pages..." /></div>
      ) : isEmpty ? (
        <div className="text-center py-8 text-slate-500 text-sm">No {TABS.find(t=>t.id===tab)?.label.toLowerCase()} pages found in the last {lookback} days.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs border-b border-dark-700">
                <th className="pb-2.5 font-medium">Page</th>
                <th className="pb-2.5 font-medium text-right">Clicks</th>
                <th className="pb-2.5 font-medium text-right">Impr.</th>
                <th className="pb-2.5 font-medium text-right">CTR</th>
                <th className="pb-2.5 font-medium text-right">Pos.</th>
                {(tab === 'growing' || tab === 'declining') && (
                  <th className="pb-2.5 font-medium text-right">Change</th>
                )}
                {tab === 'lowCTR' && (
                  <th className="pb-2.5 font-medium text-right">+Est. Clicks</th>
                )}
                {tab === 'improving' && (
                  <th className="pb-2.5 font-medium text-right">Pos. Gain</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/40">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-dark-700/20 transition-colors">
                  <td className="py-2.5 max-w-[200px]">
                    <span className="text-slate-300 font-mono text-xs block truncate">{r.page || r.path}</span>
                  </td>
                  <td className="py-2.5 text-right text-slate-300">{r.clicks?.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-slate-400">{r.impressions?.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-slate-400">{r.ctr}%</td>
                  <td className="py-2.5 text-right">
                    <span className={r.position <= 3 ? 'text-emerald-400 font-bold' : r.position <= 10 ? 'text-amber-400' : 'text-slate-400'}>
                      #{Math.round(r.position)}
                    </span>
                  </td>
                  {(tab === 'growing' || tab === 'declining') && (
                    <td className="py-2.5 text-right">
                      <ChangeCell val={r.clickChange} />
                    </td>
                  )}
                  {tab === 'lowCTR' && (
                    <td className="py-2.5 text-right text-emerald-400 text-xs font-semibold">
                      +{r.estimatedGain?.toLocaleString()}
                    </td>
                  )}
                  {tab === 'improving' && (
                    <td className="py-2.5 text-right">
                      <ChangeCell val={r.positionChange} suffix=" pos" />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}