import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Globe, ChevronDown, RefreshCw, Plus, Check, AlertCircle,
  Loader2, AlertTriangle, WifiOff, ShieldAlert, Zap,
} from 'lucide-react';
import { useWebsite } from '../../context/WebsiteContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import toast from 'react-hot-toast';

// ── Error categorisation ──────────────────────────────────────────────────────

const AUTH_PATTERNS = ['invalid_grant', 'UNAUTHENTICATED', 'unauthorized', 'token', 'credentials'];
const PERM_PATTERNS = ['permission', 'Permission', 'forbidden', 'Forbidden', 'access denied', 'Access denied'];
const QUOTA_PATTERNS = ['quota', 'RESOURCE_EXHAUSTED', 'rateLimitExceeded', 'too many'];
const NOT_FOUND_PATTERNS = ['not found', 'Not Found', 'INVALID_ARGUMENT', 'does not exist'];

const categoriseError = (raw = '') => {
  const s = raw.toLowerCase();
  if (AUTH_PATTERNS.some((p)  => s.includes(p.toLowerCase()))) return 'auth';
  if (PERM_PATTERNS.some((p)  => s.includes(p.toLowerCase()))) return 'permission';
  if (QUOTA_PATTERNS.some((p) => s.includes(p.toLowerCase()))) return 'quota';
  if (NOT_FOUND_PATTERNS.some((p) => s.includes(p.toLowerCase()))) return 'not_found';
  return 'unknown';
};

// Human-readable label stripped of internal prefixes like "Analytics: " / "SearchConsole: "
const friendlyError = (raw = '') => {
  if (!raw) return 'Unknown error';
  const first = raw.split(';')[0].trim().replace(/^(Analytics|SearchConsole|Geo):\s*/i, '');
  return first.length > 60 ? `${first.slice(0, 60)}…` : first;
};

// ── Sync status badge ─────────────────────────────────────────────────────────

function SyncBadge({ website, compact = false }) {
  const { syncStatus, syncError } = website;
  if (syncStatus === 'syncing') {
    return (
      <span className="flex items-center gap-1 text-brand-400 text-xs">
        <Loader2 size={10} className="animate-spin" />
        {!compact && 'syncing…'}
      </span>
    );
  }
  if (syncStatus === 'error') {
    const cat = categoriseError(syncError);
    const Icon = cat === 'auth' ? ShieldAlert : cat === 'quota' ? Zap : cat === 'not_found' ? WifiOff : AlertCircle;
    return (
      <span className="flex items-center gap-1 text-red-400 text-xs">
        <Icon size={10} />
        {!compact && 'sync error'}
      </span>
    );
  }
  if (syncStatus === 'never') {
    return (
      <span className="flex items-center gap-1 text-amber-400 text-xs">
        <AlertTriangle size={10} />
        {!compact && 'not synced'}
      </span>
    );
  }
  return null;
}

// ── Error detail panel (shown below the website row when selected) ─────────────

function ErrorDetail({ website }) {
  const { syncStatus, syncError } = website;
  if (syncStatus !== 'error' || !syncError) return null;

  const cat = categoriseError(syncError);

  return (
    <div className="mx-3 mb-2 p-3 bg-red-500/5 border border-red-500/15 rounded-lg text-xs space-y-2">
      <p className="text-red-300 font-medium leading-snug">{friendlyError(syncError)}</p>

      {cat === 'auth' && (
        <p className="text-slate-400">
          Your Google session expired.{' '}
          <Link to="/settings" className="text-brand-400 underline hover:text-brand-300">
            Reconnect Google →
          </Link>
        </p>
      )}
      {cat === 'permission' && (
        <p className="text-slate-400">
          Insufficient permissions for this property.{' '}
          <Link to="/settings" className="text-brand-400 underline hover:text-brand-300">
            Check Settings →
          </Link>
        </p>
      )}
      {cat === 'quota' && (
        <p className="text-slate-400">API quota exceeded. Sync will retry automatically.</p>
      )}
      {cat === 'not_found' && (
        <p className="text-slate-400">
          Property not found. Re-discover your websites in{' '}
          <Link to="/settings" className="text-brand-400 underline hover:text-brand-300">
            Settings →
          </Link>
        </p>
      )}
      {cat === 'unknown' && (
        <p className="text-slate-500 font-mono text-[10px] break-all leading-relaxed">{syncError}</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WebsiteSwitcher() {
  const { websites, activeWebsite, switchWebsite, triggerSync, refreshWebsites, syncing } = useWebsite();
  const { isAuthenticated, user } = useAuth();
  const [open, setOpen]         = useState(false);
  const [discovering, setDisc]  = useState(false);
  const [expanded, setExpanded] = useState(null); // websiteId with expanded error detail
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
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
      const result = websites.find((w) => w._id === websiteId);
      if (result?.syncStatus === 'error') {
        toast.error('Sync completed with errors — see website details');
      } else {
        toast.success('Sync complete!');
      }
    } catch {
      toast.error('Sync failed — check your Google connection');
    }
  };

  // Are any websites currently in 'syncing' state?
  const anySyncing = websites.some((w) => w.syncStatus === 'syncing');
  const errorCount = websites.filter((w) => w.syncStatus === 'error').length;
  const neverCount = websites.filter((w) => w.syncStatus === 'never').length;

  if (websites.length === 0) {
    return (
      <button
        onClick={handleDiscover}
        disabled={discovering}
        className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 bg-brand-500/10 px-3 py-1.5 rounded-lg transition-all"
      >
        {discovering ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        {discovering ? 'Discovering…' : 'Add Websites'}
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      {/* ── Trigger button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-lg transition-all text-sm max-w-[220px]"
      >
        <Globe size={13} className="text-brand-400 flex-shrink-0" />
        <span className="text-slate-200 font-medium truncate">
          {activeWebsite?.displayName || activeWebsite?.domain || 'Select site'}
        </span>
        {/* Compact badge in trigger */}
        {activeWebsite && <SyncBadge website={activeWebsite} compact />}
        {/* Global issue badge */}
        {!syncing && (errorCount > 0 || neverCount > 0) && (
          <span className="flex-shrink-0 min-w-[16px] h-4 px-1 text-[10px] font-bold bg-red-500/80 text-white rounded-full flex items-center justify-center">
            {errorCount + neverCount}
          </span>
        )}
        {(syncing || anySyncing) && <Loader2 size={11} className="animate-spin text-brand-400 flex-shrink-0" />}
        <ChevronDown
          size={12}
          className={`text-slate-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* ── Dropdown ───────────────────────────────────────────────────────── */}
      {open && (
        <div className="absolute top-full mt-1 left-0 w-80 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
          <div className="px-3 py-2 border-b border-dark-700 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Your Websites</p>
            {(errorCount > 0 || neverCount > 0) && (
              <span className="text-xs text-amber-400">
                {errorCount + neverCount} need{errorCount + neverCount === 1 ? 's' : ''} attention
              </span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {websites.map((w) => (
              <div key={w._id}>
                {/* ── Website row ──────────────────────────────────────── */}
                <button
                  onClick={() => { switchWebsite(w); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-dark-700 transition-colors text-left"
                >
                  <Globe size={13} className="text-slate-500 flex-shrink-0" />

                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-200 font-medium truncate">
                      {w.displayName || w.domain}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-500">
                        {w.gsc?.siteUrl ? '✓ GSC' : '— GSC'} · {w.ga4?.propertyId ? '✓ GA4' : '— GA4'}
                      </span>
                      <SyncBadge website={w} />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {activeWebsite?._id === w._id && (
                      <Check size={13} className="text-brand-400" />
                    )}
                    {/* Expand/collapse error detail */}
                    {w.syncStatus === 'error' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpanded(expanded === w._id ? null : w._id);
                        }}
                        className="p-1 text-red-400/60 hover:text-red-400 rounded transition-colors"
                        title="Show error details"
                      >
                        <AlertCircle size={11} />
                      </button>
                    )}
                    {/* Manual sync button */}
                    <button
                      onClick={(e) => handleSync(e, w._id)}
                      disabled={w.syncStatus === 'syncing' || syncing}
                      className="p-1 text-slate-600 hover:text-brand-400 rounded transition-colors disabled:opacity-40"
                      title={w.syncStatus === 'error' ? 'Retry sync' : 'Sync now'}
                    >
                      <RefreshCw
                        size={11}
                        className={w.syncStatus === 'syncing' ? 'animate-spin text-brand-400' : ''}
                      />
                    </button>
                  </div>
                </button>

                {/* ── Error detail panel ───────────────────────────────── */}
                {expanded === w._id && <ErrorDetail website={w} />}
              </div>
            ))}
          </div>

          {/* ── Footer actions ─────────────────────────────────────────── */}
          <div className="border-t border-dark-700 p-2 space-y-1">
            <button
              onClick={handleDiscover}
              disabled={discovering}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-dark-700 transition-all"
            >
              {discovering
                ? <><Loader2 size={12} className="animate-spin" /> Discovering…</>
                : <><RefreshCw size={12} /> Sync Google Properties</>}
            </button>
            {/* Quick link to Settings when there are auth errors */}
            {websites.some((w) => w.syncStatus === 'error' && categoriseError(w.syncError) === 'auth') && (
              <Link
                to="/settings"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-all"
              >
                <ShieldAlert size={12} /> Reconnect Google Account
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}