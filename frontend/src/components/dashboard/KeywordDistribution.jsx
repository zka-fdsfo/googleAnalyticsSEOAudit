import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, RefreshCw } from 'lucide-react';
import { getKeywordDistribution } from '../../services/api';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const GROUPS = [
  { key: 'top3',   label: 'Top 3',   color: '#22c55e', bg: 'bg-emerald-500/10', text: 'text-emerald-400', ring: '#22c55e', desc: 'Featured zone' },
  { key: 'top10',  label: '4–10',    color: '#f59e0b', bg: 'bg-amber-500/10',   text: 'text-amber-400',   ring: '#f59e0b', desc: 'First page' },
  { key: 'top20',  label: '11–20',   color: '#f97316', bg: 'bg-orange-500/10',  text: 'text-orange-400',  ring: '#f97316', desc: 'Second page' },
  { key: 'beyond', label: '21+',     color: '#64748b', bg: 'bg-slate-700',      text: 'text-slate-400',   ring: '#64748b', desc: 'Beyond page 2' },
];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-semibold text-white mb-1">{d.label}</p>
      <p className="text-slate-300">{d.count} keywords</p>
      <p className="text-slate-400">{d.clicks.toLocaleString()} clicks</p>
    </div>
  );
};

export default function KeywordDistribution({ websiteId, days = 30 }) {
  const [selected, setSelected] = useState(null);
  const queryClient = useQueryClient();

  const { data: resp, isLoading: loading } = useQuery({
    queryKey: ['keyword-distribution', websiteId, days],
    queryFn:  () => getKeywordDistribution(websiteId),
    enabled:  !!websiteId,
  });
  const data = resp?.data ?? null;

  const load = () =>
    queryClient.invalidateQueries({ queryKey: ['keyword-distribution', websiteId, days] });

  if (loading) return (
    <div className="flex items-center gap-2 text-slate-500 text-sm py-6 justify-center">
      <div className="w-4 h-4 rounded-full border-2 border-dark-600 border-t-brand-500 animate-spin" />
      Loading keyword data...
    </div>
  );

  if (!data?.total) return (
    <div className="text-center py-6 text-slate-500 text-sm">No keyword data yet.</div>
  );

  const chartData = GROUPS.map((g) => ({
    ...g,
    count:  data[g.key]?.count || 0,
    clicks: data[g.key]?.clicks || 0,
  })).filter((g) => g.count > 0);

  const activeGroup = selected ? GROUPS.find((g) => g.key === selected) : null;
  const activeData  = selected ? data[selected] : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Keyword Distribution</h3>
          <p className="text-xs text-slate-500 mt-0.5">{data.total} keywords tracked</p>
        </div>
        <button onClick={load} className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-dark-700">
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Donut chart */}
        <div className="relative flex items-center justify-center">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%" cy="50%"
                innerRadius={55} outerRadius={80}
                dataKey="count"
                strokeWidth={2}
                stroke="#1e293b"
                onClick={(d) => setSelected(selected === d.key ? null : d.key)}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.key}
                    fill={entry.color}
                    opacity={selected && selected !== entry.key ? 0.3 : 1}
                    style={{ cursor: 'pointer' }}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-2xl font-black text-white">{data.total}</div>
            <div className="text-xs text-slate-500">keywords</div>
          </div>
        </div>

        {/* Group breakdown */}
        <div className="space-y-2 flex flex-col justify-center">
          {GROUPS.map((g) => {
            const gData = data[g.key];
            if (!gData) return null;
            const pct = data.total > 0 ? Math.round((gData.count / data.total) * 100) : 0;
            return (
              <button
                key={g.key}
                onClick={() => setSelected(selected === g.key ? null : g.key)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-all text-left ${
                  selected === g.key ? `${g.bg} ring-1 ring-current` : 'hover:bg-dark-700'
                } ${g.text}`}
              >
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{g.label}</span>
                    <span className="text-xs font-bold">{gData.count}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1 bg-dark-600 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: g.color }} />
                    </div>
                    <span className="text-xs text-slate-500 w-8 text-right">{pct}%</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected group detail */}
      {activeGroup && activeData && (
        <div className={`p-4 rounded-xl border ${activeGroup.bg} border-current ${activeGroup.text} space-y-3 animate-fade-in`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp size={14} />
            {activeGroup.label} — {activeGroup.desc}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Keywords', activeData.count],
              ['Clicks',   activeData.clicks?.toLocaleString()],
              ['Avg Pos',  `#${activeData.avgPosition}`],
            ].map(([l, v]) => (
              <div key={l} className="text-center">
                <div className="text-lg font-black text-white">{v}</div>
                <div className="text-xs text-slate-500">{l}</div>
              </div>
            ))}
          </div>
          {activeData.topKeywords?.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-slate-500 mb-1">Top keywords</div>
              {activeData.topKeywords.slice(0, 4).map((kw, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 truncate max-w-[160px]">{kw.query}</span>
                  <span className="text-slate-400 flex-shrink-0">#{Math.round(kw.position)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}