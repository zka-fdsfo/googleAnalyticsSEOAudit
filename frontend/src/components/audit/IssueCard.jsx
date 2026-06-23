import { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Info,
} from 'lucide-react';

const statusConfig = {
  passed: {
    icon: <CheckCircle2 size={16} className="text-emerald-400" />,
    badge: 'badge-passed',
    label: 'Passed',
    bg: 'hover:bg-emerald-500/5 border-emerald-500/10',
  },
  warning: {
    icon: <AlertTriangle size={16} className="text-amber-400" />,
    badge: 'badge-warning',
    label: 'Warning',
    bg: 'hover:bg-amber-500/5 border-amber-500/10',
  },
  critical: {
    icon: <XCircle size={16} className="text-red-400" />,
    badge: 'badge-critical',
    label: 'Critical',
    bg: 'hover:bg-red-500/5 border-red-500/10',
  },
};

export default function IssueCard({ issue }) {
  const [expanded, setExpanded] = useState(issue.status === 'critical');
  const config = statusConfig[issue.status] || statusConfig.warning;

  return (
    <div
      className={`border rounded-lg transition-all duration-200 ${config.bg} cursor-pointer`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex-shrink-0">{config.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-medium text-slate-200 leading-snug">{issue.title}</h4>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={config.badge}>{config.label}</span>
              <span className="text-slate-500">
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{issue.description}</p>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 ml-7 space-y-3 animate-fade-in">
          {issue.recommendation && (
            <div className="flex gap-2 p-3 bg-brand-500/10 border border-brand-500/20 rounded-lg">
              <Lightbulb size={14} className="text-brand-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-300 leading-relaxed">{issue.recommendation}</p>
            </div>
          )}

          {issue.details && <DetailsRenderer details={issue.details} />}
        </div>
      )}
    </div>
  );
}

function DetailsRenderer({ details }) {
  if (!details || typeof details !== 'object') return null;

  const renderValue = (val) => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'number') return val.toLocaleString();
    if (Array.isArray(val)) {
      if (val.length === 0) return 'None';
      return (
        <ul className="space-y-0.5 mt-1">
          {val.slice(0, 5).map((item, i) => (
            <li key={i} className="text-slate-400 font-mono text-xs truncate max-w-xs">
              {typeof item === 'object' ? JSON.stringify(item) : String(item)}
            </li>
          ))}
          {val.length > 5 && <li className="text-slate-500 text-xs">+{val.length - 5} more</li>}
        </ul>
      );
    }
    if (typeof val === 'object') return null;
    return String(val);
  };

  const entries = Object.entries(details).filter(([k]) =>
    !['examples', 'structuredData'].includes(k)
  );

  if (entries.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {entries.map(([key, val]) => {
        const rendered = renderValue(val);
        if (rendered === null) return null;
        return (
          <div key={key} className="bg-dark-700/50 rounded-md px-3 py-2">
            <div className="text-xs text-slate-500 capitalize mb-0.5">
              {key.replace(/([A-Z])/g, ' $1').trim()}
            </div>
            <div className="text-xs text-slate-300 font-medium">{rendered}</div>
          </div>
        );
      })}
    </div>
  );
}
