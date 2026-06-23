import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../services/api';

const WebsiteContext = createContext(null);
const STORAGE_KEY = 'selectedWebsiteId';

// dateRange shape: { days: number, label: string, startDate: string|null, endDate: string|null }
const DEFAULT_RANGE = { days: 30, label: '30D', startDate: null, endDate: null };

export const WebsiteProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [websites, setWebsites]           = useState([]);
  const [activeWebsite, setActiveWebsite] = useState(null);
  const [loading, setLoading]             = useState(false);
  const [syncing, setSyncing]             = useState(false);
  const [dateRange, setDateRange]         = useState(DEFAULT_RANGE);

  const loadWebsites = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const { data } = await api.get('/websites');
      setWebsites(data.websites || []);

      // Restore previously selected website, else default to first
      const savedId = localStorage.getItem(STORAGE_KEY);
      const saved = (data.websites || []).find((w) => w._id === savedId);
      const def   = (data.websites || []).find((w) => w.isDefault) || data.websites?.[0];
      const active = saved || def || null;
      setActiveWebsite(active);
      if (active) localStorage.setItem(STORAGE_KEY, active._id);
    } catch {
      // not critical — user may not have any websites yet
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadWebsites();
  }, [loadWebsites]);

  // Switch the active website and persist the choice
  const switchWebsite = (website) => {
    setActiveWebsite(website);
    localStorage.setItem(STORAGE_KEY, website._id);
  };

  // Trigger a manual sync for the active website
  const triggerSync = async (websiteId) => {
    setSyncing(true);
    try {
      await api.post(`/websites/${websiteId}/sync`);
      // Reload websites to get updated syncStatus
      await loadWebsites();
    } finally {
      setSyncing(false);
    }
  };

  // After Google OAuth discover — reload websites automatically
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
