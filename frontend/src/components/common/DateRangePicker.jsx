import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { buildPresetRange, localToday } from '../../context/WebsiteContext';

// Predefined ranges — Today + completed-day presets
const PRESETS = ['Today', '7D', '30D', '90D', '12M'];

/**
 * DateRangePicker
 *
 * value:    { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', label: string }
 * onChange: (range) => void
 *
 * Preset date logic (centralised in buildPresetRange):
 *   Today → [today, today]           — partial current-day data
 *   7D    → [today-7,   yesterday]   — 7 completed days, NO today
 *   30D   → [today-30,  yesterday]
 *   90D   → [today-90,  yesterday]
 *   12M   → [today-365, yesterday]
 *
 * Custom → user picks explicit start/end (unchanged from existing behaviour)
 */
export default function DateRangePicker({ value, onChange, className = '' }) {
  const [showCustom, setShowCustom] = useState(false);
  const [start, setStart]           = useState('');
  const [end, setEnd]               = useState('');
  const panelRef                    = useRef(null);

  // Close custom panel on outside click
  useEffect(() => {
    const h = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setShowCustom(false);
    };
    if (showCustom) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showCustom]);

  const handlePreset = (label) => {
    setShowCustom(false);
    onChange(buildPresetRange(label));
  };

  const applyCustom = () => {
    if (!start || !end || end < start) return;
    onChange({ startDate: start, endDate: end, label: 'Custom' });
    setShowCustom(false);
  };

  const openCustom = () => {
    // Pre-fill inputs with current custom range when re-opening
    if (!showCustom && value?.label === 'Custom') {
      setStart(value.startDate);
      setEnd(value.endDate);
    }
    setShowCustom((v) => !v);
  };

  const isCustom   = value?.label === 'Custom';
  const customDays = start && end && end >= start
    ? Math.round((new Date(end) - new Date(start)) / 86_400_000) + 1
    : null;

  return (
    <div className={`relative flex items-center gap-1 ${className}`} ref={panelRef}>
      {/* ── Preset + Today buttons ─────────────────────────────────────── */}
      {PRESETS.map((label) => {
        const isActive = value?.label === label;
        // "Today" gets a distinct accent colour to show it's partial data
        const activeStyle = label === 'Today'
          ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
          : 'bg-brand-500 text-white shadow-lg shadow-brand-500/20';
        return (
          <button
            key={label}
            onClick={() => handlePreset(label)}
            className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition-all ${
              isActive
                ? activeStyle
                : 'bg-dark-700 text-slate-400 hover:text-white hover:bg-dark-600'
            }`}
          >
            {label}
          </button>
        );
      })}

      {/* ── Custom date range trigger ──────────────────────────────────── */}
      <button
        onClick={openCustom}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-semibold transition-all ${
          isCustom || showCustom
            ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
            : 'bg-dark-700 text-slate-400 hover:text-white hover:bg-dark-600'
        }`}
      >
        <Calendar size={11} />
        {isCustom
          ? `${value.startDate} – ${value.endDate}`
          : 'Custom'}
        <ChevronDown
          size={10}
          className={showCustom ? 'rotate-180 transition-transform' : 'transition-transform'}
        />
      </button>

      {/* ── Custom panel ──────────────────────────────────────────────── */}
      {showCustom && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-dark-800 border border-dark-700 rounded-xl p-4 shadow-2xl w-72">
          <p className="text-xs font-semibold text-slate-300 mb-1">Custom date range</p>
          <p className="text-xs text-slate-500 mb-3">Pick any start and end date</p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Start</label>
              <input
                type="date"
                value={start}
                max={end || localToday()}
                onChange={(e) => setStart(e.target.value)}
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">End</label>
              <input
                type="date"
                value={end}
                min={start}
                max={localToday()}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {customDays && (
            <p className="text-xs text-slate-500 mb-3 text-center">{customDays} day{customDays !== 1 ? 's' : ''}</p>
          )}

          <button
            onClick={applyCustom}
            disabled={!start || !end || end < start}
            className="w-full btn-primary text-xs py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply range
          </button>
        </div>
      )}
    </div>
  );
}