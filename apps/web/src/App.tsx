import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './auth/AuthContext';
import { AppLayout } from './layout/AppLayout';
import { navSections } from './layout/nav';
import { canAccess } from './lib/roles';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">Đang tải…</div>;
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

const featurePages = navSections.flatMap((s) => s.items).filter((i) => i.to !== '/');

export function App() {
  const { user } = useAuth();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          {featurePages.map((p) => (
            <Route
              key={p.to}
              path={p.to}
              element={canAccess(user, p.roles) ? <ComingSoonPage title={p.label} /> : <Navigate to="/" replace />}
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
