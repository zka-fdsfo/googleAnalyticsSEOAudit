import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-slate-400 mb-2">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
};

export function SessionsLineChart({ data }) {
  if (!data?.length) return <EmptyChart />;
  const formatted = data.map((d) => ({
    ...d,
    date: d.date ? `${d.date.slice(4, 6)}/${d.date.slice(6)}` : d.date,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={formatted} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Line type="monotone" dataKey="sessions" stroke="#6366f1" strokeWidth={2} dot={false} name="Sessions" />
        <Line type="monotone" dataKey="users" stroke="#22c55e" strokeWidth={2} dot={false} name="Users" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ClicksLineChart({ data }) {
  if (!data?.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Line type="monotone" dataKey="clicks" stroke="#6366f1" strokeWidth={2} dot={false} name="Clicks" />
        <Line type="monotone" dataKey="impressions" stroke="#94a3b8" strokeWidth={1.5} dot={false} name="Impressions" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TrafficSourcesChart({ data }) {
  if (!data?.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 15, bottom: 5, left: 80 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
        <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="channel" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="sessions" fill="#6366f1" radius={[0, 4, 4, 0]} name="Sessions" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DeviceBreakdownChart({ data }) {
  if (!data?.length) return <EmptyChart />;
  const chartData = data.map((d) => ({ name: d.device || d.deviceCategory, value: d.sessions || d.users }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="45%"
          outerRadius={70}
          innerRadius={35}
          dataKey="value"
          strokeWidth={0}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Legend
          formatter={(val) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{val}</span>}
          iconSize={8}
          iconType="circle"
        />
        <Tooltip content={<CustomTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function KeywordPositionChart({ data }) {
  if (!data?.length) return <EmptyChart />;
  const chartData = data.slice(0, 8).map((k) => ({
    query: k.query?.length > 20 ? k.query.slice(0, 20) + '…' : k.query,
    position: parseFloat(k.position),
    clicks: k.clicks,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 15, bottom: 5, left: 130 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
        <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 50]} />
        <YAxis type="category" dataKey="query" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="position" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Avg. Position" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyChart() {
  return (
    <div className="h-[220px] flex items-center justify-center text-slate-500 text-sm">
      No data available
    </div>
  );
}
