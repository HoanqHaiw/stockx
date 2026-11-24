import { useState } from 'react';
import { t } from '../../i18n';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtDate, fmtMoney } from '../../lib/format';
import { canAccess } from '../../lib/roles';
import {
  effectiveQuotationStatus,
  quotationStatusLabel,
  quotationStatusTone,
  soStatusLabel,
  soStatusTone,
  type Paged,
  type QuotationSummary,
  type SalesOrderSummary,
} from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { useDebounced } from '../../hooks/useDebounced';
import { Badge, Button, EmptyState, ErrorBanner, PageHeader, Pagination, SearchBox } from '../../components/ui';

const PAGE_SIZE = 20;

const config = {
  quotation: {
    resource: 'quotations',
    base: '/quotations',
    title: 'Báo giá',
    subtitle: 'Lập báo giá → gửi khách (tải Excel) → khách đồng ý thì chốt thành đơn bán',
    create: 'Lập báo giá',
    filters: [
      { key: '', label: 'Tất cả' },
      { key: 'DRAFT,SENT', label: 'Đang chờ khách' },
      { key: 'ACCEPTED', label: 'Đã chốt đơn' },
      { key: 'REJECTED', label: 'Khách từ chối' },
    ],
  },
  salesOrder: {
    resource: 'sales-orders',
    base: '/sales-orders',
    title: 'Đơn bán hàng',
    subtitle: 'Lập đơn → quản trị duyệt → thủ kho xuất kho giao hàng (có thể giao nhiều lần)',
    create: 'Tạo đơn bán',
    filters: [
      { key: '', label: 'Tất cả' },
      { key: 'DRAFT', label: 'Chờ duyệt' },
      { key: 'APPROVED,PARTIALLY_DELIVERED', label: 'Chờ giao hàng' },
      { key: 'DELIVERED', label: 'Đã giao đủ' },
      { key: 'CANCELLED', label: 'Đã huỷ' },
    ],
  },
} as const;

type Row = QuotationSummary | SalesOrderSummary;

export function SalesListPage({ kind }: { kind: keyof typeof config }) {
  const c = config[kind];
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debouncedQ = useDebounced(q);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (debouncedQ) params.set('q', debouncedQ);
  if (status) params.set('status', status);
  const { data, isLoading, error } = useQuery({
    queryKey: [c.resource, 'list', params.toString()],
    queryFn: () => api<Paged<Row>>(`/${c.resource}?${params}`),
    placeholderData: keepPreviousData,
  });

  function badge(row: Row) {
    if ('quoteDate' in row) {
      const s = effectiveQuotationStatus(row);
      return <Badge tone={quotationStatusTone[s]}>{quotationStatusLabel[s]}</Badge>;
    }
    return <Badge tone={soStatusTone[row.status]}>{soStatusLabel[row.status]}</Badge>;
  }
  function meta(row: Row) {
    if ('quoteDate' in row) return `${fmtDate(row.quoteDate)}${row.validUntil ? t(' · hiệu lực đến {date}', { date: fmtDate(row.validUntil) }) : ''}`;
    return `${fmtDate(row.orderDate)}${t(' · xuất từ {name}', { name: row.warehouse.name })}${row.deliveryDate ? t(' · giao {date}', { date: fmtDate(row.deliveryDate) }) : ''}`;
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={c.title}
        subtitle={c.subtitle}
        actions={
          canAccess(user, ['SALES']) && (
            <Link to={`${c.base}/new`}>
              <Button variant="primary">
                <Plus className="size-4" /> {t(c.create)}
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
          placeholder={t('Tìm số chứng từ, khách hàng…')}
        />
        <div className="flex flex-wrap gap-1">
          {c.filters.map((f) => (
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

      {error && <ErrorBanner message={t('Không tải được danh sách')} />}

      <div className="rounded-xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {data?.items.map((row) => (
            <li key={row.id}>
              <Link to={`${c.base}/${row.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-teal-700">{row.code}</span>
                    {badge(row)}
                  </div>
                  <div className="truncate text-sm">{row.customer.name}</div>
                  <div className="text-xs text-slate-500">{meta(row)}</div>
                </div>
                <div className="font-semibold tabular-nums">{fmtMoney(row.totalAmount)}{' '}{t('đ')}</div>
              </Link>
            </li>
          ))}
        </ul>
        {isLoading && <EmptyState>{t('Đang tải…')}</EmptyState>}
        {data && data.items.length === 0 && <EmptyState>{t('Chưa có dữ liệu phù hợp.')}</EmptyState>}
        {data && data.total > 0 && (
          <div className="border-t border-slate-100 px-3">
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
