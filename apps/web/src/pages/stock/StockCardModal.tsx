import { useEffect, useState } from 'react';
import { t } from '../../i18n';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { fmtDate, fmtQty } from '../../lib/format';
import type { StockDocType } from '../../lib/types';
import { useWarehouses } from '../../hooks/lookups';
import { Button, Modal } from '../../components/ui';
import { StockDocumentModal } from './StockDocumentModal';

interface StockCard {
  material: { id: number; code: string; name: string; unit: string };
  warehouse: { id: number; name: string };
  opening: string;
  totalIn: string;
  totalOut: string;
  closing: string;
  rows: {
    id: string;
    createdAt: string;
    document: { id: number; code: string; type: StockDocType };
    partner: string;
    in: string;
    out: string;
    balance: string;
  }[];
}

const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('sv-SE'); // yyyy-mm-dd theo giờ máy
};

/** Thẻ kho: tồn đầu kỳ, từng lần nhập/xuất và tồn sau mỗi lần, tồn cuối kỳ. */
export function StockCardModal({
  materialId,
  initialWarehouseId,
  onClose,
}: {
  materialId: number | null;
  initialWarehouseId?: number;
  onClose: () => void;
}) {
  const { data: warehouses = [] } = useWarehouses(true);
  const [warehouseId, setWarehouseId] = useState<number | undefined>(initialWarehouseId);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState('');
  const [docId, setDocId] = useState<number | null>(null);

  useEffect(() => {
    if (materialId !== null) setWarehouseId(initialWarehouseId ?? warehouses[0]?.id);
  }, [materialId, initialWarehouseId, warehouses]);

  const params = new URLSearchParams({ materialId: String(materialId), warehouseId: String(warehouseId) });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const { data, isLoading } = useQuery({
    queryKey: ['stock', 'card', params.toString()],
    queryFn: () => api<StockCard>(`/stock/card?${params}`),
    enabled: materialId !== null && !!warehouseId,
  });
  const unit = data?.material.unit.toLowerCase() ?? '';

  return (
    <>
      <Modal
        open={materialId !== null}
        title={data ? t('Thẻ kho – {code} {name}', { code: data.material.code, name: data.material.name }) : t('Thẻ kho')}
        onClose={onClose}
        wide
        footer={<Button onClick={onClose}>{t('Đóng')}</Button>}
      >
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">{t('Kho')}</span>
            <select
              value={warehouseId ?? ''}
              onChange={(e) => setWarehouseId(Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">{t('Từ ngày')}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">{t('Đến ngày')}</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-2" />
          </label>
        </div>

        {isLoading || !data ? (
          <p className="text-sm text-slate-500">{t('Đang tải…')}</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[
                [t('Tồn đầu kỳ'), data.opening, ''],
                [t('Tổng nhập'), data.totalIn, 'text-emerald-700'],
                [t('Tổng xuất'), data.totalOut, 'text-red-700'],
                [t('Tồn cuối kỳ'), data.closing, 'font-semibold'],
              ].map(([label, v, cls]) => (
                <div key={label} className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className={`tabular-nums ${cls}`}>
                    {fmtQty(v)} {unit}
                  </div>
                </div>
              ))}
            </div>
            {data.rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">{t('Không có phát sinh trong kỳ.')}</p>
            ) : (
              <div className="max-h-[50vh] overflow-auto rounded-md border border-slate-200">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2">{t('Ngày')}</th>
                      <th className="px-3 py-2">{t('Chứng từ')}</th>
                      <th className="px-3 py-2">{t('Diễn giải')}</th>
                      <th className="px-3 py-2 text-right">{t('Nhập')}</th>
                      <th className="px-3 py-2 text-right">{t('Xuất')}</th>
                      <th className="px-3 py-2 text-right">{t('Tồn')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <button onClick={() => setDocId(r.document.id)} className="font-medium text-teal-700 hover:underline">
                            {r.document.code}
                          </button>
                        </td>
                        <td className="max-w-48 truncate px-3 py-2 text-slate-600">{r.partner}</td>
                        <td className="px-3 py-2 text-right text-emerald-700 tabular-nums">{Number(r.in) ? fmtQty(r.in) : ''}</td>
                        <td className="px-3 py-2 text-right text-red-700 tabular-nums">{Number(r.out) ? fmtQty(r.out) : ''}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtQty(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Modal>
      <StockDocumentModal id={docId} onClose={() => setDocId(null)} />
    </>
  );
}
