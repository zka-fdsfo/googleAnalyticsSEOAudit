import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { scaleLinear } from 'd3-scale';
import { getGeoSnapshot } from '../../services/api';
import Loader from '../common/Loader';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// Country name → ISO numeric (used by world-atlas topojson)
const COUNTRY_NAME_TO_ISO = {
  'United States':'840','United Kingdom':'826','Canada':'124','Australia':'036',
  'Germany':'276','France':'250','India':'356','Brazil':'076','Mexico':'484',
  'Netherlands':'528','Spain':'724','Italy':'380','Japan':'392','South Korea':'410',
  'Russia':'643','China':'156','Poland':'616','Sweden':'752','Norway':'578',
  'Denmark':'208','Finland':'246','Switzerland':'756','Austria':'040','Belgium':'056',
  'Portugal':'620','Turkey':'792','Indonesia':'360','Pakistan':'586','Nigeria':'566',
  'South Africa':'710','Argentina':'032','Colombia':'170','Chile':'152','Peru':'604',
  'Thailand':'764','Vietnam':'704','Philippines':'608','Malaysia':'458','Singapore':'702',
  'Bangladesh':'050','Egypt':'818','Saudi Arabia':'682','United Arab Emirates':'784',
  'Israel':'376','Ukraine':'804','Romania':'642','Czech Republic':'203','Hungary':'348',
  'Greece':'300','New Zealand':'554','Ireland':'372',
};

const Tooltip = ({ country, data, x, y }) => {
  if (!country) return null;
  const d = data[country];
  return (
    <div
      className="fixed z-50 pointer-events-none bg-dark-800 border border-dark-700 rounded-lg p-3 shadow-xl text-xs"
      style={{ left: x + 12, top: y - 10, transform: 'translateY(-100%)' }}
    >
      <div className="font-semibold text-white mb-1.5">{country}</div>
      {d ? (
        <div className="space-y-0.5 text-slate-300">
          {d.sessions != null && <div>Sessions: <span className="text-white font-medium">{d.sessions?.toLocaleString()}</span></div>}
          {d.users    != null && <div>Users:    <span className="text-white font-medium">{d.users?.toLocaleString()}</span></div>}
          {d.clicks   != null && <div>Clicks:   <span className="text-white font-medium">{d.clicks?.toLocaleString()}</span></div>}
          {d.impressions != null && <div>Impressions: <span className="text-white font-medium">{d.impressions?.toLocaleString()}</span></div>}
          {d.ctr      != null && d.ctr > 0 && <div>CTR: <span className="text-white font-medium">{d.ctr}%</span></div>}
          {d.position != null && d.position > 0 && <div>Avg Position: <span className="text-white font-medium">#{d.position}</span></div>}
        </div>
      ) : (
        <div className="text-slate-500">No data</div>
      )}
    </div>
  );
};

export default function WorldMap({ websiteId, days = 30 }) {
  const [metric, setMetric]     = useState('sessions');
  const [tooltip, setTooltip]   = useState({ visible: false, country: null, x: 0, y: 0 });
  const [selectedCountry, setSelectedCountry] = useState(null);

  const { data: resp, isLoading: loading } = useQuery({
    queryKey: ['geo', websiteId, days],
    queryFn:  () => getGeoSnapshot(websiteId, days),
    enabled:  !!websiteId,
  });
  const snapshot = resp?.data?.snapshot ?? null;

  const countryData = {};
  (snapshot?.countries || []).forEach((c) => { countryData[c.country] = c; });

  const values = (snapshot?.countries || []).map((c) => c[metric] || 0).filter(Boolean);
  const maxVal  = Math.max(...values, 1);
  const colorScale = scaleLinear().domain([0, maxVal]).range(['#1e293b', '#6366f1']);

  const METRICS = [
    { id: 'sessions',    label: 'Sessions' },
    { id: 'users',       label: 'Users' },
    { id: 'clicks',      label: 'Clicks' },
    { id: 'impressions', label: 'Impressions' },
  ];

  if (loading) return <div className="py-16 flex justify-center"><Loader size="md" text="Loading geo data..." /></div>;
  if (!snapshot) return <div className="text-center py-12 text-slate-500 text-sm">No geographic data available yet.</div>;

  const topCountries = [...(snapshot.countries || [])].sort((a, b) => (b[metric] || 0) - (a[metric] || 0)).slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Metric selector */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-200">Geographic Distribution</h3>
        <div className="flex gap-1">
          {METRICS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                metric === m.id ? 'bg-brand-500 text-white' : 'bg-dark-700 text-slate-400 hover:text-white'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Map */}
        <div className="xl:col-span-2 card bg-dark-900 rounded-xl overflow-hidden relative" style={{ height: 320 }}>
          <ComposableMap
            projectionConfig={{ scale: 140, center: [0, 20] }}
            style={{ width: '100%', height: '100%', background: '#0f172a' }}
          >
            <ZoomableGroup zoom={1} minZoom={1} maxZoom={6}>
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const name       = geo.properties.name;
                    const countryVal = countryData[name]?.[metric] || 0;
                    const fill       = countryVal > 0 ? colorScale(countryVal) : '#1e293b';

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={selectedCountry === name ? '#818cf8' : fill}
                        stroke="#0f172a"
                        strokeWidth={0.5}
                        style={{
                          default:  { outline: 'none' },
                          hover:    { fill: '#818cf8', outline: 'none', cursor: 'pointer' },
                          pressed:  { fill: '#4f46e5', outline: 'none' },
                        }}
                        onMouseEnter={(e) => setTooltip({ visible: true, country: name, x: e.clientX, y: e.clientY })}
                        onMouseMove={(e)  => setTooltip((t) => ({ ...t, x: e.clientX, y: e.clientY }))}
                        onMouseLeave={()  => setTooltip({ visible: false, country: null, x: 0, y: 0 })}
                        onClick={()       => setSelectedCountry(selectedCountry === name ? null : name)}
                      />
                    );
                  })
                }
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 flex items-center gap-2 text-xs text-slate-500">
            <div className="w-16 h-2 rounded" style={{ background: 'linear-gradient(to right, #1e293b, #6366f1)' }} />
            <span>Low → High {METRICS.find((m) => m.id === metric)?.label}</span>
          </div>
        </div>

        {/* Top countries table */}
        <div className="card p-4">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Top Countries</h4>
          <div className="space-y-2">
            {topCountries.map((c, i) => {
              const val = c[metric] || 0;
              const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
              return (
                <div
                  key={c.country}
                  className={`cursor-pointer rounded-lg p-2 transition-colors ${
                    selectedCountry === c.country ? 'bg-brand-500/10 border border-brand-500/30' : 'hover:bg-dark-700'
                  }`}
                  onClick={() => setSelectedCountry(selectedCountry === c.country ? null : c.country)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-200 truncate">{c.country}</span>
                    <span className="text-xs font-semibold text-white ml-2 flex-shrink-0">
                      {val >= 1000 ? `${(val/1000).toFixed(1)}K` : val.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  {c.sessionsChange != null && (
                    <div className={`text-xs mt-0.5 ${c.sessionsChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {c.sessionsChange >= 0 ? '+' : ''}{c.sessionsChange}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {tooltip.visible && (
        <Tooltip country={tooltip.country} data={countryData} x={tooltip.x} y={tooltip.y} />
      )}
    </div>
  );
}
