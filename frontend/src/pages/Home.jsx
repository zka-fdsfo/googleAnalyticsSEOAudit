import { useState ,useEffect} from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Zap, Shield, BarChart3, Globe, CheckCircle, ArrowRight } from 'lucide-react';
import { startAudit } from '../services/api';
import { AnalyzingLoader } from '../components/common/Loader';
import toast from 'react-hot-toast';

const features = [
  { icon: <Search size={18} />, title: 'Full SEO Audit', desc: 'Title, meta, headings, links, images, and 20+ checks' },
  { icon: <Zap size={18} />, title: 'Core Web Vitals', desc: 'LCP, CLS, FCP, TTFB via Google PageSpeed Insights' },
  { icon: <Shield size={18} />, title: 'Technical SEO', desc: 'SSL, robots.txt, sitemap, structured data, canonical tags' },
  { icon: <BarChart3 size={18} />, title: 'Analytics Integration', desc: 'Connect GA4 and Search Console for full insights' },
  { icon: <Globe size={18} />, title: 'Social Media Tags', desc: 'Open Graph, Twitter Card validation and preview' },
  { icon: <CheckCircle size={18} />, title: 'Actionable Reports', desc: 'Prioritized recommendations with severity levels' },
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const apiURL = import.meta.env.VITE_BACKEND_URL;
    console.log('Base API URL:', apiURL);
  }, []);
  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error('Please enter a website URL.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await startAudit(trimmed);
      navigate(`/audit/${data.auditId}`);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to start audit. Please check the URL and try again.';
      toast.error(msg);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <AnalyzingLoader />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)]">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-brand-900/30 via-dark-900 to-dark-900 pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-4 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-semibold mb-6">
            <Zap size={12} />
            Free SEO Audit Tool
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight mb-6">
            Analyze Your Website's{' '}
            <span className="gradient-text">SEO Performance</span>
          </h1>

          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Get a comprehensive SEO audit report in seconds. Identify critical issues, track
            performance, and get actionable recommendations to rank higher.
          </p>

          {/* URL Input */}
          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-3 p-2 bg-dark-800 border border-dark-700 rounded-2xl shadow-2xl shadow-black/30 focus-within:border-brand-500/50 transition-all">
              <div className="flex-1 flex items-center gap-3 px-3">
                <Globe size={18} className="text-slate-500 flex-shrink-0" />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Enter website URL (e.g., example.com)"
                  className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 outline-none text-sm sm:text-base py-2"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="btn-primary flex items-center justify-center gap-2 sm:flex-shrink-0 py-3 px-6 rounded-xl"
              >
                <Search size={16} />
                Analyze Now
              </button>
            </div>
          </form>

          <p className="text-xs text-slate-600 mt-4">
            No sign-up required for basic audit • Connect Google account for full analytics
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-center text-white mb-3">
          Everything you need to dominate search
        </h2>
        <p className="text-center text-slate-400 mb-10">
          Comprehensive SEO analysis covering all major ranking factors
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map(({ icon, title, desc }) => (
            <div
              key={title}
              className="card p-5 hover:border-brand-500/30 transition-all group"
            >
              <div className="w-9 h-9 bg-brand-500/10 rounded-lg flex items-center justify-center text-brand-400 mb-4 group-hover:bg-brand-500/20 transition-all">
                {icon}
              </div>
              <h3 className="font-semibold text-slate-100 mb-1.5">{title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-4 pb-20 text-center">
        <div className="card p-10 bg-gradient-to-br from-brand-900/40 to-dark-800">
          <h2 className="text-2xl font-bold text-white mb-3">Connect Google for deeper insights</h2>
          <p className="text-slate-400 mb-6">
            Link your Google Analytics 4 and Search Console accounts to get traffic data, keyword rankings, CTR, and indexing status all in one dashboard.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/register" className="btn-primary flex items-center justify-center gap-2">
              Get Started Free <ArrowRight size={16} />
            </a>
            <a href="#" className="btn-secondary flex items-center justify-center gap-2" onClick={handleSubmit}>
              Try Demo Audit
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
