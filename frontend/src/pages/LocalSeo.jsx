import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useWebsite }   from '../context/WebsiteContext';
import { useAuth }      from '../context/AuthContext';
import {
  MapPin, TrendingUp, TrendingDown, Minus, Plus, Trash2,
  Globe, BarChart2, Target, History, LayoutDashboard,
  RefreshCw, AlertCircle, ChevronUp, ChevronDown, Lightbulb,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RechTooltip, Legend,
} from 'recharts';
import {
  getLocalSeoOverview, getLocalSeoRankings, getLocalSeoKeywords,
  addLocalSeoKeyword, deleteLocalSeoKeyword, addLocalSeoRanking,
  getLocalSeoTrends, getLocalSeoVisibility, getLocalSeoInsights,
} from '../services/api';

// ── Palette ───────────────────────────────────────────────────────────────────
const GOOGLE_COLOR = '#4285F4';
const APPLE_COLOR  = '#555555';

// ── Small helpers ─────────────────────────────────────────────────────────────

const RankBadge = ({ rank }) => {
  if (!rank) return <span className="text-slate-600 text-xs">—</span>;
  const color = rank <= 3 ? 'text-emerald-400 bg-emerald-500/10'
              : rank <= 10 ? 'text-amber-400 bg-amber-500/10'
              : 'text-slate-400 bg-dark-700';
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>#{rank}</span>;
};

const ChangeBadge = ({ change }) => {
  if (change === 0 || change == null) return <span className="text-slate-600 text-xs">—</span>;
  const up = change > 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      {Math.abs(change)}
    </span>
  );
};

const EngineTag = ({ engine }) => (
  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
    engine === 'google_maps'
      ? 'bg-blue-500/15 text-blue-400'
      : 'bg-slate-700 text-slate-400'
  }`}>
    {engine === 'google_maps' ? 'Google Maps' : 'Apple Maps'}
  </span>
);

const KPI = ({ label, value, sub, color = 'text-white' }) => (
  <div className="card p-4">
    <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">{label}</p>
    <p className={`text-2xl font-black ${color}`}>{value ?? '—'}</p>
    {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
  </div>
);

const SummaryGrid = ({ summary, engine }) => {
  if (!summary) return null;
  const isGoogle = engine === 'google_maps';
  const accentColor = isGoogle ? 'text-blue-400' : 'text-slate-300';
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <KPI label="Avg Rank"      value={summary.averageRank > 0 ? `#${summary.averageRank}` : '—'} color={accentColor} />
      <KPI label="Top 3"         value={summary.top3Keywords}  color="text-emerald-400" sub="keywords" />
      <KPI label="Top 10"        value={summary.top10Keywords} color="text-amber-400"  sub="keywords" />
      <KPI label="Visibility"    value={`${summary.visibilityScore}%`} color={accentColor} />
      <KPI label="Improvements"  value={summary.rankingImprovements} color="text-emerald-400" sub="↑ vs prev" />
      <KPI label="Declines"      value={summary.rankingDeclines}     color="text-red-400"    sub="↓ vs prev" />
      <KPI label="Ranked"        value={`${summary.rankedKeywords} / ${summary.totalKeywords}`} sub="keywords" />
      <KPI label="Top 20"        value={summary.top20Keywords} sub="keywords" />
    </div>
  );
};

// ── Modal: add keyword ────────────────────────────────────────────────────────

function AddKeywordModal({ websiteId, onClose, onAdded }) {
  const [kw, setKw]   = useState('');
  const [loc, setLoc] = useState('');
  const [eng, setEng] = useState('both');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!kw.trim() || !loc.trim()) return;
    setBusy(true);
    try {
      await addLocalSeoKeyword(websiteId, { keyword: kw.trim(), targetLocation: loc.trim(), searchEngine: eng });
      toast.success('Keyword added!');
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add keyword.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Add Keyword to Track</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Keyword</label>
            <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="e.g. SEO Company Kolkata"
              className="input-field text-sm w-full" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Target Location</label>
            <input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="e.g. Kolkata"
              className="input-field text-sm w-full" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Search Engine</label>
            <select value={eng} onChange={(e) => setEng(e.target.value)} className="input-field text-sm w-full">
              <option value="both">Both (Google Maps + Apple Maps)</option>
              <option value="google_maps">Google Maps only</option>
              <option value="apple_maps">Apple Maps only</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={submit} disabled={busy || !kw.trim() || !loc.trim()}
            className="btn-primary text-sm flex-1 disabled:opacity-40">
            {busy ? 'Adding…' : 'Add Keyword'}
          </button>
          <button onClick={onClose} className="btn-secondary text-sm flex-1">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: log a rank ─────────────────────────────────────────────────────────

function AddRankingModal({ websiteId, keywords, onClose, onAdded }) {
  const [kw,     setKw]     = useState('');
  const [engine, setEngine] = useState('google_maps');
  const [rank,   setRank]   = useState('');
  const [notes,  setNotes]  = useState('');
  const [busy,   setBusy]   = useState(false);

  const submit = async () => {
    if (!kw.trim() || !rank || parseInt(rank) < 1) return;
    setBusy(true);
    try {
      const found = keywords.find((k) => k.keyword === kw.trim() &&
        (k.searchEngine === engine || k.searchEngine === 'both'));
      await addLocalSeoRanking(websiteId, {
        keyword: kw.trim(), searchEngine: engine,
        rank: parseInt(rank), notes,
        keywordId: found?._id,
      });
      toast.success('Ranking saved!');
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save ranking.');
    } finally { setBusy(false); }
  };

  const kwOptions = [...new Set(keywords.map((k) => k.keyword))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Log a Rank Check</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Keyword</label>
            <input value={kw} onChange={(e) => setKw(e.target.value)} list="kw-list"
              placeholder="Type or pick a keyword" className="input-field text-sm w-full" />
            <datalist id="kw-list">{kwOptions.map((k) => <option key={k} value={k} />)}</datalist>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Search Engine</label>
            <select value={engine} onChange={(e) => setEngine(e.target.value)} className="input-field text-sm w-full">
              <option value="google_maps">Google Maps</option>
              <option value="apple_maps">Apple Maps</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Current Rank Position</label>
            <input type="number" min="1" value={rank} onChange={(e) => setRank(e.target.value)}
              placeholder="e.g. 3" className="input-field text-sm w-full" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Notes (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. after Google profile update" className="input-field text-sm w-full" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={submit} disabled={busy || !kw.trim() || !rank || parseInt(rank) < 1}
            className="btn-primary text-sm flex-1 disabled:opacity-40">
            {busy ? 'Saving…' : 'Save Rank'}
          </button>
          <button onClick={onClose} className="btn-secondary text-sm flex-1">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Rankings table ────────────────────────────────────────────────────────────

function RankingsTable({ websiteId, engineFilter }) {
  const { data: resp } = useQuery({
    queryKey: ['local-rankings-latest', websiteId, engineFilter],
    queryFn:  () => getLocalSeoRankings(websiteId, { searchEngine: engineFilter, latest: 'true' }),
    enabled:  !!websiteId,
  });
  const rows = resp?.data?.rankings || [];

  if (!rows.length) return (
    <div className="text-center py-8 text-slate-500 text-sm">
      No rankings yet. Log your first rank check using the button above.
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 text-xs border-b border-dark-700">
            <th className="pb-2.5 font-medium">Keyword</th>
            <th className="pb-2.5 font-medium">Engine</th>
            <th className="pb-2.5 font-medium text-right">Current</th>
            <th className="pb-2.5 font-medium text-right">Previous</th>
            <th className="pb-2.5 font-medium text-right">Change</th>
            <th className="pb-2.5 font-medium text-right">Checked</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dark-700/40">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-dark-700/20">
              <td className="py-2.5 text-slate-200 font-medium">{r.keyword}</td>
              <td className="py-2.5"><EngineTag engine={r.searchEngine} /></td>
              <td className="py-2.5 text-right"><RankBadge rank={r.rank} /></td>
              <td className="py-2.5 text-right"><RankBadge rank={r.previousRank} /></td>
              <td className="py-2.5 text-right"><ChangeBadge change={r.change} /></td>
              <td className="py-2.5 text-right text-xs text-slate-500">
                {r.checkedAt ? new Date(r.checkedAt).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Trend chart ───────────────────────────────────────────────────────────────

function TrendChart({ websiteId, engineFilter, days }) {
  const { data: resp } = useQuery({
    queryKey: ['local-trends', websiteId, engineFilter, days],
    queryFn:  () => getLocalSeoTrends(websiteId, { searchEngine: engineFilter, days }),
    enabled:  !!websiteId,
  });
  const series = resp?.data?.trends || [];

  if (!series.length) return (
    <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm">
      No trend data yet. Log at least 2 rank checks per keyword to see trends.
    </div>
  );

  // Build a single series per keyword
  const colors = ['#4285F4','#34a853','#fbbc05','#ea4335','#9c27b0','#00bcd4'];

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="date" type="category" allowDuplicatedCategory={false}
          tick={{ fill: '#64748b', fontSize: 11 }} />
        <YAxis reversed domain={['dataMin - 1', 'dataMax + 1']}
          tick={{ fill: '#64748b', fontSize: 11 }}
          label={{ value: 'Rank', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
        <RechTooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#94a3b8' }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
        {series.map((s, i) => (
          <Line key={i} data={s.series} dataKey="rank" name={s.keyword}
            stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 3 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Insights panel ────────────────────────────────────────────────────────────

function InsightsPanel({ websiteId }) {
  const { data: resp } = useQuery({
    queryKey: ['local-insights', websiteId],
    queryFn:  () => getLocalSeoInsights(websiteId),
    enabled:  !!websiteId,
  });
  const items = resp?.data?.insights || [];

  if (!items.length) return (
    <p className="text-slate-500 text-sm">No insights yet — log ranking data to generate insights.</p>
  );

  const iconFor = (type) =>
    type === 'improvement' ? <TrendingUp size={13} className="text-emerald-400 flex-shrink-0" />
    : type === 'decline'   ? <TrendingDown size={13} className="text-red-400 flex-shrink-0" />
    : <Lightbulb size={13} className="text-brand-400 flex-shrink-0" />;

  return (
    <div className="space-y-2">
      {items.map((ins, i) => (
        <div key={i} className="flex items-start gap-2.5 p-3 bg-dark-700/40 rounded-lg text-sm text-slate-300">
          {iconFor(ins.type)}
          <span>{ins.text}</span>
          <EngineTag engine={ins.engine} />
        </div>
      ))}
    </div>
  );
}

// ── Keywords manager ──────────────────────────────────────────────────────────

function KeywordsManager({ websiteId }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: resp } = useQuery({
    queryKey: ['local-keywords', websiteId],
    queryFn:  () => getLocalSeoKeywords(websiteId),
    enabled:  !!websiteId,
  });
  const keywords = resp?.data?.keywords || [];

  const handleDelete = async (kwId) => {
    try {
      await deleteLocalSeoKeyword(websiteId, kwId);
      queryClient.invalidateQueries({ queryKey: ['local-keywords', websiteId] });
      toast.success('Keyword removed.');
    } catch { toast.error('Failed to remove.'); }
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['local-keywords', websiteId] });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-500">{keywords.length} keyword{keywords.length !== 1 ? 's' : ''} tracked</p>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-xs flex items-center gap-1.5 py-2">
          <Plus size={12} /> Add Keyword
        </button>
      </div>

      {keywords.length === 0 ? (
        <div className="text-center py-10">
          <Target size={28} className="text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 text-sm font-medium">No keywords yet</p>
          <p className="text-slate-600 text-xs mt-1">Add keywords like "SEO Company Kolkata" to start tracking.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs border-b border-dark-700">
                <th className="pb-2.5 font-medium">Keyword</th>
                <th className="pb-2.5 font-medium">Location</th>
                <th className="pb-2.5 font-medium">Engine</th>
                <th className="pb-2.5 font-medium">Added</th>
                <th className="pb-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/40">
              {keywords.map((k) => (
                <tr key={k._id} className="hover:bg-dark-700/20">
                  <td className="py-2.5 text-slate-200 font-medium">{k.keyword}</td>
                  <td className="py-2.5 text-slate-400">{k.targetLocation}</td>
                  <td className="py-2.5">
                    {k.searchEngine === 'both'
                      ? <span className="text-xs text-slate-400">Both</span>
                      : <EngineTag engine={k.searchEngine} />}
                  </td>
                  <td className="py-2.5 text-xs text-slate-500">
                    {new Date(k.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 text-right">
                    <button onClick={() => handleDelete(k._id)}
                      className="p-1 text-slate-600 hover:text-red-400 rounded transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddKeywordModal websiteId={websiteId} onClose={() => setShowAdd(false)} onAdded={refresh} />
      )}
    </div>
  );
}

// ── Ranking history ───────────────────────────────────────────────────────────

function RankingHistory({ websiteId }) {
  const [engineFilter, setEngineFilter] = useState('');
  const [days, setDays] = useState(30);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const startDate = since.toISOString().split('T')[0];

  const { data: resp } = useQuery({
    queryKey: ['local-history', websiteId, engineFilter, days],
    queryFn:  () => getLocalSeoRankings(websiteId, {
      searchEngine: engineFilter || undefined, startDate,
    }),
    enabled: !!websiteId,
  });
  const rows = resp?.data?.rankings || [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select value={engineFilter} onChange={(e) => setEngineFilter(e.target.value)}
          className="input-field text-xs py-1.5 w-40">
          <option value="">All engines</option>
          <option value="google_maps">Google Maps</option>
          <option value="apple_maps">Apple Maps</option>
        </select>
        <div className="flex gap-1">
          {[7,30,90,365].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                days === d ? 'bg-brand-500 text-white' : 'bg-dark-700 text-slate-400 hover:text-white'
              }`}>
              {d === 365 ? '12M' : `${d}D`}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">{rows.length} records</span>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">No ranking history for this period.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs border-b border-dark-700">
                <th className="pb-2.5 font-medium">Date</th>
                <th className="pb-2.5 font-medium">Keyword</th>
                <th className="pb-2.5 font-medium">Engine</th>
                <th className="pb-2.5 font-medium text-right">Rank</th>
                <th className="pb-2.5 font-medium text-right">Prev</th>
                <th className="pb-2.5 font-medium text-right">Change</th>
                <th className="pb-2.5 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/40">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-dark-700/20">
                  <td className="py-2 text-xs text-slate-500">
                    {new Date(r.checkedAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 text-slate-200">{r.keyword}</td>
                  <td className="py-2"><EngineTag engine={r.searchEngine} /></td>
                  <td className="py-2 text-right"><RankBadge rank={r.rank} /></td>
                  <td className="py-2 text-right"><RankBadge rank={r.previousRank} /></td>
                  <td className="py-2 text-right"><ChangeBadge change={r.change} /></td>
                  <td className="py-2 text-xs text-slate-500 max-w-[160px] truncate">{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',      label: 'Overview',        icon: <LayoutDashboard size={14} /> },
  { id: 'google-maps',   label: 'Google Maps',      icon: <MapPin size={14} /> },
  { id: 'apple-maps',    label: 'Apple Maps',       icon: <Globe size={14} /> },
  { id: 'keywords',      label: 'Keywords',         icon: <Target size={14} /> },
  { id: 'history',       label: 'Ranking History',  icon: <History size={14} /> },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LocalSeo() {
  const { activeWebsite } = useWebsite();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab,    setActiveTab]    = useState('overview');
  const [showAddKw,    setShowAddKw]    = useState(false);
  const [showAddRank,  setShowAddRank]  = useState(false);
  const [days,         setDays]         = useState(30);

  const id = activeWebsite?._id;

  const { data: overviewResp, isLoading } = useQuery({
    queryKey: ['local-overview', id],
    queryFn:  () => getLocalSeoOverview(id),
    enabled:  !!id,
  });
  const { data: kwResp } = useQuery({
    queryKey: ['local-keywords', id],
    queryFn:  () => getLocalSeoKeywords(id),
    enabled:  !!id,
  });

  const overview  = overviewResp?.data;
  const keywords  = kwResp?.data?.keywords || [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['local-overview',      id] });
    queryClient.invalidateQueries({ queryKey: ['local-rankings-latest', id] });
    queryClient.invalidateQueries({ queryKey: ['local-trends',        id] });
    queryClient.invalidateQueries({ queryKey: ['local-insights',      id] });
    queryClient.invalidateQueries({ queryKey: ['local-history',       id] });
  };

  if (!activeWebsite) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <MapPin size={40} className="text-slate-600 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No website selected</h2>
        <p className="text-slate-400">Select a website from the switcher in the navbar.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <MapPin size={18} className="text-brand-400" />
            Local SEO & Maps Ranking
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {activeWebsite.displayName || activeWebsite.domain}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range for charts */}
          <div className="flex gap-1">
            {[7, 30, 90, 365].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition-all ${
                  days === d
                    ? 'bg-brand-500 text-white'
                    : 'bg-dark-700 text-slate-400 hover:text-white hover:bg-dark-600'
                }`}>
                {d === 365 ? '12M' : `${d}D`}
              </button>
            ))}
          </div>
          <button onClick={() => setShowAddRank(true)}
            className="btn-primary text-xs flex items-center gap-1.5 py-2">
            <Plus size={12} /> Log Rank
          </button>
          <button onClick={() => setShowAddKw(true)}
            className="btn-secondary text-xs flex items-center gap-1.5 py-2">
            <Target size={12} /> Add Keyword
          </button>
          <button onClick={refresh}
            className="btn-outline text-xs flex items-center gap-1.5 py-2">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-dark-700 overflow-x-auto gap-0">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all flex-shrink-0 ${
              activeTab === t.id
                ? 'text-brand-400 border-brand-500'
                : 'text-slate-500 border-transparent hover:text-slate-200'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="py-12 text-center text-slate-500 text-sm">Loading…</div>
      )}

      {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && !isLoading && (
        <div className="space-y-5">
          {/* Insights */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Lightbulb size={14} className="text-brand-400" /> Insights
            </h3>
            <InsightsPanel websiteId={id} />
          </div>

          {/* Google Maps summary */}
          <div>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">
              Google Maps
            </p>
            <SummaryGrid summary={overview?.google} engine="google_maps" />
          </div>

          {/* Apple Maps summary */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Apple Maps
            </p>
            <SummaryGrid summary={overview?.apple} engine="apple_maps" />
          </div>

          {/* Combined latest rankings */}
          {overview?.recentRankings?.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Current Rankings</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 text-xs border-b border-dark-700">
                      <th className="pb-2.5 font-medium">Keyword</th>
                      <th className="pb-2.5 font-medium">Engine</th>
                      <th className="pb-2.5 font-medium text-right">Rank</th>
                      <th className="pb-2.5 font-medium text-right">Prev</th>
                      <th className="pb-2.5 font-medium text-right">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-700/40">
                    {overview.recentRankings.map((r, i) => (
                      <tr key={i} className="hover:bg-dark-700/20">
                        <td className="py-2.5 text-slate-200 font-medium">{r.keyword}</td>
                        <td className="py-2.5"><EngineTag engine={r.searchEngine} /></td>
                        <td className="py-2.5 text-right"><RankBadge rank={r.rank} /></td>
                        <td className="py-2.5 text-right"><RankBadge rank={r.previousRank} /></td>
                        <td className="py-2.5 text-right"><ChangeBadge change={r.change} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── GOOGLE MAPS ──────────────────────────────────────────────────────── */}
      {activeTab === 'google-maps' && (
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">
              Google Maps — KPIs
            </p>
            <SummaryGrid summary={overview?.google} engine="google_maps" />
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">
              Ranking Trend — Google Maps ({days}D)
            </h3>
            <TrendChart websiteId={id} engineFilter="google_maps" days={days} />
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Current Rankings — Google Maps</h3>
            <RankingsTable websiteId={id} engineFilter="google_maps" />
          </div>
        </div>
      )}

      {/* ── APPLE MAPS ───────────────────────────────────────────────────────── */}
      {activeTab === 'apple-maps' && (
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Apple Maps — KPIs
            </p>
            <SummaryGrid summary={overview?.apple} engine="apple_maps" />
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">
              Ranking Trend — Apple Maps ({days}D)
            </h3>
            <TrendChart websiteId={id} engineFilter="apple_maps" days={days} />
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Current Rankings — Apple Maps</h3>
            <RankingsTable websiteId={id} engineFilter="apple_maps" />
          </div>
        </div>
      )}

      {/* ── KEYWORDS ─────────────────────────────────────────────────────────── */}
      {activeTab === 'keywords' && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Tracked Keywords</h3>
          <KeywordsManager websiteId={id} />
        </div>
      )}

      {/* ── RANKING HISTORY ──────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Ranking History</h3>
          <RankingHistory websiteId={id} />
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {showAddKw && (
        <AddKeywordModal websiteId={id} onClose={() => setShowAddKw(false)}
          onAdded={() => {
            queryClient.invalidateQueries({ queryKey: ['local-keywords', id] });
            refresh();
          }} />
      )}
      {showAddRank && (
        <AddRankingModal websiteId={id} keywords={keywords}
          onClose={() => setShowAddRank(false)}
          onAdded={refresh} />
      )}
    </div>
  );
}