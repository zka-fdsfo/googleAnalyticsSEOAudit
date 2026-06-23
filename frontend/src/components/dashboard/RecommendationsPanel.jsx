import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, EyeOff, AlertTriangle, ChevronDown, ChevronUp, Lightbulb, Zap, RefreshCw } from 'lucide-react';
import { getRecommendations, patchRecommendation } from '../../services/api';
import Loader from '../common/Loader';
import toast from 'react-hot-toast';

const IMPACT_COLORS = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  high:     'text-orange-400 bg-orange-500/10 border-orange-500/20',
  medium:   'text-amber-400 bg-amber-500/10 border-amber-500/20',
  low:      'text-slate-400 bg-dark-700 border-dark-600',
};

const DIFFICULTY_COLORS = {
  easy:   'text-emerald-400',
  medium: 'text-amber-400',
  hard:   'text-red-400',
};

const STATUS_TABS = [
  { id: 'open',        label: 'Open',        icon: <AlertTriangle size={12} /> },
  { id: 'in_progress', label: 'In Progress', icon: <Clock size={12} /> },
  { id: 'fixed',       label: 'Fixed',       icon: <CheckCircle2 size={12} /> },
  { id: 'ignored',     label: 'Ignored',     icon: <EyeOff size={12} /> },
];

function RecCard({ rec, onUpdate }) {
  const [open, setOpen]   = useState(rec.seoImpact === 'critical');
  const [busy, setBusy]   = useState(false);

  const handle = async (status) => {
    setBusy(true);
    try {
      await onUpdate(rec._id, status);
      toast.success(status === 'fixed' ? 'Marked as fixed!' : `Status updated.`);
    } finally { setBusy(false); }
  };

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${
      rec.seoImpact === 'critical' ? 'border-red-500/20' : 'border-dark-700'
    }`}>
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-dark-700/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${IMPACT_COLORS[rec.seoImpact] || IMPACT_COLORS.medium}`}>
              {rec.seoImpact} SEO impact
            </span>
            <span className="text-xs text-slate-500">{rec.category}</span>
          </div>
          <h4 className="text-sm font-semibold text-slate-100 leading-snug">{rec.problem || rec.title}</h4>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
            <span className={`font-medium ${DIFFICULTY_COLORS[rec.difficulty]}`}>{rec.difficulty}</span>
            <span>·</span>
            <span>Est. {rec.estimatedEffort}</span>
            {rec.priority >= 8 && (
              <><span>·</span><span className="flex items-center gap-0.5 text-brand-400"><Zap size={10} /> High priority</span></>
            )}
          </div>
        </div>
        <span className="text-slate-600 flex-shrink-0 mt-0.5">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 animate-fade-in">
          {rec.recommendation && (
            <div className="flex gap-2.5 p-3 bg-brand-500/10 border border-brand-500/20 rounded-lg">
              <Lightbulb size={14} className="text-brand-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 leading-relaxed">{rec.recommendation}</div>
            </div>
          )}
          {rec.reason && (
            <p className="text-xs text-slate-500 leading-relaxed">{rec.reason}</p>
          )}

          {/* Action buttons */}
          {rec.status === 'open' || rec.status === 'in_progress' ? (
            <div className="flex gap-2 pt-1">
              {rec.status === 'open' && (
                <button
                  onClick={() => handle('in_progress')}
                  disabled={busy}
                  className="text-xs px-3 py-1.5 bg-brand-500/10 text-brand-400 border border-brand-500/20 rounded-lg hover:bg-brand-500/20 transition-all font-medium"
                >
                  Start Working
                </button>
              )}
              <button
                onClick={() => handle('fixed')}
                disabled={busy}
                className="text-xs px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-all font-medium"
              >
                Mark Fixed
              </button>
              <button
                onClick={() => handle('ignored')}
                disabled={busy}
                className="text-xs px-3 py-1.5 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-dark-700 transition-all"
              >
                Ignore
              </button>
            </div>
          ) : rec.status === 'fixed' ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 size={12} /> Fixed {rec.resolvedAt ? `on ${new Date(rec.resolvedAt).toLocaleDateString()}` : ''}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function RecommendationsPanel({ websiteId, days = 30 }) {
  const [tab, setTab] = useState('open');
  const queryClient   = useQueryClient();

  const { data: resp, isLoading: loading } = useQuery({
    queryKey: ['recommendations', websiteId, tab, days],
    queryFn:  () => getRecommendations(websiteId, { status: tab, limit: 30 }),
    enabled:  !!websiteId,
  });
  const data = resp?.data ?? null;

  const load = () =>
    queryClient.invalidateQueries({ queryKey: ['recommendations', websiteId, tab, days] });

  const handleUpdate = async (id, status) => {
    await patchRecommendation(websiteId, id, { status });
    load();
  };

  const summary = data?.summary || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-200">SEO Recommendations</h3>
        <button onClick={load} className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-dark-700">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              tab === t.id ? 'bg-dark-700 text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.icon}
            {t.label}
            {summary[t.id] > 0 && (
              <span className={`text-xs font-bold px-1.5 rounded-full ${
                tab === t.id ? 'bg-brand-500 text-white' : 'bg-dark-600 text-slate-400'
              }`}>
                {summary[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Loader size="md" text="Loading recommendations..." /></div>
      ) : !data?.items?.length ? (
        <div className="card p-8 text-center">
          <CheckCircle2 size={28} className="text-emerald-500 mx-auto mb-2" />
          <p className="text-slate-300 font-medium mb-1">
            {tab === 'open' ? 'No open issues!' : `No ${tab.replace('_', ' ')} recommendations.`}
          </p>
          <p className="text-slate-500 text-sm">
            {tab === 'open' ? 'Run an SEO audit to detect new recommendations.' : ''}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.items.map((rec) => (
            <RecCard key={rec._id} rec={rec} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
