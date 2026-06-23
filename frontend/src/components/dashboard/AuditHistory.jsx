import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { History, ExternalLink, Trash2, ChevronRight, AlertCircle } from 'lucide-react';
import { getAuditHistory, deleteAudit } from '../../services/api';
import { PageLoader } from '../common/Loader';
import toast from 'react-hot-toast';

const ScoreBadge = ({ score }) => {
  const color = score >= 80 ? 'text-emerald-400 bg-emerald-500/10' : score >= 60 ? 'text-amber-400 bg-amber-500/10' : 'text-red-400 bg-red-500/10';
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${color}`}>
      {score}
    </span>
  );
};

export default function AuditHistory({ days = 30 }) {
  const [deleting, setDeleting] = useState(null);
  const queryClient = useQueryClient();

  const { data: resp, isLoading: loading, error: qError } = useQuery({
    queryKey: ['audit-history'],
    queryFn:  () => getAuditHistory(),
    staleTime: 2 * 60 * 1000,
  });

  const allAudits = resp?.data?.audits || [];
  const error = qError ? 'Failed to load audit history.' : null;

  // Filter audits to those created within the selected period.
  const audits = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return allAudits.filter((a) => new Date(a.createdAt) >= cutoff);
  }, [allAudits, days]);

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await deleteAudit(id);
      queryClient.invalidateQueries({ queryKey: ['audit-history'] });
      toast.success('Audit deleted.');
    } catch {
      toast.error('Failed to delete audit.');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <PageLoader text="Loading history..." />;
  if (error) return (
    <div className="card p-6 text-center">
      <AlertCircle size={24} className="text-red-400 mx-auto mb-2" />
      <p className="text-sm text-red-400">{error}</p>
    </div>
  );

  if (audits.length === 0) {
    return (
      <div className="card p-10 text-center">
        <History size={32} className="text-slate-600 mx-auto mb-3" />
        <h3 className="font-medium text-slate-300 mb-2">No audits yet</h3>
        <p className="text-slate-500 text-sm mb-4">Run your first SEO audit to see results here.</p>
        <Link to="/" className="btn-primary text-sm inline-block">Analyze a Website</Link>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {audits.map((audit) => (
        <div key={audit._id} className="card p-4 flex items-center gap-4 hover:border-dark-600 transition-all">
          <div className="flex-shrink-0">
            <ScoreBadge score={audit.score} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <a
                href={audit.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-slate-200 hover:text-brand-400 transition-colors truncate flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {audit.domain || new URL(audit.url).hostname}
                <ExternalLink size={11} className="flex-shrink-0" />
              </a>
              {audit.status === 'processing' && (
                <span className="text-xs text-brand-400 animate-pulse">Analyzing...</span>
              )}
              {audit.status === 'failed' && (
                <span className="text-xs text-red-400">Failed</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {new Date(audit.createdAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
            </p>
          </div>

          {/* Category scores */}
          <div className="hidden sm:flex items-center gap-2">
            {(audit.categories || []).map((cat) => (
              <div key={cat.name} className="text-center" title={cat.name}>
                <div className={`text-xs font-bold ${cat.score >= 80 ? 'text-emerald-400' : cat.score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {cat.score}
                </div>
                <div className="text-[10px] text-slate-600 max-w-[50px] truncate">{cat.name.split(' ')[0]}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {audit.status === 'completed' && (
              <Link
                to={`/audit/${audit._id}`}
                className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-medium px-2.5 py-1.5 rounded-lg hover:bg-brand-500/10 transition-all"
              >
                View <ChevronRight size={13} />
              </Link>
            )}
            <button
              onClick={() => handleDelete(audit._id)}
              disabled={deleting === audit._id}
              className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
