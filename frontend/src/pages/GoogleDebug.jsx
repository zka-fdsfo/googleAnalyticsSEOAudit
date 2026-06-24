import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Shield, BarChart2, Search, Key, Clock, Globe,
} from 'lucide-react';
import { getGoogleDebug } from '../services/api';

const STATUS_REQUIRED_SCOPES = [
  import.meta.env.VITE_GA4_SCOPE,
  import.meta.env.VITE_GSC_SCOPE,
  'email',
  'profile',
];

const OK   = ({ label }) => <span className="flex items-center gap-1.5 text-emerald-400"><CheckCircle2 size={14} />{label}</span>;
const FAIL = ({ label }) => <span className="flex items-center gap-1.5 text-red-400"><XCircle size={14} />{label}</span>;
const WARN = ({ label }) => <span className="flex items-center gap-1.5 text-amber-400"><AlertTriangle size={14} />{label}</span>;

const Row = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 py-2.5 border-b border-dark-700 last:border-0">
    <span className="text-slate-400 text-sm">{label}</span>
    <div className="text-sm font-medium text-right">{children}</div>
  </div>
);

export default function GoogleDebug() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getGoogleDebug();
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { run(); }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <Link to="/settings" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
          <ArrowLeft size={14} /> Back to Settings
        </Link>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300 disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Running...' : 'Re-run'}
        </button>
      </div>

      <h1 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
        <Shield size={18} className="text-brand-400" />
        Google API Diagnostics
      </h1>
      <p className="text-slate-400 text-sm mb-6">
        Verifies your OAuth tokens, granted scopes, and API connectivity.
      </p>

      {error && (
        <div className="card p-4 mb-4 border-red-500/30 bg-red-500/5 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="card p-8 text-center text-slate-400 text-sm">
          Running diagnostics…
        </div>
      )}

      {data && (
        <div className="space-y-4">

          {/* ── Connection ─────────────────────────────────────────────── */}
          <Section title="OAuth Connection" icon={<Key size={15} />}>
            <Row label="Google connected">
              {data.connected ? <OK label="Yes" /> : <FAIL label="No" />}
            </Row>
            <Row label="Access token">
              {data.hasAccessToken ? <OK label="Present" /> : <FAIL label="Missing" />}
            </Row>
            <Row label="Refresh token">
              {data.hasRefreshToken ? <OK label="Present" /> : <FAIL label="Missing — reconnect Google account" />}
            </Row>
            <Row label="Token status">
              {data.tokenExpired === true
                ? <FAIL label="Expired" />
                : data.tokenExpired === false
                ? <OK label="Valid (not expired)" />
                : <WARN label="Unknown" />}
            </Row>
            {data.tokenExpiresAt && (
              <Row label="Expires at">
                <span className="text-slate-300">{new Date(data.tokenExpiresAt).toLocaleString()}</span>
              </Row>
            )}
            {data.googleEmail && (
              <Row label="Google account">
                <span className="text-slate-300">{data.googleEmail}</span>
              </Row>
            )}
          </Section>

          {/* ── Token info / scopes ────────────────────────────────────── */}
          <Section title="Token Verification & Scopes" icon={<Globe size={15} />}>
            {data.tokenInfo ? (
              <>
                <Row label="Token valid">
                  {data.tokenInfo.valid ? <OK label="Yes" /> : <FAIL label="No — {data.tokenInfo.error}" />}
                </Row>
                {data.tokenInfo.refreshed && (
                  <Row label="Auto-refreshed"><WARN label="Yes (token was expired, refreshed successfully)" /></Row>
                )}
                {data.tokenInfo.expiresIn != null && (
                  <Row label="Expires in">
                    <span className={`font-mono ${data.tokenInfo.expiresIn < 300 ? 'text-amber-400' : 'text-slate-300'}`}>
                      {data.tokenInfo.expiresIn > 0 ? `${Math.round(data.tokenInfo.expiresIn / 60)}m` : 'Expired'}
                    </span>
                  </Row>
                )}
                <div className="pt-2">
                  <div className="text-xs text-slate-500 mb-2">Granted scopes</div>
                  <div className="space-y-1.5">
                    {STATUS_REQUIRED_SCOPES.map((scope) => {
                      const granted = data.tokenInfo.scopes?.some((s) => s === scope || scope.includes(s));
                      const short   = scope?.replace(import.meta.env.VITE_GOOGLEAPIS_AUTH_PREFIX ?? 'https://www.googleapis.com/auth/', '') ?? scope;
                      return (
                        <div key={scope} className="flex items-center gap-2 text-xs font-mono">
                          {granted
                            ? <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
                            : <XCircle     size={12} className="text-red-400 flex-shrink-0" />}
                          <span className={granted ? 'text-slate-300' : 'text-red-400'}>{short}</span>
                        </div>
                      );
                    })}
                    {(data.tokenInfo.scopes || [])
                      .filter((s) => !STATUS_REQUIRED_SCOPES.some((r) => r === s || r.includes(s)))
                      .map((s) => (
                        <div key={s} className="flex items-center gap-2 text-xs font-mono text-slate-500">
                          <CheckCircle2 size={12} className="text-slate-600 flex-shrink-0" />
                          {s}
                        </div>
                      ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500 py-2">Could not retrieve token info.</p>
            )}
          </Section>

          {/* ── Search Console ─────────────────────────────────────────── */}
          <Section title="Google Search Console" icon={<Search size={15} />}>
            <Row label="API status">
              {data.searchConsole.status === 'ok'
                ? <OK label="Connected" />
                : <FAIL label="Error" />}
            </Row>
            <Row label="Verified sites">
              {data.searchConsole.siteCount > 0
                ? <OK label={`${data.searchConsole.siteCount} site(s) found`} />
                : <WARN label="0 sites found" />}
            </Row>
            {data.searchConsole.sites?.length > 0 && (
              <div className="pt-1 space-y-1">
                {data.searchConsole.sites.map((s) => (
                  <div key={s.siteUrl} className="text-xs font-mono text-slate-400 flex items-center gap-2">
                    <CheckCircle2 size={11} className="text-emerald-500 flex-shrink-0" />
                    {s.siteUrl}
                    <span className="text-slate-600">({s.permissionLevel})</span>
                  </div>
                ))}
              </div>
            )}
            {data.searchConsole.error && <ErrorBox msg={data.searchConsole.error} hint={data.searchConsole.hint} />}
          </Section>

          {/* ── Google Analytics ───────────────────────────────────────── */}
          <Section title="Google Analytics 4" icon={<BarChart2 size={15} />}>
            <Row label="API status">
              {data.analytics.status === 'ok'
                ? <OK label="Connected" />
                : <FAIL label="Error" />}
            </Row>
            <Row label="Accounts">
              {data.analytics.accountCount > 0
                ? <OK label={`${data.analytics.accountCount} account(s)`} />
                : <WARN label="0 accounts found" />}
            </Row>
            <Row label="Properties">
              {data.analytics.propertyCount > 0
                ? <OK label={`${data.analytics.propertyCount} propert${data.analytics.propertyCount === 1 ? 'y' : 'ies'}`} />
                : <WARN label="0 properties found" />}
            </Row>
            {data.analytics.properties?.length > 0 && (
              <div className="pt-1 space-y-1">
                {data.analytics.properties.map((p) => (
                  <div key={p.id} className="text-xs font-mono text-slate-400 flex items-center gap-2">
                    <CheckCircle2 size={11} className="text-emerald-500 flex-shrink-0" />
                    {p.name}
                    {p.accountName && <span className="text-slate-600">({p.accountName})</span>}
                    <span className="text-slate-600">ID: {p.id}</span>
                  </div>
                ))}
              </div>
            )}
            {data.analytics.error && <ErrorBox msg={data.analytics.error} hint={data.analytics.hint} />}
          </Section>

          {/* ── Fix checklist ──────────────────────────────────────────── */}
          {(data.analytics.status === 'error' || data.searchConsole.status === 'error' || !data.hasRefreshToken) && (
            <Section title="How to Fix" icon={<AlertTriangle size={15} />}>
              <ul className="space-y-2 text-sm text-slate-300">
                {!data.hasRefreshToken && (
                  <FixItem>
                    <strong>Missing refresh token</strong> — Go to{' '}
                    <a href="/settings" className="text-brand-400 underline">Settings</a>, disconnect Google, then reconnect.
                    Google only issues a refresh token on the first consent or when <code>prompt=consent</code> is forced.
                  </FixItem>
                )}
                {data.analytics.status === 'error' && (
                  <FixItem>
                    <strong>Analytics API error</strong> — In{' '}
                    <a href={import.meta.env.VITE_GOOGLE_CLOUD_CONSOLE_URL} target="_blank" rel="noreferrer" className="text-brand-400 underline">
                      Google Cloud Console → APIs Library
                    </a>
                    , enable <strong>Google Analytics Admin API</strong> and <strong>Google Analytics Data API</strong>.
                  </FixItem>
                )}
                {data.searchConsole.status === 'error' && (
                  <FixItem>
                    <strong>Search Console API error</strong> — Enable{' '}
                    <strong>Google Search Console API</strong> in Google Cloud Console.
                    Also verify your site at{' '}
                    <a href={import.meta.env.VITE_GOOGLE_SEARCH_CONSOLE_URL} target="_blank" rel="noreferrer" className="text-brand-400 underline">
                      search.google.com/search-console
                    </a>.
                  </FixItem>
                )}
                {data.tokenInfo && !data.tokenInfo.valid && (
                  <FixItem>
                    <strong>Invalid token</strong> — Disconnect and reconnect your Google account in{' '}
                    <a href="/settings" className="text-brand-400 underline">Settings</a>.
                  </FixItem>
                )}
                {data.tokenInfo?.scopes && !data.tokenInfo.scopes.some(s => s.includes('analytics')) && (
                  <FixItem>
                    <strong>Missing analytics scope</strong> — The granted token does not include
                    <code className="mx-1 text-xs bg-dark-700 px-1 rounded">analytics.readonly</code>.
                    Disconnect and reconnect your Google account to re-grant all required permissions.
                  </FixItem>
                )}
              </ul>
            </Section>
          )}

        </div>
      )}
    </div>
  );
}

const Section = ({ title, icon, children }) => (
  <div className="card p-5">
    <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-3">
      <span className="text-brand-400">{icon}</span>
      {title}
    </h2>
    {children}
  </div>
);

const ErrorBox = ({ msg, hint }) => (
  <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs space-y-1">
    <div className="text-red-400 font-medium">Error: {msg}</div>
    {hint && <div className="text-slate-400">{hint}</div>}
  </div>
);

const FixItem = ({ children }) => (
  <li className="flex gap-2">
    <span className="text-amber-400 flex-shrink-0 mt-0.5">→</span>
    <span>{children}</span>
  </li>
);
