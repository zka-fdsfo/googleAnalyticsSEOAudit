import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import api from '../services/api';

const WebsiteContext = createContext(null);
const STORAGE_KEY = 'selectedWebsiteId';

// ── Centralised date helpers ──────────────────────────────────────────────────
//
// RULE: All dates are in the user's LOCAL timezone so they match what Google
// Analytics / Search Console show (both APIs interpret YYYY-MM-DD as local time
// for the property's reporting timezone, which should match the user's locale).
// Using new Date().toISOString() would give UTC and produce wrong boundaries for
// any user not in UTC (e.g. UTC+5:30 at 23:30 returns tomorrow's UTC date).
//
// RULE: Predefined ranges (7D/30D/90D/12M) use COMPLETED days only.
// endDate = yesterday   — today is excluded because it is a partial day
// startDate = today - n — gives exactly n completed days inclusive
//
// Example — if today is 2026-06-23:
//   7D  → [2026-06-16, 2026-06-22]  (7 full days, yesterday as last)
//   30D → [2026-05-24, 2026-06-22]
//   90D → [2026-03-25, 2026-06-22]
//   12M → [2025-06-23, 2026-06-22]

// Format a Date object as YYYY-MM-DD in LOCAL time
const localFmt = (d) => {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${dy}`;
};

// Today in local time
export const localToday = () => localFmt(new Date());

// Yesterday in local time (endDate for all preset ranges)
const localYesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localFmt(d);
};

// n days before today in local time
// n=7  → today-7  (which, paired with yesterday=today-1, gives exactly 7 days inclusive)
const localSubDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localFmt(d);
};

// dateRange shape: { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', label: string }
export const buildPresetRange = (label) => {
  if (label === 'Today') {
    const t = localToday();
    return { startDate: t, endDate: t, label: 'Today' };
  }
  const end = localYesterday(); // always yesterday — never today
  const starts = {
    '7D':  localSubDays(7),   // [today-7, yesterday] = 7 complete days
    '30D': localSubDays(30),
    '90D': localSubDays(90),
    '12M': localSubDays(365), // 365 complete days ≈ 12 months
  };
  return { startDate: starts[label] ?? starts['30D'], endDate: end, label };
};

const DEFAULT_RANGE = buildPresetRange('30D');

// Websites that have been auto-synced in this session (prevent duplicate triggers)
const autoSynced = new Set();

export const WebsiteProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [websites, setWebsites]           = useState([]);
  const [activeWebsite, setActiveWebsite] = useState(null);
  const [loading, setLoading]             = useState(false);
  const [syncing, setSyncing]             = useState(false);
  const [dateRange, setDateRange]         = useState(DEFAULT_RANGE);
  const websitesRef                       = useRef([]);

  // Keep ref in sync so polling callbacks can read latest list
  useEffect(() => { websitesRef.current = websites; }, [websites]);

  const loadWebsites = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const { data } = await api.get('/websites');
      const list = data.websites || [];
      setWebsites(list);
      websitesRef.current = list;

      // Restore previously selected website, else default to first
      const savedId = localStorage.getItem(STORAGE_KEY);
      const saved = list.find((w) => w._id === savedId);
      const def   = list.find((w) => w.isDefault) || list[0];
      const active = saved || def || null;
      setActiveWebsite(active);
      if (active) localStorage.setItem(STORAGE_KEY, active._id);

      // Auto-trigger first sync for any website that has never been synced
      // and has at least one Google property configured.
      const neverSynced = list.filter(
        (w) =>
          w.syncStatus === 'never' &&
          (w.gsc?.siteUrl || w.ga4?.propertyId) &&
          !autoSynced.has(w._id.toString()),
      );
      for (const w of neverSynced) {
        autoSynced.add(w._id.toString());
        api.post(`/websites/${w._id}/sync`).catch(() => {});
      }
    } catch {
      // not critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { loadWebsites(); }, [loadWebsites]);

  const switchWebsite = (website) => {
    setActiveWebsite(website);
    localStorage.setItem(STORAGE_KEY, website._id);
  };

  /**
   * Triggers a manual sync, then polls the lightweight /sync/status endpoint
   * every 3 s until the status leaves 'syncing' (max 120 s).
   * Only fetches the full website list once at the end to update all UI state.
   */
  const triggerSync = async (websiteId) => {
    setSyncing(true);
    try {
      await api.post(`/websites/${websiteId}/sync`);

      // Prevent the auto-sync logic from re-firing for this website
      autoSynced.add(websiteId.toString());

      // Optimistically mark as syncing in local state immediately
      setWebsites((prev) =>
        prev.map((w) => (w._id === websiteId ? { ...w, syncStatus: 'syncing' } : w)),
      );

      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));

        // Lightweight poll — only fetches one document's status fields
        const { data: status } = await api.get(`/websites/${websiteId}/sync/status`);

        if (status.syncStatus !== 'syncing') {
          // Sync finished — do a single full reload to get the final state
          const { data } = await api.get('/websites');
          const list = data.websites || [];
          setWebsites(list);
          websitesRef.current = list;
          setActiveWebsite((prev) =>
            prev ? list.find((w) => w._id === prev._id) || prev : prev,
          );
          break;
        }
      }
    } finally {
      setSyncing(false);
    }
  };

  const refreshWebsites = loadWebsites;

  return (
    <WebsiteContext.Provider value={{
      websites,
      activeWebsite,
      loading,
      syncing,
      switchWebsite,
      triggerSync,
      refreshWebsites,
      dateRange,
      setDateRange,
    }}>
      {children}
    </WebsiteContext.Provider>
  );
};

export const useWebsite = () => {
  const ctx = useContext(WebsiteContext);
  if (!ctx) throw new Error('useWebsite must be used within WebsiteProvider');
  return ctx;
};