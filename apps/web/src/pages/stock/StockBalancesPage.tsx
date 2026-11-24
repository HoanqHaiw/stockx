import { useState } from 'react';
import { t } from '../../i18n';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { fmtMoney, fmtQty } from '../../lib/format';
import { useDebounced } from '../../hooks/useDebounced';
import { useGroups, useWarehouses } from '../../hooks/lookups';
import { Badge, EmptyState, ErrorBanner, PageHeader, Pagination, SearchBox } from '../../components/ui';
import { StockCardModal } from './StockCardModal';

interface OverviewRow {
  id: number;
  code: string;
  name: string;
  specification: string | null;
  unitName: string;
  groupName: string;
  minStock: string;
  purchasePrice: string;
  quantity: string;
  value: string;
}
interface Overview {
  items: OverviewRow[];
  total: number;
  totalValue: string;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 30;

/** Bảng tồn kho theo từng kho hoặc tổng các kho; bấm một dòng để xem thẻ kho. */
export function StockBalancesPage() {
  const { data: warehouses = [] } = useWarehouses();
  const { data: groups = [] } = useGroups();
  const [warehouseId, setWarehouseId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [q, setQ] = useState('');
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [cardOf, setCardOf] = useState<number | null>(null);
  const debouncedQ = useDebounced(q);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (warehouseId) params.set('warehouseId', warehouseId);
  if (groupId) params.set('groupId', groupId);
  if (debouncedQ) params.set('q', debouncedQ);
  if (onlyInStock) params.set('onlyInStock', 'true');
  if (lowStock) params.set('lowStock', 'true');

  const { data, isLoading, error } = useQuery({
    queryKey: ['stock', 'overview', params.toString()],
    queryFn: () => api<Overview>(`/stock/overview?${params}`),
    placeholderData: keepPreviousData,
  });

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  // Cảnh báo tồn thấp chỉ có nghĩa khi xem tổng các kho (mức tối thiểu đặt cho toàn công ty).
  const isLow = (r: OverviewRow) => !warehouseId && Number(r.minStock) > 0 && Number(r.quantity) < Number(r.minStock);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t('Tồn kho')}
        subtitle={t('Bấm vào một vật tư để xem thẻ kho')}
        actions={
          data && (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-right">
              <div className="text-xs text-slate-500">{t('Giá trị tồn (giá mua)')}</div>
              <div className="font-semibold tabular-nums">{fmtMoney(data.totalValue)}{' '}{t('đ')}</div>
            </div>
          )
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Kho"
          value={warehouseId}
          onChange={(e) => reset(setWarehouseId)(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">{t('Tất cả kho')}</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <SearchBox value={q} onChange={reset(setQ)} placeholder={t('Tìm mã, tên vật tư…')} />
        <select
          aria-label={t('Nhóm')}
          value={groupId}
          onChange={(e) => reset(setGroupId)(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">{t('Tất cả nhóm')}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
          <input type="checkbox" checked={onlyInStock} onChange={(e) => reset(setOnlyInStock)(e.target.checked)} />
          {t('Chỉ mã còn hàng')}
        </label>
        {!warehouseId && (
          <label className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            <input type="checkbox" checked={lowStock} onChange={(e) => reset(setLowStock)(e.target.checked)} />
            {t('Dưới mức tối thiểu')}
          </label>
        )}
      </div>

      {error && <ErrorBanner message={t('Không tải được tồn kho')} />}

      <div className="rounded-xl border border-slate-200 bg-white">
        <table className="hidden w-full text-sm md:table">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2.5">{t('Mã')}</th>
              <th className="px-4 py-2.5">{t('Vật tư')}</th>
              <th className="px-4 py-2.5">{t('Nhóm')}</th>
              <th className="px-4 py-2.5 text-right">{t('Tồn')}</th>
              <th className="px-4 py-2.5">{t('ĐVT')}</th>
              <th className="px-4 py-2.5 text-right">{t('Giá trị')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.id} onClick={() => setCardOf(r.id)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{r.code}</td>
                <td className="px-4 py-2.5">
                  <div className="font-medium">{r.name}</div>
                  {r.specification && <div className="text-xs text-slate-500">{r.specification}</div>}
                </td>
                <td className="px-4 py-2.5 text-slate-600">{r.groupName}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                  {isLow(r) ? <Badge tone="red">{fmtQty(r.quantity)}</Badge> : fmtQty(r.quantity)}
                </td>
                <td className="px-4 py-2.5 text-slate-600">{r.unitName}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="divide-y divide-slate-100 md:hidden">
          {data?.items.map((r) => (
            <li key={r.id}>
              <button onClick={() => setCardOf(r.id)} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-slate-500">{r.code}</div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-slate-500">{fmtMoney(r.value)}{' '}{t('đ')}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-lg font-semibold tabular-nums ${isLow(r) ? 'text-red-600' : ''}`}>{fmtQty(r.quantity)}</div>
                  <div className="text-xs text-slate-500">{r.unitName.toLowerCase()}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>

        {isLoading && <EmptyState>{t('Đang tải…')}</EmptyState>}
        {data && data.items.length === 0 && <EmptyState>{t('Không có vật tư phù hợp.')}</EmptyState>}
        {data && data.total > 0 && (
          <div className="border-t border-slate-100 px-3">
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          </div>
        )}
      </div>

      <StockCardModal
        materialId={cardOf}
        initialWarehouseId={warehouseId ? Number(warehouseId) : undefined}
        onClose={() => setCardOf(null)}
      />
    </div>
  );
}
