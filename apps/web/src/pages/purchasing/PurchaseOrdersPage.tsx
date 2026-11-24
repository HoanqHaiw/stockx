import { useState } from 'react';
import { t } from '../../i18n';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtDate, fmtMoney } from '../../lib/format';
import { canAccess } from '../../lib/roles';
import { poStatusLabel, poStatusTone, type Paged, type PoStatus, type PurchaseOrderSummary } from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { useDebounced } from '../../hooks/useDebounced';
import { Badge, Button, EmptyState, ErrorBanner, PageHeader, Pagination, SearchBox } from '../../components/ui';

const PAGE_SIZE = 20;
const filters: { key: string; label: string }[] = [
  { key: '', label: 'Tất cả' },
  { key: 'DRAFT', label: 'Chờ duyệt' },
  { key: 'APPROVED,PARTIALLY_RECEIVED', label: 'Chờ nhận hàng' },
  { key: 'RECEIVED', label: 'Đã nhận đủ' },
  { key: 'CANCELLED', label: 'Đã huỷ' },
];

export function PurchaseOrdersPage() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debouncedQ = useDebounced(q);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (debouncedQ) params.set('q', debouncedQ);
  if (status) params.set('status', status);
  const { data, isLoading, error } = useQuery({
    queryKey: ['purchase-orders', 'list', params.toString()],
    queryFn: () => api<Paged<PurchaseOrderSummary>>(`/purchase-orders?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t('Đơn mua hàng')}
        subtitle={t('Lập đơn → quản trị duyệt → thủ kho nhập kho (có thể nhận nhiều lần)')}
        actions={
          canAccess(user, ['PURCHASING']) && (
            <Link to="/purchase-orders/new">
              <Button variant="primary">
                <Plus className="size-4" />{' '}{t('Tạo đơn mua')}
              </Button>
            </Link>
          )
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder={t('Tìm số đơn, nhà cung cấp…')}
        />
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setStatus(f.key);
                setPage(1);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                status === f.key ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
              }`}
            >
              {t(f.label)}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorBanner message={t('Không tải được danh sách đơn mua')} />}

      <div className="rounded-xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {data?.items.map((po) => (
            <li key={po.id}>
              <Link to={`/purchase-orders/${po.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-teal-700">{po.code}</span>
                    <Badge tone={poStatusTone[po.status as PoStatus]}>{poStatusLabel[po.status as PoStatus]}</Badge>
                  </div>
                  <div className="truncate text-sm">{po.supplier.name}</div>
                  <div className="text-xs text-slate-500">
                    {fmtDate(po.orderDate)}{' '}{t('· nhận tại')}{' '}{po.warehouse.name}
                    {po.expectedDate && t(' · dự kiến {date}', { date: fmtDate(po.expectedDate) })}
                  </div>
                </div>
                <div className="font-semibold tabular-nums">{fmtMoney(po.totalAmount)}{' '}{t('đ')}</div>
              </Link>
            </li>
          ))}
        </ul>
        {isLoading && <EmptyState>{t('Đang tải…')}</EmptyState>}
        {data && data.items.length === 0 && <EmptyState>{t('Chưa có đơn mua phù hợp.')}</EmptyState>}
        {data && data.total > 0 && (
          <div className="border-t border-slate-100 px-3">
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
