import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Settings as SettingsIcon, Link2, Unlink, BarChart2, Search, ChevronDown,
  CheckCircle2, AlertCircle, Loader2, Bug,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getGA4Properties, getGSCSites, updateGoogleSettings, disconnectGoogle } from '../services/api';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [ga4Props, setGA4Props] = useState([]);
  const [gscSites, setGSCSites] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(user?.google?.analytics?.propertyId || '');
  const [selectedSite, setSelectedSite] = useState(user?.google?.searchConsole?.siteUrl || '');
  const [loadingProps, setLoadingProps] = useState(false);
  const [loadingSites, setLoadingSites] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [propsError, setPropsError] = useState(null);
  const [sitesError, setSitesError] = useState(null);

  useEffect(() => {
    if (user?.isGoogleConnected) {
      loadGA4Properties();
      loadGSCSites();
    }
  }, [user?.isGoogleConnected]);

  const loadGA4Properties = async () => {
    setLoadingProps(true);
    setPropsError(null);
    try {
      const { data } = await getGA4Properties();
      setGA4Props(data.properties || []);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to load GA4 properties.';
      setPropsError(msg);
    } finally {
      setLoadingProps(false);
    }
  };

  const loadGSCSites = async () => {
    setLoadingSites(true);
    setSitesError(null);
    try {
      const { data } = await getGSCSites();
      setGSCSites(data.sites || []);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to load Search Console sites.';
      setSitesError(msg);
    } finally {
      setLoadingSites(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const selectedPropObj = ga4Props.find((p) => p.id === selectedProperty);
      await updateGoogleSettings({
        analyticsPropertyId: selectedProperty,
        analyticsPropertyName: selectedPropObj?.name || '',
        searchConsoleSiteUrl: selectedSite,
      });
      await refreshUser();
      toast.success('Settings saved successfully!');
    } catch {
      toast.error('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your Google account? You will lose access to Analytics and Search Console data.')) return;
    setDisconnecting(true);
    try {
      await disconnectGoogle();
      await refreshUser();
      toast.success('Google account disconnected.');
    } catch {
      toast.error('Failed to disconnect.');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <SettingsIcon size={22} className="text-brand-400" />
          Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">Manage your account and integrations</p>
      </div>

      {/* Profile */}
      <div className="card p-6 mb-5">
        <h2 className="text-base font-semibold text-slate-100 mb-5">Account</h2>
        <div className="flex items-center gap-4">
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-14 h-14 rounded-full" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-brand-500/20 border-2 border-brand-500/30 flex items-center justify-center text-xl font-bold text-brand-400">
              {user?.name?.[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-semibold text-white text-lg">{user?.name}</div>
            <div className="text-slate-400 text-sm">{user?.email}</div>
            <div className="text-slate-500 text-xs mt-1">{user?.auditCount || 0} audits completed</div>
          </div>
        </div>
      </div>

      {/* Google Connection */}
      <div className="card p-6 mb-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-100">Google Integration</h2>
          {user?.isGoogleConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-1 rounded-full">
              <CheckCircle2 size={12} /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-dark-700 px-2.5 py-1 rounded-full">
              Not connected
            </span>
          )}
        </div>

        {!user?.isGoogleConnected ? (
          <div className="text-center py-4">
            <BarChart2 size={32} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm mb-4">
              Connect your Google account to access Google Analytics 4 and Search Console data directly in your dashboard.
            </p>
            <a
              href="/api/auth/google"
              className="inline-flex items-center justify-center gap-3 px-6 py-3 bg-white text-slate-800 rounded-xl font-semibold text-sm hover:bg-slate-100 transition-all"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Connect Google Account
            </a>
            <p className="text-xs text-slate-600 mt-3">
              We request read-only access to Analytics and Search Console
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Connected info */}
            <div className="flex items-center gap-3 p-3 bg-dark-700 rounded-lg text-sm">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <div>
                <div className="text-slate-200 font-medium">{user.google?.email}</div>
                <div className="text-slate-500 text-xs">
                  Connected {user.google?.connectedAt ? new Date(user.google.connectedAt).toLocaleDateString() : ''}
                </div>
              </div>
            </div>

            {/* GA4 Property */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Google Analytics 4 Property
              </label>
              {loadingProps ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
                  <Loader2 size={14} className="animate-spin" /> Loading properties...
                </div>
              ) : propsError ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm text-red-400 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium">Failed to load properties</div>
                      <div className="text-xs mt-0.5 text-red-300/80">{propsError}</div>
                    </div>
                  </div>
                  <button onClick={loadGA4Properties} className="text-xs text-brand-400 hover:text-brand-300">
                    Retry
                  </button>
                </div>
              ) : ga4Props.length > 0 ? (
                <div className="relative">
                  <select
                    value={selectedProperty}
                    onChange={(e) => setSelectedProperty(e.target.value)}
                    className="input-field appearance-none pr-10"
                  >
                    <option value="">Select a GA4 property...</option>
                    {ga4Props.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.accountName ? `${p.accountName} › ` : ''}{p.name} (ID: {p.id})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-400 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <AlertCircle size={14} />
                  No GA4 properties found. Make sure the Google Analytics Admin API is enabled and you have property access.
                </div>
              )}
              {user?.google?.analytics?.propertyId && (
                <p className="text-xs text-slate-500 mt-1.5">
                  Current: {user.google.analytics.propertyName || user.google.analytics.propertyId}
                </p>
              )}
            </div>

            {/* Search Console Site */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Search Console Property
              </label>
              {loadingSites ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
                  <Loader2 size={14} className="animate-spin" /> Loading sites...
                </div>
              ) : sitesError ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm text-red-400 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium">Failed to load sites</div>
                      <div className="text-xs mt-0.5 text-red-300/80">{sitesError}</div>
                    </div>
                  </div>
                  <button onClick={loadGSCSites} className="text-xs text-brand-400 hover:text-brand-300">
                    Retry
                  </button>
                </div>
              ) : gscSites.length > 0 ? (
                <div className="relative">
                  <select
                    value={selectedSite}
                    onChange={(e) => setSelectedSite(e.target.value)}
                    className="input-field appearance-none pr-10"
                  >
                    <option value="">Select a site...</option>
                    {gscSites.map((s) => (
                      <option key={s.siteUrl} value={s.siteUrl}>
                        {s.siteUrl} ({s.permissionLevel})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-400 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <AlertCircle size={14} />
                  No verified sites found. Add and verify your site at search.google.com/search-console first.
                </div>
              )}
              {user?.google?.searchConsole?.siteUrl && (
                <p className="text-xs text-slate-500 mt-1.5">
                  Current: {user.google.searchConsole.siteUrl}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 px-3 py-2 rounded-lg transition-all"
              >
                <Unlink size={14} />
                {disconnecting ? 'Disconnecting...' : 'Disconnect Google'}
              </button>

              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="btn-primary text-sm flex items-center gap-1.5"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Save Settings
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Debug link */}
      {user?.isGoogleConnected && (
        <div className="card p-4 mb-5 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-300">Google API Diagnostics</div>
            <div className="text-xs text-slate-500 mt-0.5">Verify token, scopes, and API connectivity</div>
          </div>
          <Link
            to="/settings/google-debug"
            className="flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300 font-medium"
          >
            <Bug size={14} /> Run Debug
          </Link>
        </div>
      )}

      {/* API Info */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-slate-100 mb-4">API Configuration</h2>
        <div className="space-y-3 text-sm">
          {[
            { label: 'Google PageSpeed API', tip: 'Enables Core Web Vitals data in audit reports' },
            { label: 'Google OAuth', tip: 'Required for Analytics & Search Console integration' },
          ].map(({ label, tip }) => (
            <div key={label} className="flex items-start justify-between gap-4 py-2 border-b border-dark-700 last:border-0">
              <div>
                <div className="text-slate-300 font-medium">{label}</div>
                <div className="text-slate-500 text-xs mt-0.5">{tip}</div>
              </div>
              <span className="text-xs text-slate-500 flex-shrink-0">Set in .env</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
