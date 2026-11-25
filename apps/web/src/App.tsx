import { lazy, type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './auth/AuthContext';
import { AppLayout } from './layout/AppLayout';
import { navSections } from './layout/nav';
import { t } from './i18n';
import { canAccess, type Role } from './lib/roles';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { LoginPage } from './pages/LoginPage';

// Mỗi trang là một chunk riêng: lần đầu chỉ tải trang đăng nhập và khung ứng dụng.
const page = <T extends string>(load: () => Promise<Record<T, ComponentType<any>>>, name: T) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const DashboardPage = page(() => import('./pages/DashboardPage'), 'DashboardPage');
const DebtsPage = page(() => import('./pages/finance/DebtsPage'), 'DebtsPage');
const ReportsPage = page(() => import('./pages/finance/ReportsPage'), 'ReportsPage');
const MaterialsPage = page(() => import('./pages/materials/MaterialsPage'), 'MaterialsPage');
const PurchaseOrderDetailPage = page(() => import('./pages/purchasing/PurchaseOrderDetailPage'), 'PurchaseOrderDetailPage');
const PurchaseOrderFormPage = page(() => import('./pages/purchasing/PurchaseOrderFormPage'), 'PurchaseOrderFormPage');
const PurchaseOrdersPage = page(() => import('./pages/purchasing/PurchaseOrdersPage'), 'PurchaseOrdersPage');
const QuotationDetailPage = page(() => import('./pages/sales/QuotationDetailPage'), 'QuotationDetailPage');
const SalesDocFormPage = page(() => import('./pages/sales/SalesDocFormPage'), 'SalesDocFormPage');
const SalesListPage = page(() => import('./pages/sales/SalesListPage'), 'SalesListPage');
const SalesOrderDetailPage = page(() => import('./pages/sales/SalesOrderDetailPage'), 'SalesOrderDetailPage');
const IssuesPage = page(() => import('./pages/stock/IssuesPage'), 'IssuesPage');
const ReceiptsPage = page(() => import('./pages/stock/ReceiptsPage'), 'ReceiptsPage');
const StockBalancesPage = page(() => import('./pages/stock/StockBalancesPage'), 'StockBalancesPage');
const StockCountPage = page(() => import('./pages/stock/StockCountPage'), 'StockCountPage');
const StockDocListPage = page(() => import('./pages/stock/StockDocListPage'), 'StockDocListPage');
const TransferFormPage = page(() => import('./pages/stock/TransferFormPage'), 'TransferFormPage');
const WarehousesPage = page(() => import('./pages/WarehousesPage'), 'WarehousesPage');
const PartnersPage = page(() => import('./pages/partners/PartnersPage'), 'PartnersPage');

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">{t('Đang tải…')}</div>;
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
  '/suppliers': <PartnersPage key="suppliers" kind="supplier" />,
  '/customers': <PartnersPage key="customers" kind="customer" />,
  '/warehouses': <WarehousesPage />,
  '/purchase-orders': <PurchaseOrdersPage />,
  '/stock/receipts': <ReceiptsPage />,
  '/quotations': <SalesListPage key="quotations" kind="quotation" />,
  '/sales-orders': <SalesListPage key="sales-orders" kind="salesOrder" />,
  '/stock/issues': <IssuesPage />,
  '/stock/balances': <StockBalancesPage />,
  '/debts': <DebtsPage />,
  '/reports': <ReportsPage />,
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
