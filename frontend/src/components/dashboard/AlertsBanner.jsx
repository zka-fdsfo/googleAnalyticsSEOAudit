import { useState, useEffect } from 'react';
import { AlertTriangle, X, Bell, ChevronDown, ChevronUp, TrendingDown } from 'lucide-react';
import { getAlerts, markAlertsRead, dismissAlert } from '../../services/api';

const SEVERITY_CONFIG = {
  critical: { bg: 'bg-red-500/10 border-red-500/30',    icon: 'text-red-400',    badge: 'bg-red-500/20 text-red-400' },
  warning:  { bg: 'bg-amber-500/10 border-amber-500/30', icon: 'text-amber-400',  badge: 'bg-amber-500/20 text-amber-400' },
  info:     { bg: 'bg-blue-500/10 border-blue-500/30',   icon: 'text-blue-400',   badge: 'bg-blue-500/20 text-blue-400' },
};

export default function AlertsBanner({ websiteId }) {
  const [alerts, setAlerts]     = useState([]);
  const [unread, setUnread]     = useState(0);
  const [expanded, setExpanded] = useState(false);

  const load = async () => {
    if (!websiteId) return;
    try {
      const { data } = await getAlerts(websiteId, { limit: 10 });
      setAlerts(data.items || []);
      setUnread(data.unreadCount || 0);
    } catch { /* non-critical */ }
  };

  useEffect(() => { load(); }, [websiteId]);

  const handleDismiss = async (e, alertId) => {
    e.stopPropagation();
    try {
      await dismissAlert(websiteId, alertId);
      setAlerts((prev) => prev.filter((a) => a._id !== alertId));
      setUnread((n) => Math.max(0, n - 1));
    } catch { /* */ }
  };

  const handleExpand = async () => {
    if (!expanded && unread > 0) {
      const ids = alerts.filter((a) => !a.isRead).map((a) => a._id);
      if (ids.length) {
        await markAlertsRead(websiteId, ids).catch(() => {});
        setUnread(0);
      }
    }
    setExpanded(!expanded);
  };

  if (!alerts.length) return null;

  const topSeverity = alerts.find((a) => a.severity === 'critical') ? 'critical'
    : alerts.find((a) => a.severity === 'warning') ? 'warning' : 'info';
  const cfg = SEVERITY_CONFIG[topSeverity];

  return (
    <div className={`border rounded-xl mb-5 overflow-hidden transition-all ${cfg.bg}`}>
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
        onClick={handleExpand}
      >
        <AlertTriangle size={15} className={cfg.icon} />
        <span className={`text-sm font-semibold ${cfg.icon}`}>
          {alerts.length} alert{alerts.length !== 1 ? 's' : ''} detected
        </span>
        {unread > 0 && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
            {unread} new
          </span>
        )}
        <span className="ml-auto text-slate-500">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {/* Alert list */}
      {expanded && (
        <div className="border-t border-white/10 divide-y divide-white/5">
          {alerts.map((alert) => (
            <div key={alert._id} className="flex items-start gap-3 px-4 py-3">
              <TrendingDown size={13} className={`${SEVERITY_CONFIG[alert.severity]?.icon} mt-0.5 flex-shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-200">{alert.title}</div>
                {alert.message && (
                  <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{alert.message}</div>
                )}
                <div className="text-xs text-slate-600 mt-1">
                  {new Date(alert.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <button
                onClick={(e) => handleDismiss(e, alert._id)}
                className="text-slate-600 hover:text-slate-300 p-1 rounded flex-shrink-0"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
