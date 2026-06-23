import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Zap, RefreshCw, CheckCircle2, AlertTriangle, XCircle, ArrowRight } from 'lucide-react';
import { getSEOScore, startAudit } from '../../services/api';
import ScoreGauge from '../charts/ScoreGauge';
import toast from 'react-hot-toast';

const CategoryBar = ({ name, score }) => {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400 truncate max-w-[120px]">{name}</span>
        <span className={`font-bold ${score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{score}</span>
      </div>
      <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
};

export default function SEOScoreWidget({ websiteId, websiteDomain }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);

  const load = async () => {
    if (!websiteId) return;
    setLoading(true);
    try {
      const { data: d } = await getSEOScore(websiteId);
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [websiteId]);

  const handleRunAudit = async () => {
    if (!websiteDomain) {
      toast.error('No domain configured for this website.');
      return;
    }
    setAuditing(true);
    try {
      const url = websiteDomain.startsWith('http') ? websiteDomain : `https://${websiteDomain}`;
      const { data } = await startAudit(url);
      toast.success('Audit started! Results available in a few seconds.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start audit.');
    } finally {
      setAuditing(false);
    }
  };

  const audit = data?.latest;

  if (loading) return (
    <div className="card p-5 space-y-3">
      <div className="h-4 w-24 bg-dark-700 rounded animate-pulse" />
      <div className="h-20 bg-dark-700 rounded animate-pulse" />
    </div>
  );

  if (!audit) {
    return (
      <div className="card p-5 text-center">
        <Zap size={24} className="text-slate-600 mx-auto mb-2" />
        <p className="text-slate-300 text-sm font-medium mb-1">No SEO Audit Yet</p>
        <p className="text-slate-500 text-xs mb-3">Run an audit to get your SEO score and recommendations.</p>
        <button
          onClick={handleRunAudit}
          disabled={auditing}
          className="btn-primary text-xs w-full flex items-center justify-center gap-1.5"
        >
          <Zap size={12} />
          {auditing ? 'Starting...' : 'Run SEO Audit'}
        </button>
      </div>
    );
  }

  const summary = {
    passed:   (audit.categories || []).reduce((s, c) => s + (c.passedCount || 0), 0),
    warnings: (audit.categories || []).reduce((s, c) => s + (c.warningCount || 0), 0),
    critical: (audit.categories || []).reduce((s, c) => s + (c.criticalCount || 0), 0),
  };

  return (
    <div className="card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
          <Zap size={14} className="text-brand-400" />
          SEO Score
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600">
            {new Date(audit.createdAt).toLocaleDateString()}
          </span>
          <button onClick={load} className="p-1 text-slate-600 hover:text-white rounded transition-colors">
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Score + summary */}
      <div className="flex items-center gap-4">
        <ScoreGauge score={audit.score} size="md" />
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 size={12} /> {summary.passed} passed
          </div>
          <div className="flex items-center gap-1.5 text-xs text-amber-400">
            <AlertTriangle size={12} /> {summary.warnings} warnings
          </div>
          <div className="flex items-center gap-1.5 text-xs text-red-400">
            <XCircle size={12} /> {summary.critical} critical
          </div>
        </div>
      </div>

      {/* Category bars */}
      {(audit.categories || []).length > 0 && (
        <div className="space-y-2.5 pt-1 border-t border-dark-700">
          {audit.categories.map((cat) => (
            <CategoryBar key={cat.name} name={cat.name} score={cat.score} />
          ))}
        </div>
      )}

      {/* History trend */}
      {data?.history?.length > 1 && (
        <div className="flex gap-1 items-end pt-1 border-t border-dark-700">
          {data.history.slice(0, 8).reverse().map((h, i) => (
            <div key={i} title={`${h.score} on ${new Date(h.date).toLocaleDateString()}`}
              className="flex-1 rounded-sm min-w-0 transition-all cursor-default"
              style={{
                height: `${Math.max(4, (h.score / 100) * 28)}px`,
                background: h.score >= 80 ? '#22c55e' : h.score >= 50 ? '#f59e0b' : '#ef4444',
                opacity: i === data.history.slice(0, 8).length - 1 ? 1 : 0.5,
              }}
            />
          ))}
          <span className="text-xs text-slate-600 ml-1 whitespace-nowrap">history</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={handleRunAudit} disabled={auditing}
          className="flex-1 text-xs btn-outline py-1.5 flex items-center justify-center gap-1">
          <Zap size={11} /> {auditing ? 'Starting...' : 'Re-run Audit'}
        </button>
        <Link to={`/audit/${audit._id}`}
          className="flex-1 text-xs btn-secondary py-1.5 flex items-center justify-center gap-1">
          View Report <ArrowRight size={11} />
        </Link>
      </div>
    </div>
  );
}