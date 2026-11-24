import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './auth/AuthContext';
import { AppLayout } from './layout/AppLayout';
import { navSections } from './layout/nav';
import { canAccess, type Role } from './lib/roles';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { MaterialsPage } from './pages/materials/MaterialsPage';
import { customerConfig, PartnersPage, supplierConfig } from './pages/partners/PartnersPage';
import { PurchaseOrderDetailPage } from './pages/purchasing/PurchaseOrderDetailPage';
import { PurchaseOrderFormPage } from './pages/purchasing/PurchaseOrderFormPage';
import { PurchaseOrdersPage } from './pages/purchasing/PurchaseOrdersPage';
import { ReceiptsPage } from './pages/stock/ReceiptsPage';
import { WarehousesPage } from './pages/WarehousesPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">Đang tải…</div>;
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

/** Chỉ hiển thị trang khi vai trò được phép (ADMIN luôn được). */
function Guard({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  return canAccess(user, roles) ? children : <Navigate to="/" replace />;
}

/** Trang của các mục menu đã làm xong; mục còn lại hiển thị "đang phát triển". */
const pages: Record<string, ReactNode> = {
  '/materials': <MaterialsPage />,
  '/suppliers': <PartnersPage key="suppliers" config={supplierConfig} />,
  '/customers': <PartnersPage key="customers" config={customerConfig} />,
  '/warehouses': <WarehousesPage />,
  '/purchase-orders': <PurchaseOrdersPage />,
  '/stock/receipts': <ReceiptsPage />,
};

const featurePages = navSections.flatMap((s) => s.items).filter((i) => i.to !== '/');

export function App() {
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
              element={<Guard roles={p.roles}>{pages[p.to] ?? <ComingSoonPage title={p.label} />}</Guard>}
            />
          ))}

          {/* Trang con không nằm trên menu */}
          <Route
            path="/purchase-orders/new"
            element={
              <Guard roles={['PURCHASING']}>
                <PurchaseOrderFormPage />
              </Guard>
            }
          />
          <Route
            path="/purchase-orders/:id/edit"
            element={
              <Guard roles={['PURCHASING']}>
                <PurchaseOrderFormPage />
              </Guard>
            }
          />
          <Route
            path="/purchase-orders/:id"
            element={
              <Guard roles={['PURCHASING', 'WAREHOUSE', 'ACCOUNTANT']}>
                <PurchaseOrderDetailPage />
              </Guard>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
