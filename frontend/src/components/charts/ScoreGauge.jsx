import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const getScoreColor = (score) => {
  if (score >= 80) return { primary: '#22c55e', bg: 'rgba(34,197,94,0.15)', label: 'Excellent', text: 'text-emerald-400' };
  if (score >= 60) return { primary: '#f59e0b', bg: 'rgba(245,158,11,0.15)', label: 'Good', text: 'text-amber-400' };
  if (score >= 40) return { primary: '#f97316', bg: 'rgba(249,115,22,0.15)', label: 'Needs Work', text: 'text-orange-400' };
  return { primary: '#ef4444', bg: 'rgba(239,68,68,0.15)', label: 'Poor', text: 'text-red-400' };
};

export default function ScoreGauge({ score, size = 'lg' }) {
  const config = getScoreColor(score);
  const data = [{ value: score }, { value: 100 - score }];
  const isLarge = size === 'lg';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative ${isLarge ? 'w-40 h-40' : 'w-24 h-24'}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              startAngle={225}
              endAngle={-45}
              innerRadius={isLarge ? '75%' : '72%'}
              outerRadius={isLarge ? '90%' : '88%'}
              dataKey="value"
              strokeWidth={0}
            >
              <Cell fill={config.primary} />
              <Cell fill="#1e293b" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className={`font-black ${isLarge ? 'text-4xl' : 'text-2xl'} ${config.text} leading-none`}
          >
            {score}
          </div>
          {isLarge && (
            <div className="text-xs text-slate-500 mt-1 font-medium">/ 100</div>
          )}
        </div>
      </div>

      <div
        className={`px-3 py-1 rounded-full text-xs font-semibold ${config.text}`}
        style={{ backgroundColor: config.bg }}
      >
        {config.label}
      </div>
    </div>
  );
}
