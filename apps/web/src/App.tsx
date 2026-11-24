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
import { QuotationDetailPage } from './pages/sales/QuotationDetailPage';
import { SalesDocFormPage } from './pages/sales/SalesDocFormPage';
import { SalesListPage } from './pages/sales/SalesListPage';
import { SalesOrderDetailPage } from './pages/sales/SalesOrderDetailPage';
import { IssuesPage } from './pages/stock/IssuesPage';
import { ReceiptsPage } from './pages/stock/ReceiptsPage';
import { StockBalancesPage } from './pages/stock/StockBalancesPage';
import { StockCountPage } from './pages/stock/StockCountPage';
import { StockDocListPage } from './pages/stock/StockDocListPage';
import { TransferFormPage } from './pages/stock/TransferFormPage';
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
  '/quotations': <SalesListPage key="quotations" kind="quotation" />,
  '/sales-orders': <SalesListPage key="sales-orders" kind="salesOrder" />,
  '/stock/issues': <IssuesPage />,
  '/stock/balances': <StockBalancesPage />,
  '/stock/transfers': (
    <StockDocListPage
      key="transfers"
      type="TRANSFER"
      title="Chuyển kho"
      subtitle="Chuyển hàng giữa kho tổng và kho công trình"
      createTo="/stock/transfers/new"
      createLabel="Chuyển kho"
    />
  ),
  '/stock/counts': (
    <StockDocListPage
      key="counts"
      type="ADJUSTMENT"
      title="Kiểm kê"
      subtitle="Đếm thực tế, hệ thống tự điều chỉnh phần chênh lệch so với sổ sách"
      createTo="/stock/counts/new"
      createLabel="Kiểm kê mới"
    />
  ),
};

/** Trang con không nằm trên menu: [đường dẫn, vai trò, trang]. */
const subPages: [string, Role[], ReactNode][] = [
  ['/purchase-orders/new', ['PURCHASING'], <PurchaseOrderFormPage key="po-new" />],
  ['/purchase-orders/:id/edit', ['PURCHASING'], <PurchaseOrderFormPage key="po-edit" />],
  ['/purchase-orders/:id', ['PURCHASING', 'WAREHOUSE', 'ACCOUNTANT'], <PurchaseOrderDetailPage />],
  ['/quotations/new', ['SALES'], <SalesDocFormPage key="q-new" kind="quotation" />],
  ['/quotations/:id/edit', ['SALES'], <SalesDocFormPage key="q-edit" kind="quotation" />],
  ['/quotations/:id', ['SALES', 'ACCOUNTANT'], <QuotationDetailPage />],
  ['/sales-orders/new', ['SALES'], <SalesDocFormPage key="so-new" kind="salesOrder" />],
  ['/sales-orders/:id/edit', ['SALES'], <SalesDocFormPage key="so-edit" kind="salesOrder" />],
  ['/sales-orders/:id', ['SALES', 'WAREHOUSE', 'ACCOUNTANT'], <SalesOrderDetailPage />],
  ['/stock/transfers/new', ['WAREHOUSE'], <TransferFormPage />],
  ['/stock/counts/new', ['WAREHOUSE'], <StockCountPage />],
];

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

          {subPages.map(([path, roles, page]) => (
            <Route key={path} path={path} element={<Guard roles={roles}>{page}</Guard>} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
