import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

const PRESETS = [
  { label: '7D',  days: 7   },
  { label: '30D', days: 30  },
  { label: '90D', days: 90  },
  { label: '12M', days: 365 },
];

const today = () => new Date().toISOString().split('T')[0];

/**
 * DateRangePicker
 * value:    { days, label, startDate, endDate }  (from WebsiteContext.dateRange)
 * onChange: (dateRange) => void
 *
 * For presets  → startDate/endDate are null; backend uses `days` (relative from today).
 * For custom   → startDate/endDate are ISO strings; days = diff in calendar days.
 */
export default function DateRangePicker({ value, onChange, className = '' }) {
  const [showCustom, setShowCustom] = useState(false);
  const [start, setStart]           = useState('');
  const [end, setEnd]               = useState('');
  const panelRef                    = useRef(null);

  // Close custom panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowCustom(false);
      }
    };
    if (showCustom) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCustom]);

  const handlePreset = (preset) => {
    setShowCustom(false);
    onChange({ days: preset.days, label: preset.label, startDate: null, endDate: null });
  };

  const applyCustom = () => {
    if (!start || !end || end <= start) return;
    const days = Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 86_400_000));
    onChange({ days, label: 'Custom', startDate: start, endDate: end });
    setShowCustom(false);
  };

  const openCustom = () => {
    // Pre-fill with current range when opening
    if (!showCustom && value?.startDate) {
      setStart(value.startDate);
      setEnd(value.endDate);
    }
    setShowCustom((v) => !v);
  };

  const isCustomActive = value?.label === 'Custom';
  const customDays = start && end && end > start
    ? Math.ceil((new Date(end) - new Date(start)) / 86_400_000)
    : null;

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      {/* Preset buttons + Custom trigger */}
      <div className="flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => handlePreset(p)}
            className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition-all ${
              value?.days === p.days && !isCustomActive
                ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                : 'bg-dark-700 text-slate-400 hover:text-white hover:bg-dark-600'
            }`}
          >
            {p.label}
          </button>
        ))}

        <button
          onClick={openCustom}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-semibold transition-all ${
            isCustomActive || showCustom
              ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
              : 'bg-dark-700 text-slate-400 hover:text-white hover:bg-dark-600'
          }`}
        >
          <Calendar size={11} />
          {isCustomActive
            ? `${value.startDate} – ${value.endDate}`
            : 'Custom'}
          <ChevronDown size={10} className={showCustom ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
      </div>

      {/* Custom range panel */}
      {showCustom && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-dark-800 border border-dark-700 rounded-xl p-4 shadow-2xl w-72">
          <p className="text-xs font-semibold text-slate-300 mb-3">Custom date range</p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Start</label>
              <input
                type="date"
                value={start}
                max={end || today()}
                onChange={(e) => setStart(e.target.value)}
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">End</label>
              <input
                type="date"
                value={end}
                min={start}
                max={today()}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>
          </div>

          {customDays && (
            <p className="text-xs text-slate-500 mb-3 text-center">{customDays} days selected</p>
          )}

          <button
            onClick={applyCustom}
            disabled={!start || !end || end <= start}
            className="w-full btn-primary text-xs py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply range
          </button>
        </div>
      )}
    </div>
  );
}