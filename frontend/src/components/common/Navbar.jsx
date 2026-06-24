import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { BarChart3, Search, LogOut, Settings, LayoutDashboard, Menu, X, Zap, MapPin } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import WebsiteSwitcher from './WebsiteSwitcher';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
    setMobileOpen(false);
  };

  const isActive = (path) => location.pathname === path;

  const navLinks = isAuthenticated
    ? [
        { to: '/',          icon: <Search size={16} />,       label: 'Analyze'   },
        { to: '/dashboard', icon: <LayoutDashboard size={16}/>,label: 'Dashboard' },
        { to: '/local-seo', icon: <MapPin size={16} />,       label: 'Local SEO' },
        { to: '/settings',  icon: <Settings size={16} />,     label: 'Settings'  },
      ]
    : [{ to: '/', icon: <Search size={16} />, label: 'Analyze' }];

  return (
    <nav className="border-b border-dark-700 bg-dark-800/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-purple-500 rounded-lg flex items-center justify-center shadow-lg shadow-brand-500/30 group-hover:shadow-brand-500/50 transition-all">
              <Zap size={16} className="text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">
              <span className="text-white">SEO</span>
              <span className="gradient-text">Audit</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ to, icon, label }) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive(to)
                    ? 'bg-brand-500/20 text-brand-400'
                    : 'text-slate-400 hover:text-white hover:bg-dark-700'
                }`}
              >
                {icon}
                {label}
              </Link>
            ))}
          </div>

          {/* Website switcher */}
          <div className="hidden md:flex items-center">
            <WebsiteSwitcher />
          </div>

          {/* Auth buttons */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2.5 px-3 py-1.5 bg-dark-700 rounded-lg">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.name} className="w-6 h-6 rounded-full" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-xs font-bold text-white">
                      {user?.name?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm text-slate-300 font-medium max-w-[120px] truncate">{user?.name}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-all"
                >
                  <LogOut size={15} />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="btn-outline text-sm py-2 px-4">
                  Login
                </Link>
                <Link to="/register" className="btn-primary text-sm py-2 px-4">
                  Sign Up Free
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-dark-700 transition-all"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-dark-700 bg-dark-800 px-4 py-4 space-y-2 animate-fade-in">
          {navLinks.map(({ to, icon, label }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                isActive(to) ? 'bg-brand-500/20 text-brand-400' : 'text-slate-300 hover:bg-dark-700'
              }`}
            >
              {icon}
              {label}
            </Link>
          ))}
          {isAuthenticated ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm text-red-400 hover:bg-red-400/10 w-full text-left"
            >
              <LogOut size={15} /> Logout
            </button>
          ) : (
            <div className="flex gap-2 pt-2">
              <Link to="/login" onClick={() => setMobileOpen(false)} className="btn-outline text-sm flex-1 text-center">Login</Link>
              <Link to="/register" onClick={() => setMobileOpen(false)} className="btn-primary text-sm flex-1 text-center">Sign Up</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
