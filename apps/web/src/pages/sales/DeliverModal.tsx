import { useEffect, useState } from 'react';
import { t } from '../../i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { fmtQty, unitOf } from '../../lib/format';
import type { SalesOrder, ShortageItem, StockDocument } from '../../lib/types';
import { Button, ErrorBanner, Modal, TextInput } from '../../components/ui';

type Line = SalesOrder['lines'][number];
const remainingInUnit = (l: Line) => Math.max(0, (Number(l.baseQuantity) - Number(l.deliveredBaseQty)) / Number(l.factor));

/**
 * Thủ kho xác nhận số lượng giao. Hiển thị tồn hiện tại ở kho xuất,
 * mặc định giao tối đa có thể (phần còn lại, nhưng không vượt tồn).
 */
export function DeliverModal({
  so,
  open,
  onClose,
  onDone,
}: {
  so: SalesOrder;
  open: boolean;
  onClose: () => void;
  onDone: (doc: StockDocument) => void;
}) {
  const qc = useQueryClient();
  const pending = so.lines.filter((l) => remainingInUnit(l) > 0);
  const materialIds = [...new Set(pending.map((l) => l.materialId))];
  const [qty, setQty] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');

  const { data: stock } = useQuery({
    queryKey: ['stock', 'balances', so.warehouseId, materialIds.join(',')],
    queryFn: () =>
      api<{ materialId: number; quantity: string }[]>(
        `/stock/balances?warehouseId=${so.warehouseId}&materialIds=${materialIds.join(',')}`,
      ),
    enabled: open && materialIds.length > 0,
  });
  const stockOf = new Map(stock?.map((s) => [s.materialId, Number(s.quantity)]));

  // Gợi ý số giao khi tồn đã tải xong.
  useEffect(() => {
    if (!open || !stock) return;
    const left = new Map(stockOf);
    const init: Record<number, string> = {};
    for (const l of pending) {
      const canBase = Math.min(remainingInUnit(l) * Number(l.factor), left.get(l.materialId) ?? 0);
      left.set(l.materialId, (left.get(l.materialId) ?? 0) - canBase);
      init[l.id] = String(Number((canBase / Number(l.factor)).toFixed(3)));
    }
    setQty(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stock]);

  const submit = useMutation({
    mutationFn: () =>
      api<StockDocument>(`/sales-orders/${so.id}/deliveries`, {
        method: 'POST',
        json: { note, lines: pending.map((l) => ({ salesOrderLineId: l.id, quantity: qty[l.id] || 0 })) },
      }),
    onSuccess: (doc) => {
      for (const key of ['sales-orders', 'stock', 'materials']) void qc.invalidateQueries({ queryKey: [key] });
      onDone(doc);
    },
  });
  useEffect(() => {
    if (open) {
      submit.reset();
      setNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shortages = (submit.error instanceof ApiError && (submit.error.details as { items?: ShortageItem[] })?.items) || [];
  const codeToLine = new Map(pending.map((l) => [l.material.code, l]));

  return (
    <Modal
      open={open}
      title={t('Xuất kho giao đơn {code}', { code: so.code })}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('Huỷ')}</Button>
          <Button variant="primary" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? t('Đang ghi sổ…') : t('Xác nhận xuất kho')}
          </Button>
        </>
      }
    >
      {submit.error instanceof ApiError && <ErrorBanner message={submit.error.message} />}
      {shortages.length > 0 && (
        <ul className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {shortages.map((s) => {
            const l = codeToLine.get(s.materialCode);
            const base = l?.material.baseUnit.name.toLowerCase() ?? '';
            return (
              <li key={s.materialCode}>
                <b>{s.materialCode}</b>{t(': cần')}{' '}{fmtQty(s.required)} {base}{t(', kho chỉ còn')}{' '}{fmtQty(s.available)} {base}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mb-3 text-sm text-slate-600">
        {t('Xuất từ')}{' '}<b>{so.warehouse.name}</b> {t('cho')} <b>{so.customer.name}</b>{t('. Số gợi ý là tối đa có thể giao theo tồn hiện tại.')}
      </p>
      <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {pending.map((l) => {
          const unit = unitOf(l.material, l.unitId).name.toLowerCase();
          const available = stockOf.get(l.materialId);
          const want = Number(qty[l.id] || 0) * Number(l.factor);
          const short = available !== undefined && want > available + 1e-9;
          return (
            <div key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs text-slate-500">{l.material.code}</div>
                <div className="text-sm font-medium">{l.material.name}</div>
                <div className="text-xs text-slate-500">
                  {t('Đặt')}{' '}{fmtQty(l.quantity)}{' '}{t('· còn phải giao')}{' '}{fmtQty(remainingInUnit(l))} {unit}
                </div>
                <div className={`text-xs ${short ? 'font-medium text-red-600' : 'text-slate-500'}`}>
                  {short && <AlertTriangle className="mr-1 inline size-3" />}
                  {t('Tồn kho:')}{' '}{available === undefined ? '…' : `${fmtQty(available)} ${l.material.baseUnit.name.toLowerCase()}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  aria-label={t('Số giao {code}', { code: l.material.code })}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={qty[l.id] ?? ''}
                  onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
                  className={`w-24 rounded-md border px-2 py-2 text-right text-sm ${short ? 'border-red-400' : 'border-slate-300'}`}
                />
                <span className="w-12 text-sm text-slate-500">{unit}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3">
        <TextInput label={t('Ghi chú')} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('VD: Giao bằng xe 29C-123.45, người nhận anh Nam')} />
      </div>
    </Modal>
  );
}
