import { useEffect, useState } from 'react';
import { t } from '../../i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { fmtQty, unitOf } from '../../lib/format';
import type { PurchaseOrder, StockDocument } from '../../lib/types';
import { Button, ErrorBanner, Modal, TextInput } from '../../components/ui';

/** Phần còn phải nhận của một dòng, tính theo đơn vị trên đơn mua. */
export const remainingInUnit = (l: PurchaseOrder['lines'][number]) =>
  Math.max(0, (Number(l.baseQuantity) - Number(l.receivedBaseQty)) / Number(l.factor));

/** Thủ kho nhập số thực nhận cho từng dòng; mặc định là toàn bộ phần còn lại. */
export function ReceiveModal({
  po,
  open,
  onClose,
  onDone,
}: {
  po: PurchaseOrder;
  open: boolean;
  onClose: () => void;
  onDone: (doc: StockDocument) => void;
}) {
  const qc = useQueryClient();
  const pending = po.lines.filter((l) => remainingInUnit(l) > 0);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setQty(Object.fromEntries(pending.map((l) => [l.id, String(Number(remainingInUnit(l).toFixed(3)))])));
      setNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, po]);

  const submit = useMutation({
    mutationFn: () =>
      api<StockDocument>(`/purchase-orders/${po.id}/receipts`, {
        method: 'POST',
        json: {
          note,
          lines: pending.map((l) => ({ purchaseOrderLineId: l.id, quantity: qty[l.id] || 0 })),
        },
      }),
    onSuccess: (doc) => {
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      void qc.invalidateQueries({ queryKey: ['stock'] });
      void qc.invalidateQueries({ queryKey: ['materials'] });
      onDone(doc);
    },
  });
  useEffect(() => {
    if (open) submit.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      title={t('Nhập kho theo đơn {code}', { code: po.code })}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('Huỷ')}</Button>
          <Button variant="primary" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? t('Đang ghi sổ…') : t('Xác nhận nhập kho')}
          </Button>
        </>
      }
    >
      {submit.error instanceof ApiError && <ErrorBanner message={submit.error.message} />}
      <p className="mb-3 text-sm text-slate-600">
        {t('Nhập vào')}{' '}<b>{po.warehouse.name}</b>{t('. Điền số lượng thực tế nhận được; để 0 với hàng chưa về.')}
      </p>
      <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {pending.map((l) => {
          const unit = unitOf(l.material, l.unitId);
          return (
            <div key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs text-slate-500">{l.material.code}</div>
                <div className="text-sm font-medium">{l.material.name}</div>
                <div className="text-xs text-slate-500">
                  {t('Đặt')}{' '}{fmtQty(l.quantity)}{' '}{t('· còn lại')}{' '}{fmtQty(remainingInUnit(l))} {unit.name.toLowerCase()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  aria-label={t('Số thực nhận {code}', { code: l.material.code })}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={qty[l.id] ?? ''}
                  onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
                  className="w-24 rounded-md border border-slate-300 px-2 py-2 text-right text-sm"
                />
                <span className="w-12 text-sm text-slate-500">{unit.name.toLowerCase()}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3">
        <TextInput label={t('Ghi chú')} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('VD: Xe biển số 29C-123.45, thiếu 1 cuộn')} />
      </div>
    </Modal>
  );
}
