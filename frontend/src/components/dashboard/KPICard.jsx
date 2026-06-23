import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * Enterprise KPI card — shows current value, growth %, trend arrow, and period context.
 * higherIsBetter: true for traffic/clicks/sessions; false for bounce rate/position/CLS
 */
export default function KPICard({
  label,
  value,
  previousValue,    // optional: shown as "Previously: X" below trend
  change,           // number: % change vs previous period, null = no data
  unit = '',
  prefix = '',
  higherIsBetter = true,
  icon,
  loading = false,
  period = '30d',
  className = '',
  size = 'md',      // 'sm' | 'md' | 'lg'
}) {
  // Treat undefined/NaN/Infinity the same as null — "no comparison data"
  const safeChange = (change !== null && change !== undefined && Number.isFinite(Number(change)))
    ? Number(change)
    : null;

  const isPositive = safeChange !== null && safeChange > 0;
  const isNeutral  = safeChange === null || safeChange === 0;
  const isGood     = higherIsBetter ? isPositive : !isPositive;

  const trendColor  = isNeutral ? 'text-slate-500' : isGood ? 'text-emerald-400' : 'text-red-400';
  const trendBg     = isNeutral ? '' : isGood ? 'bg-emerald-500/10' : 'bg-red-500/10';
  const valueSize   = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-xl' : 'text-2xl';

  const formatValue = (v) => {
    if (v === null || v === undefined) return '—';
    if (typeof v !== 'number') return v;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
    return v.toLocaleString();
  };

  return (
    <div className={`card p-5 ${className}`}>
      {/* Label + icon */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider leading-none">
          {label}
        </span>
        {icon && <span className="text-slate-600">{icon}</span>}
      </div>

      {/* Value */}
      {loading ? (
        <div className="h-8 w-24 bg-dark-700 rounded animate-pulse" />
      ) : (
        <div className={`font-black text-white ${valueSize} leading-none`}>
          {prefix}{formatValue(value)}{unit}
        </div>
      )}

      {/* Trend row */}
      <div className="mt-3 flex items-center gap-2">
        {loading ? (
          <div className="h-4 w-20 bg-dark-700 rounded animate-pulse" />
        ) : safeChange !== null ? (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded ${trendColor} ${trendBg}`}>
            {isNeutral
              ? <Minus size={11} />
              : isPositive
              ? <TrendingUp size={11} />
              : <TrendingDown size={11} />}
            {isPositive ? '+' : ''}{safeChange.toFixed(1)}%
          </span>
        ) : (
          <span className="text-xs text-slate-600">No comparison yet</span>
        )}
        {safeChange !== null && (
          <span className="text-xs text-slate-600">vs prev {period}</span>
        )}
      </div>

      {/* Previous value */}
      {!loading && previousValue !== null && previousValue !== undefined && (
        <div className="mt-1 text-xs text-slate-600">
          Previously: {prefix}{formatValue(previousValue)}{unit}
        </div>
      )}
    </div>
  );
}
