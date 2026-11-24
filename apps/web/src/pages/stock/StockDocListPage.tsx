import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtDate, fmtMoney } from '../../lib/format';
import { canAccess } from '../../lib/roles';
import type { Paged, StockDocType, StockDocumentSummary } from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { useDebounced } from '../../hooks/useDebounced';
import { Button, EmptyState, PageHeader, Pagination, SearchBox } from '../../components/ui';
import { StockDocumentModal } from './StockDocumentModal';

const PAGE_SIZE = 20;

/** Danh sách phiếu chuyển kho / phiếu kiểm kê, kèm nút tạo mới cho thủ kho. */
export function StockDocListPage({
  type,
  title,
  subtitle,
  createTo,
  createLabel,
}: {
  type: StockDocType;
  title: string;
  subtitle: string;
  createTo: string;
  createLabel: string;
}) {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState<number | null>(null);
  const debouncedQ = useDebounced(q);

  const params = new URLSearchParams({ type, page: String(page), pageSize: String(PAGE_SIZE) });
  if (debouncedQ) params.set('q', debouncedQ);
  const { data, isLoading } = useQuery({
    queryKey: ['stock', 'documents', 'list', params.toString()],
    queryFn: () => api<Paged<StockDocumentSummary>>(`/stock/documents?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          canAccess(user, ['WAREHOUSE']) && (
            <Link to={createTo}>
              <Button variant="primary">
                <Plus className="size-4" /> {createLabel}
              </Button>
            </Link>
          )
        }
      />
      <div className="mb-3">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Tìm số phiếu…"
        />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {data?.items.map((d) => (
            <li key={d.id}>
              <button onClick={() => setViewId(d.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-teal-700">{d.code}</div>
                  <div className="truncate text-sm">
                    {d.toWarehouse ? `${d.warehouse.name} → ${d.toWarehouse.name}` : d.warehouse.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {fmtDate(d.docDate)} · {d._count.lines} dòng · {d.createdBy.fullName}
                    {d.note && ` · ${d.note}`}
                  </div>
                </div>
                <span className={`tabular-nums ${Number(d.totalAmount) < 0 ? 'text-red-600' : ''}`}>{fmtMoney(d.totalAmount)} đ</span>
              </button>
            </li>
          ))}
        </ul>
        {isLoading && <EmptyState>Đang tải…</EmptyState>}
        {data && data.items.length === 0 && <EmptyState>Chưa có phiếu nào.</EmptyState>}
        {data && data.total > 0 && (
          <div className="border-t border-slate-100 px-3">
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          </div>
        )}
      </div>
      <StockDocumentModal id={viewId} onClose={() => setViewId(null)} />
    </div>
  );
}
