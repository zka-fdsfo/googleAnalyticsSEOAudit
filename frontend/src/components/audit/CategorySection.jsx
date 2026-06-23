import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import IssueCard from './IssueCard';

const categoryIcons = {
  'On-Page SEO': '📄',
  'Technical SEO': '⚙️',
  'Content Quality': '✍️',
  'Social & Open Graph': '🔗',
};

export default function CategorySection({ category, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen || category.criticalCount > 0);

  const scoreColor =
    category.score >= 80
      ? 'text-emerald-400'
      : category.score >= 50
      ? 'text-amber-400'
      : 'text-red-400';

  const sortedIssues = [...(category.issues || [])].sort((a, b) => {
    const order = { critical: 0, warning: 1, passed: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  return (
    <div className="card overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-5 hover:bg-dark-700/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{categoryIcons[category.name] || '📊'}</span>
          <div className="text-left">
            <h3 className="font-semibold text-slate-100">{category.name}</h3>
            <div className="flex items-center gap-3 mt-1">
              {category.criticalCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-red-400">
                  <XCircle size={11} /> {category.criticalCount} critical
                </span>
              )}
              {category.warningCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <AlertTriangle size={11} /> {category.warningCount} warnings
                </span>
              )}
              {category.passedCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 size={11} /> {category.passedCount} passed
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Score ring */}
          <div className="relative w-12 h-12 flex-shrink-0">
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="#334155" strokeWidth="4" />
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke={category.score >= 80 ? '#22c55e' : category.score >= 50 ? '#f59e0b' : '#ef4444'}
                strokeWidth="4"
                strokeDasharray={`${(category.score / 100) * 125.66} 125.66`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-xs font-bold ${scoreColor}`}>{category.score}</span>
            </div>
          </div>
          <span className="text-slate-500">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-dark-700 p-5 space-y-2.5 animate-fade-in">
          {sortedIssues.map((issue) => (
            <IssueCard key={issue.checkId} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );
}
