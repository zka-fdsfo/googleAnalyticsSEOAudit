import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { WebsiteProvider } from './context/WebsiteContext';
import Navbar from './components/common/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import LocalSeo   from './pages/LocalSeo';
import AuditReport from './pages/AuditReport';
import Settings from './pages/Settings';
import GoogleDebug from './pages/GoogleDebug';
import AuthCallback from './pages/AuthCallback';
import ProtectedRoute from './components/common/ProtectedRoute';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <WebsiteProvider>
            <div className="min-h-screen bg-dark-900">
              <Navbar />
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Login mode="register" />} />
                <Route path="/audit/:id" element={<AuditReport />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/local-seo"
                  element={
                    <ProtectedRoute>
                      <LocalSeo />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings/google-debug"
                  element={
                    <ProtectedRoute>
                      <GoogleDebug />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </WebsiteProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1e293b',
                color: '#f1f5f9',
                border: '1px solid #334155',
                borderRadius: '10px',
              },
              success: { iconTheme: { primary: '#22c55e', secondary: '#1e293b' } },
              error: { iconTheme: { primary: '#ef4444', secondary: '#1e293b' } },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}