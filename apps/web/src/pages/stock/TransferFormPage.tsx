import { useEffect, useState, type FormEvent } from 'react';
import { t } from '../../i18n';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { api, ApiError, fieldErrors } from '../../lib/api';
import { fmtQty } from '../../lib/format';
import type { ShortageItem, StockDocument } from '../../lib/types';
import { useWarehouses } from '../../hooks/lookups';
import { LinesEditor, newLine, type LineState } from '../../components/LinesEditor';
import { Button, ErrorBanner, PageHeader, SelectInput, TextInput } from '../../components/ui';

/** Chuyển hàng giữa các kho, VD từ kho tổng ra kho công trình. Ghi sổ ngay khi lưu. */
export function TransferFormPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: warehouses = [] } = useWarehouses();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<LineState[]>(() => [newLine()]);

  useEffect(() => {
    if (from || warehouses.length < 2) return;
    const main = warehouses.find((w) => w.type === 'MAIN') ?? warehouses[0];
    const site = warehouses.find((w) => w.type === 'SITE' && w.id !== main.id) ?? warehouses.find((w) => w.id !== main.id)!;
    setFrom(String(main.id));
    setTo(String(site.id));
  }, [from, warehouses]);

  const save = useMutation({
    mutationFn: () =>
      api<StockDocument>('/stock/transfers', {
        method: 'POST',
        json: {
          fromWarehouseId: Number(from) || undefined,
          toWarehouseId: Number(to) || undefined,
          note,
          lines: lines
            .filter((l) => l.material)
            .map((l) => ({ materialId: l.material!.id, unitId: Number(l.unitId), quantity: l.quantity })),
        },
      }),
    onSuccess: () => {
      for (const key of ['stock', 'materials']) void qc.invalidateQueries({ queryKey: [key] });
      navigate('/stock/transfers');
    },
  });
  const errors = fieldErrors(save.error);
  const shortages = (save.error instanceof ApiError && (save.error.details as { items?: ShortageItem[] })?.items) || [];
  const general = save.error instanceof ApiError ? (errors.lines ?? (errors.toWarehouseId ? null : save.error.message)) : null;
  const unitOfCode = new Map(lines.filter((l) => l.material).map((l) => [l.material!.code, l.material!.baseUnit.name.toLowerCase()]));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/stock/transfers" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" />{' '}{t('Chuyển kho')}
      </Link>
      <PageHeader title={t('Phiếu chuyển kho')} subtitle={t('Hàng được trừ ở kho xuất và cộng vào kho nhận ngay khi lưu')} />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {general && <ErrorBanner message={general} />}
        {shortages.length > 0 && (
          <ul className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {shortages.map((s) => (
              <li key={s.materialCode}>
                <b>{s.materialCode}</b>{t(': cần')}{' '}{fmtQty(s.required)} {unitOfCode.get(s.materialCode)}{t(', kho xuất chỉ còn')}{' '}
                {fmtQty(s.available)}
              </li>
            ))}
          </ul>
        )}

        <div className="grid items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto_1fr]">
          <SelectInput label={t('Kho xuất')} required value={from} onChange={(e) => setFrom(e.target.value)} error={errors.fromWarehouseId}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </SelectInput>
          <ArrowRight className="mx-auto hidden size-5 text-slate-400 sm:mb-2.5 sm:block" />
          <SelectInput label={t('Kho nhận')} required value={to} onChange={(e) => setTo(e.target.value)} error={errors.toWarehouseId}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </SelectInput>
          <div className="sm:col-span-3">
            <TextInput label={t('Ghi chú')} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('VD: Cấp hàng cho tầng 5 – 7')} />
          </div>
        </div>

        <LinesEditor
          lines={lines}
          onChange={setLines}
          priceField="purchasePrice"
          stockWarehouseId={Number(from) || undefined}
          showPrice={false}
          title={t('Vật tư chuyển')}
        />

        <div className="flex justify-end gap-2">
          <Button onClick={() => navigate(-1)}>{t('Huỷ')}</Button>
          <Button variant="primary" type="submit" disabled={save.isPending}>
            {save.isPending ? t('Đang ghi sổ…') : t('Chuyển kho')}
          </Button>
        </div>
      </form>
    </div>
  );
}
