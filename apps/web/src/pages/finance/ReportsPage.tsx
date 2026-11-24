import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, downloadFile } from '../../lib/api';
import { fmtMoney, fmtQty } from '../../lib/format';
import { useWarehouses } from '../../hooks/lookups';
import { Button, EmptyState, ErrorBanner, PageHeader } from '../../components/ui';

interface Movement {
  warehouse: { id: number; name: string } | null;
  items: { id: number; code: string; name: string; unit: string; opening: string; in: string; out: string; closing: string; closingValue: string }[];
  totalClosingValue: string;
}

const ymd = (d: Date) => d.toLocaleDateString('sv-SE');
const firstOfMonth = () => {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
};

/** Báo cáo nhập – xuất – tồn theo kỳ và kho, xem trên trang hoặc tải Excel. */
export function ReportsPage() {
  const { data: warehouses = [] } = useWarehouses();
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(ymd(new Date()));
  const [warehouseId, setWarehouseId] = useState('');

  const params = new URLSearchParams({ from, to });
  if (warehouseId) params.set('warehouseId', warehouseId);
  const valid = !!from && !!to && from <= to;

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'movement', params.toString()],
    queryFn: () => api<Movement>(`/reports/inventory-movement?${params}`),
    enabled: valid,
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Báo cáo nhập – xuất – tồn"
        subtitle={
          warehouseId
            ? 'Theo một kho: chuyển kho được tính là nhập/xuất của kho'
            : 'Tất cả kho: không tính chuyển kho nội bộ (không làm đổi tổng tồn)'
        }
        actions={
          <Button disabled={!valid} onClick={() => void downloadFile(`/reports/inventory-movement/excel?${params}`, 'nhap-xuat-ton.xlsx')}>
            <Download className="size-4" /> Xuất Excel
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Từ ngày</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Đến ngày</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Kho</span>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2">
            <option value="">Tất cả kho</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        {data && (
          <div className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-right">
            <div className="text-xs text-slate-500">Giá trị tồn cuối kỳ</div>
            <div className="font-semibold tabular-nums">{fmtMoney(data.totalClosingValue)} đ</div>
          </div>
        )}
      </div>

      {!valid && <ErrorBanner message="Ngày bắt đầu phải trước hoặc bằng ngày kết thúc" />}
      {error && <ErrorBanner message="Không tải được báo cáo" />}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Mã</th>
              <th className="px-4 py-2.5">Vật tư</th>
              <th className="px-4 py-2.5">ĐVT</th>
              <th className="px-4 py-2.5 text-right">Tồn đầu</th>
              <th className="px-4 py-2.5 text-right">Nhập</th>
              <th className="px-4 py-2.5 text-right">Xuất</th>
              <th className="px-4 py-2.5 text-right">Tồn cuối</th>
              <th className="px-4 py-2.5 text-right">Giá trị tồn cuối</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{r.code}</td>
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2 text-slate-600">{r.unit}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtQty(r.opening)}</td>
                <td className="px-4 py-2 text-right text-emerald-700 tabular-nums">{Number(r.in) ? fmtQty(r.in) : ''}</td>
                <td className="px-4 py-2 text-right text-red-700 tabular-nums">{Number(r.out) ? fmtQty(r.out) : ''}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{fmtQty(r.closing)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(r.closingValue)}</td>
              </tr>
            ))}
          </tbody>
          {data && data.items.length > 0 && (
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold">
              <tr>
                <td colSpan={4} className="px-4 py-2.5">
                  Tổng ({data.items.length} mã)
                </td>
                {/* Các mã khác đơn vị tính nên không cộng số lượng, chỉ cộng giá trị */}
                <td colSpan={3} />
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(data.totalClosingValue)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        {isLoading && <EmptyState>Đang tải…</EmptyState>}
        {data && data.items.length === 0 && <EmptyState>Không có phát sinh trong kỳ.</EmptyState>}
      </div>
    </div>
  );
}
