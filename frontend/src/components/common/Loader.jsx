export default function Loader({ size = 'md', text = '' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12', xl: 'w-16 h-16' };
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className={`${sizes[size]} relative`}>
        <div className={`${sizes[size]} rounded-full border-2 border-dark-700`} />
        <div
          className={`${sizes[size]} rounded-full border-2 border-transparent border-t-brand-500 absolute top-0 left-0 animate-spin`}
        />
      </div>
      {text && <p className="text-slate-400 text-sm">{text}</p>}
    </div>
  );
}

export function PageLoader({ text = 'Loading...' }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Loader size="lg" text={text} />
    </div>
  );
}

export function AnalyzingLoader() {
  const steps = [
    'Crawling page content...',
    'Analyzing meta tags...',
    'Checking technical SEO...',
    'Validating links...',
    'Calculating score...',
  ];
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-8 animate-fade-in">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 rounded-full border-4 border-dark-700" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-brand-500 animate-spin" />
        <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-purple-500 animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 bg-brand-500 rounded-full animate-pulse" />
        </div>
      </div>
      <div className="text-center">
        <h3 className="text-xl font-semibold text-white mb-2">Analyzing your website</h3>
        <p className="text-slate-400 text-sm">This typically takes 15–30 seconds</p>
      </div>
      <div className="space-y-2 w-full max-w-xs">
        {steps.map((step, i) => (
          <div
            key={step}
            className="flex items-center gap-3 text-sm text-slate-400"
            style={{ animationDelay: `${i * 0.5}s` }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}
