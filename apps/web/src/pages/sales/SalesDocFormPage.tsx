import { useEffect, useState, type FormEvent } from 'react';
import { t } from '../../i18n';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api, ApiError, fieldErrors } from '../../lib/api';
import { toDateInput } from '../../lib/format';
import type { Paged, Partner, Quotation, SalesOrder } from '../../lib/types';
import { useWarehouses } from '../../hooks/lookups';
import { LinesEditor, lineFromApi, linesToApi, newLine, type LineState } from '../../components/LinesEditor';
import { Button, ErrorBanner, PageHeader, SelectInput, TextInput } from '../../components/ui';

type Kind = 'quotation' | 'salesOrder';
const cfg = {
  quotation: { resource: 'quotations', base: '/quotations', noun: 'báo giá', create: 'Lập báo giá' },
  salesOrder: { resource: 'sales-orders', base: '/sales-orders', noun: 'đơn bán', create: 'Tạo đơn bán hàng' },
} as const;

const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Form dùng chung cho báo giá và đơn bán: cùng khách hàng + dòng hàng theo giá bán. */
export function SalesDocFormPage({ kind }: { kind: Kind }) {
  const c = cfg[kind];
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: customers } = useQuery({
    queryKey: ['customers', 'all-active'],
    queryFn: () => api<Paged<Partner>>('/customers?pageSize=100'),
  });
  const { data: warehouses = [] } = useWarehouses();
  const { data: existing } = useQuery({
    queryKey: [c.resource, id],
    queryFn: () => api<Quotation | SalesOrder>(`/${c.resource}/${id}`),
    enabled: isEdit,
  });

  const [header, setHeader] = useState({
    customerId: '',
    warehouseId: '',
    date: kind === 'quotation' ? plusDays(15) : '', // hiệu lực báo giá / ngày giao
    note: '',
  });
  const [lines, setLines] = useState<LineState[]>(() => [newLine()]);

  useEffect(() => {
    if (!existing) return;
    setHeader({
      customerId: String(existing.customerId),
      warehouseId: 'warehouseId' in existing ? String(existing.warehouseId) : '',
      date: toDateInput('validUntil' in existing ? existing.validUntil : (existing as SalesOrder).deliveryDate),
      note: existing.note ?? '',
    });
    setLines(existing.lines.map(lineFromApi));
  }, [existing]);

  useEffect(() => {
    const main = warehouses.find((w) => w.type === 'MAIN') ?? warehouses[0];
    if (kind === 'salesOrder' && !isEdit && !header.warehouseId && main) {
      setHeader((h) => ({ ...h, warehouseId: String(main.id) }));
    }
  }, [kind, isEdit, header.warehouseId, warehouses]);

  const save = useMutation({
    mutationFn: (body: unknown) =>
      isEdit
        ? api<{ id: number }>(`/${c.resource}/${id}`, { method: 'PUT', json: body })
        : api<{ id: number }>(`/${c.resource}`, { method: 'POST', json: body }),
    onSuccess: (doc) => {
      void qc.invalidateQueries({ queryKey: [c.resource] });
      navigate(`${c.base}/${doc.id}`);
    },
  });
  const errors = fieldErrors(save.error);
  const general = save.error instanceof ApiError ? (errors.lines ?? save.error.message) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const common = { customerId: Number(header.customerId) || undefined, note: header.note, lines: linesToApi(lines) };
    save.mutate(
      kind === 'quotation'
        ? { ...common, validUntil: header.date || null }
        : { ...common, warehouseId: Number(header.warehouseId) || undefined, deliveryDate: header.date || null },
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link to={isEdit ? `${c.base}/${id}` : c.base} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" />{' '}{t('Quay lại')}
      </Link>
      <PageHeader title={isEdit ? t('Sửa {noun} {code}', { noun: t(c.noun), code: existing?.code ?? '' }) : c.create} />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {general && <ErrorBanner message={general} />}

        <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectInput
            label={t('Khách hàng')}
            required
            value={header.customerId}
            onChange={(e) => setHeader({ ...header, customerId: e.target.value })}
            error={errors.customerId}
          >
            <option value="">{t('— Chọn khách hàng —')}</option>
            {customers?.items.map((cu) => (
              <option key={cu.id} value={cu.id}>
                {cu.name}
              </option>
            ))}
          </SelectInput>
          {kind === 'salesOrder' && (
            <SelectInput
              label={t('Kho xuất')}
              required
              value={header.warehouseId}
              onChange={(e) => setHeader({ ...header, warehouseId: e.target.value })}
              error={errors.warehouseId}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </SelectInput>
          )}
          <TextInput
            label={kind === 'quotation' ? t('Hiệu lực đến') : t('Ngày giao dự kiến')}
            type="date"
            value={header.date}
            onChange={(e) => setHeader({ ...header, date: e.target.value })}
            error={errors.validUntil ?? errors.deliveryDate}
          />
          <div className={kind === 'quotation' ? 'sm:col-span-2' : ''}>
            <TextInput label={t('Ghi chú')} value={header.note} onChange={(e) => setHeader({ ...header, note: e.target.value })} />
          </div>
        </div>

        <LinesEditor
          lines={lines}
          onChange={setLines}
          priceField="salePrice"
          stockWarehouseId={kind === 'salesOrder' ? Number(header.warehouseId) || undefined : undefined}
          title={kind === 'quotation' ? t('Vật tư báo giá') : t('Vật tư bán')}
        />

        <div className="flex justify-end gap-2">
          <Button onClick={() => navigate(-1)}>{t('Huỷ')}</Button>
          <Button variant="primary" type="submit" disabled={save.isPending}>
            {save.isPending ? t('Đang lưu…') : isEdit ? t('Lưu thay đổi') : t('Lưu nháp')}
          </Button>
        </div>
      </form>
    </div>
  );
}
