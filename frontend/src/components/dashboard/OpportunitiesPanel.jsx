import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, MousePointerClick, Search, Target, ChevronDown, ChevronUp, CheckCircle2, RefreshCw } from 'lucide-react';
import { getOpportunities, patchOpportunity } from '../../services/api';
import Loader from '../common/Loader';
import toast from 'react-hot-toast';

const TYPE_CONFIG = {
  easy_win_keyword:  { label: 'Easy Win',       color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: <TrendingUp size={11} /> },
  low_ctr:           { label: 'Low CTR',         color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',       icon: <MousePointerClick size={11} /> },
  ranking_decline:   { label: 'Ranking Drop',    color: 'text-red-400 bg-red-500/10 border-red-500/20',             icon: <TrendingDown size={11} /> },
  traffic_decline:   { label: 'Traffic Drop',    color: 'text-red-400 bg-red-500/10 border-red-500/20',             icon: <TrendingDown size={11} /> },
  new_keyword:       { label: 'New Keyword',     color: 'text-brand-400 bg-brand-500/10 border-brand-500/20',       icon: <Target size={11} /> },
  featured_snippet:  { label: 'Featured Snippet',color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',    icon: <Search size={11} /> },
};
const getTypeConfig = (t) => TYPE_CONFIG[t] || { label: t, color: 'text-slate-400 bg-dark-700 border-dark-600', icon: null };

const PRIORITY_COLORS = { critical: 'text-red-400', high: 'text-orange-400', medium: 'text-amber-400', low: 'text-slate-400' };

function ScoreBar({ score }) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-slate-600';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold text-slate-300 w-7 text-right">{score}</span>
    </div>
  );
}

function OppCard({ opp, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cfg = getTypeConfig(opp.type);

  const handle = async (status) => {
    setBusy(true);
    try {
      await onUpdate(opp._id, status);
      toast.success('Updated!');
    } finally { setBusy(false); }
  };

  return (
    <div className="border border-dark-700 rounded-xl overflow-hidden hover:border-dark-600 transition-all">
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-dark-700/20 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>
              {cfg.icon}{cfg.label}
            </span>
            <span className={`text-xs font-semibold ${PRIORITY_COLORS[opp.priority]}`}>
              {opp.priority} priority
            </span>
          </div>
          <h4 className="text-sm font-semibold text-slate-100 leading-snug">{opp.title}</h4>
          <div className="mt-2">
            <ScoreBar score={opp.opportunityScore} />
          </div>
          {opp.estimatedTrafficGain > 0 && (
            <div className="text-xs text-emerald-400 mt-1.5 font-medium">
              +{opp.estimatedTrafficGain.toLocaleString()} est. clicks/month
            </div>
          )}
        </div>
        <span className="text-slate-600 flex-shrink-0 mt-0.5">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-dark-700 pt-3 animate-fade-in">
          {opp.description && (
            <p className="text-xs text-slate-400 leading-relaxed">{opp.description}</p>
          )}

          {/* Context metrics */}
          {(opp.currentPosition || opp.currentClicks || opp.currentImpressions) && (
            <div className="grid grid-cols-3 gap-2">
              {opp.currentPosition && (
                <div className="bg-dark-700 rounded-lg p-2 text-center">
                  <div className="text-xs text-slate-500">Position</div>
                  <div className="text-sm font-bold text-white">#{Math.round(opp.currentPosition)}</div>
                </div>
              )}
              {opp.currentClicks != null && (
                <div className="bg-dark-700 rounded-lg p-2 text-center">
                  <div className="text-xs text-slate-500">Clicks</div>
                  <div className="text-sm font-bold text-white">{opp.currentClicks?.toLocaleString()}</div>
                </div>
              )}
              {opp.currentImpressions != null && (
                <div className="bg-dark-700 rounded-lg p-2 text-center">
                  <div className="text-xs text-slate-500">Impressions</div>
                  <div className="text-sm font-bold text-white">{opp.currentImpressions?.toLocaleString()}</div>
                </div>
              )}
            </div>
          )}

          {opp.recommendation && (
            <div className="p-3 bg-brand-500/5 border border-brand-500/15 rounded-lg text-xs text-slate-300 leading-relaxed">
              {opp.recommendation}
            </div>
          )}

          <div className="flex gap-2">
            {opp.status === 'new' && (
              <button onClick={() => handle('acknowledged')} disabled={busy}
                className="text-xs px-3 py-1.5 bg-brand-500/10 text-brand-400 border border-brand-500/20 rounded-lg hover:bg-brand-500/20 font-medium transition-all">
                Acknowledge
              </button>
            )}
            {(opp.status === 'new' || opp.status === 'acknowledged') && (
              <button onClick={() => handle('in_progress')} disabled={busy}
                className="text-xs px-3 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 font-medium transition-all">
                Working On It
              </button>
            )}
            <button onClick={() => handle('completed')} disabled={busy}
              className="text-xs px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 font-medium transition-all">
              <CheckCircle2 size={11} className="inline mr-1" />Done
            </button>
            <button onClick={() => handle('dismissed')} disabled={busy}
              className="text-xs px-3 py-1.5 text-slate-600 hover:text-slate-300 rounded-lg hover:bg-dark-700 transition-all">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OpportunitiesPanel({ websiteId, days = 30 }) {
  const [filter, setFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: resp, isLoading: loading } = useQuery({
    queryKey: ['opportunities', websiteId, days],
    queryFn:  () => getOpportunities(websiteId, { limit: 30 }),
    enabled:  !!websiteId,
  });
  const data = resp?.data ?? null;

  const load = () =>
    queryClient.invalidateQueries({ queryKey: ['opportunities', websiteId, days] });

  const handleUpdate = async (id, status) => {
    await patchOpportunity(websiteId, id, { status });
    load();
  };

  const TYPE_FILTERS = ['all', 'easy_win_keyword', 'low_ctr', 'ranking_decline', 'traffic_decline'];
  const items = (data?.items || []).filter((o) => filter === 'all' || o.type === filter);
  const totalScore = items.reduce((s, o) => s + o.estimatedTrafficGain, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">SEO Opportunities</h3>
          {totalScore > 0 && (
            <p className="text-xs text-emerald-400 mt-0.5">
              +{totalScore.toLocaleString()} est. additional clicks/month potential
            </p>
          )}
        </div>
        <button onClick={load} className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-dark-700">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-all ${
              filter === f ? 'bg-brand-500 text-white' : 'bg-dark-700 text-slate-400 hover:text-white'
            }`}
          >
            {f === 'all' ? 'All' : getTypeConfig(f).label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Loader size="md" text="Detecting opportunities..." /></div>
      ) : !items.length ? (
        <div className="card p-8 text-center">
          <Target size={28} className="text-slate-600 mx-auto mb-2" />
          <p className="text-slate-300 font-medium mb-1">No opportunities found</p>
          <p className="text-slate-500 text-sm">Sync your website data to detect SEO opportunities.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((opp) => (
            <OppCard key={opp._id} opp={opp} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
