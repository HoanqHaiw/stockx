import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Truck } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtDate, fmtMoney } from '../../lib/format';
import { soStatusLabel, soStatusTone, type Paged, type SalesOrderSummary, type StockDocumentSummary } from '../../lib/types';
import { useDebounced } from '../../hooks/useDebounced';
import { Badge, EmptyState, PageHeader, Pagination, SearchBox } from '../../components/ui';
import { StockDocumentModal } from './StockDocumentModal';

const PAGE_SIZE = 20;

/** Màn hình thủ kho khi giao hàng: đơn bán chờ xuất ở trên, lịch sử phiếu xuất ở dưới. */
export function IssuesPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState<number | null>(null);
  const debouncedQ = useDebounced(q);

  const { data: waiting } = useQuery({
    queryKey: ['sales-orders', 'waiting'],
    queryFn: () => api<Paged<SalesOrderSummary>>('/sales-orders?status=APPROVED,PARTIALLY_DELIVERED&pageSize=50'),
  });

  const params = new URLSearchParams({ type: 'ISSUE', page: String(page), pageSize: String(PAGE_SIZE) });
  if (debouncedQ) params.set('q', debouncedQ);
  const { data, isLoading } = useQuery({
    queryKey: ['stock', 'documents', 'list', params.toString()],
    queryFn: () => api<Paged<StockDocumentSummary>>(`/stock/documents?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Xuất kho" subtitle="Giao hàng theo đơn bán đã duyệt" />

      <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Truck className="size-4" /> Đơn chờ giao hàng
          {waiting && <Badge tone="teal">{waiting.total}</Badge>}
        </h2>
        <div className="rounded-xl border border-slate-200 bg-white">
          {waiting?.items.length === 0 && <EmptyState>Không có đơn nào đang chờ giao.</EmptyState>}
          <ul className="divide-y divide-slate-100">
            {waiting?.items.map((so) => (
              <li key={so.id}>
                <Link to={`/sales-orders/${so.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{so.code}</span>
                      <Badge tone={soStatusTone[so.status]}>{soStatusLabel[so.status]}</Badge>
                    </div>
                    <div className="truncate text-sm text-slate-600">{so.customer.name}</div>
                    <div className="text-xs text-slate-500">
                      Từ {so.warehouse.name}
                      {so.deliveryDate && ` · giao ${fmtDate(so.deliveryDate)}`}
                    </div>
                  </div>
                  <ChevronRight className="size-5 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Phiếu xuất đã ghi sổ</h2>
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Tìm số phiếu, số đơn, khách…"
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
                      {d.customer?.name ?? d.note ?? '—'}
                      {d.salesOrder && <span className="text-slate-500"> · {d.salesOrder.code}</span>}
                    </div>
                    <div className="text-xs text-slate-500">
                      {fmtDate(d.docDate)} · {d.warehouse.name} · {d._count.lines} dòng · {d.createdBy.fullName}
                    </div>
                  </div>
                  <span className="tabular-nums">{fmtMoney(d.totalAmount)} đ</span>
                </button>
              </li>
            ))}
          </ul>
          {isLoading && <EmptyState>Đang tải…</EmptyState>}
          {data && data.items.length === 0 && <EmptyState>Chưa có phiếu xuất.</EmptyState>}
          {data && data.total > 0 && (
            <div className="border-t border-slate-100 px-3">
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
            </div>
          )}
        </div>
      </section>

      <StockDocumentModal id={viewId} onClose={() => setViewId(null)} />
    </div>
  );
}
