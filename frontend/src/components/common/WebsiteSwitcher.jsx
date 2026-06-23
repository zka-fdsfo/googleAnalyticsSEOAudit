import { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, RefreshCw, Plus, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useWebsite } from '../../context/WebsiteContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function WebsiteSwitcher() {
  const { websites, activeWebsite, switchWebsite, triggerSync, refreshWebsites, syncing } = useWebsite();
  const { isAuthenticated, user } = useAuth();
  const [open, setOpen]         = useState(false);
  const [discovering, setDisc]  = useState(false);
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!isAuthenticated || !user?.isGoogleConnected) return null;

  const handleDiscover = async () => {
    setDisc(true);
    setOpen(false);
    try {
      const { data } = await api.post('/websites/discover');
      await refreshWebsites();
      toast.success(`Found ${data.total} website${data.total !== 1 ? 's' : ''}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Discovery failed');
    } finally {
      setDisc(false);
    }
  };

  const handleSync = async (e, websiteId) => {
    e.stopPropagation();
    setOpen(false);
    try {
      await triggerSync(websiteId);
      toast.success('Sync started');
    } catch {
      toast.error('Sync failed');
    }
  };

  const syncStatusIcon = (w) => {
    if (w.syncStatus === 'syncing') return <Loader2 size={11} className="animate-spin text-brand-400" />;
    if (w.syncStatus === 'error')   return <AlertCircle size={11} className="text-red-400" />;
    if (w.syncStatus === 'never')   return <AlertCircle size={11} className="text-amber-400" />;
    return null;
  };

  if (websites.length === 0) {
    return (
      <button
        onClick={handleDiscover}
        disabled={discovering}
        className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 bg-brand-500/10 px-3 py-1.5 rounded-lg transition-all"
      >
        {discovering ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        {discovering ? 'Discovering...' : 'Add Websites'}
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-lg transition-all text-sm max-w-[200px]"
      >
        <Globe size={13} className="text-brand-400 flex-shrink-0" />
        <span className="text-slate-200 font-medium truncate">
          {activeWebsite?.displayName || activeWebsite?.domain || 'Select site'}
        </span>
        {syncStatusIcon(activeWebsite || {})}
        <ChevronDown size={12} className={`text-slate-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 w-72 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
          <div className="px-3 py-2 border-b border-dark-700">
            <p className="text-xs text-slate-500 font-medium">YOUR WEBSITES</p>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {websites.map((w) => (
              <button
                key={w._id}
                onClick={() => { switchWebsite(w); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-dark-700 transition-colors text-left"
              >
                <Globe size={13} className="text-slate-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 font-medium truncate">
                    {w.displayName || w.domain}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    {w.gsc?.siteUrl ? '✓ GSC' : '— GSC'}
                    {' · '}
                    {w.ga4?.propertyId ? '✓ GA4' : '— GA4'}
                    {w.syncStatus === 'error' && <span className="text-red-400">sync error</span>}
                    {w.syncStatus === 'never' && <span className="text-amber-400">not synced</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {syncStatusIcon(w)}
                  {activeWebsite?._id === w._id && <Check size={13} className="text-brand-400" />}
                  <button
                    onClick={(e) => handleSync(e, w._id)}
                    className="p-1 text-slate-600 hover:text-brand-400 rounded transition-colors"
                    title="Sync now"
                  >
                    <RefreshCw size={11} />
                  </button>
                </div>
              </button>
            ))}
          </div>

          <div className="border-t border-dark-700 p-2">
            <button
              onClick={handleDiscover}
              disabled={discovering}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-dark-700 transition-all"
            >
              {discovering
                ? <><Loader2 size={12} className="animate-spin" /> Discovering...</>
                : <><RefreshCw size={12} /> Sync Google Properties</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
