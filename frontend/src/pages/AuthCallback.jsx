import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from '../components/common/Loader';
import toast from 'react-hot-toast';
import api from '../services/api';

/**
 * Handles the redirect from Google OAuth.
 *
 * Flow:
 *  1. Extract JWT token from ?token= query param
 *  2. Store token + set axios header
 *  3. Fetch /auth/me to confirm the account is valid
 *  4. Fetch /websites to check if the user already has linked properties
 *  5a. Has websites  → go to /dashboard
 *  5b. No websites   → trigger /websites/discover (backend re-scans Google)
 *      5b-i.  Discovery found sites  → go to /dashboard
 *      5b-ii. Nothing found          → go to /settings so user can link manually
 */
export default function AuthCallback() {
  const [searchParams]          = useSearchParams();
  const { loginWithToken }      = useAuth();
  const navigate                = useNavigate();
  const [statusText, setStatus] = useState('Signing you in…');

  useEffect(() => {
    const run = async () => {
      const token = searchParams.get('token');
      const errorParam = searchParams.get('error');

      // ── Guard: OAuth error or missing token ─────────────────────────────
      if (errorParam || !token) {
        toast.error(
          errorParam === 'auth_failed'
            ? 'Google sign-in was cancelled or failed. Please try again.'
            : 'Authentication failed — no token received.'
        );
        navigate('/login', { replace: true });
        return;
      }

      try {
        // ── 1. Store token and authenticate all future requests ────────────
        localStorage.setItem('token', token);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        // Also update AuthContext user state (fires loadUser in background)
        loginWithToken(token);

        // ── 2. Verify account ──────────────────────────────────────────────
        setStatus('Loading your profile…');
        const { data: meData } = await api.get('/auth/me');
        const firstName = meData.user?.name?.split(' ')[0] || 'back';

        // ── 3. Check for existing websites ────────────────────────────────
        setStatus('Checking your websites…');
        const { data: wsData } = await api.get('/websites');
        const websites = wsData.websites || [];

        if (websites.length > 0) {
          // ── 5a. Has websites — go straight to dashboard ──────────────────
          toast.success(`Welcome back, ${firstName}!`);
          navigate('/dashboard', { replace: true });
          return;
        }

        // ── 5b. No websites — try to auto-discover from Google ────────────
        setStatus('Discovering your Google properties…');
        try {
          const { data: discovered } = await api.post('/websites/discover');
          const total = discovered.total ?? 0;

          if (total > 0) {
            toast.success(
              `Welcome, ${firstName}! Found ${total} website${total !== 1 ? 's' : ''}. Loading dashboard…`
            );
            navigate('/dashboard', { replace: true });
          } else {
            // Nothing found — send to Settings so the user can link manually
            toast(`Welcome, ${firstName}! Connect your Google Analytics & Search Console properties to get started.`, {
              icon: '🔗',
              duration: 6000,
            });
            navigate('/settings', { replace: true });
          }
        } catch {
          // Discovery failed (API quota, permission, etc.) — still go to dashboard
          toast.success(`Welcome, ${firstName}!`);
          navigate('/dashboard', { replace: true });
        }
      } catch (err) {
        // Token is invalid or network is down
        const msg = err.response?.data?.error || 'Failed to load your account.';
        toast.error(`${msg} Please sign in again.`);
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
        navigate('/login', { replace: true });
      }
    };

    run();
  }, []); // intentionally empty — runs once on mount

  return <PageLoader text={statusText} />;
}