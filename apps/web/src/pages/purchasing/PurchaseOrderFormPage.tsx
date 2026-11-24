import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api, ApiError, fieldErrors } from '../../lib/api';
import { toDateInput } from '../../lib/format';
import type { Paged, Partner, PurchaseOrder } from '../../lib/types';
import { useWarehouses } from '../../hooks/lookups';
import { LinesEditor, lineFromApi, linesToApi, newLine, type LineState } from '../../components/LinesEditor';
import { Button, ErrorBanner, PageHeader, SelectInput, TextInput } from '../../components/ui';

export function PurchaseOrderFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'all-active'],
    queryFn: () => api<Paged<Partner>>('/suppliers?pageSize=100'),
  });
  const { data: warehouses = [] } = useWarehouses();
  const { data: existing } = useQuery({
    queryKey: ['purchase-orders', id],
    queryFn: () => api<PurchaseOrder>(`/purchase-orders/${id}`),
    enabled: isEdit,
  });

  const [header, setHeader] = useState({ supplierId: '', warehouseId: '', expectedDate: '', note: '' });
  const [lines, setLines] = useState<LineState[]>(() => [newLine()]);

  useEffect(() => {
    if (!existing) return;
    setHeader({
      supplierId: String(existing.supplierId),
      warehouseId: String(existing.warehouseId),
      expectedDate: toDateInput(existing.expectedDate),
      note: existing.note ?? '',
    });
    setLines(existing.lines.map(lineFromApi));
  }, [existing]);

  // Mặc định nhận về kho tổng đầu tiên khi tạo mới.
  useEffect(() => {
    const main = warehouses.find((w) => w.type === 'MAIN') ?? warehouses[0];
    if (!isEdit && !header.warehouseId && main) {
      setHeader((h) => ({ ...h, warehouseId: String(main.id) }));
    }
  }, [isEdit, header.warehouseId, warehouses]);

  const save = useMutation({
    mutationFn: (body: unknown) =>
      isEdit
        ? api<PurchaseOrder>(`/purchase-orders/${id}`, { method: 'PUT', json: body })
        : api<PurchaseOrder>('/purchase-orders', { method: 'POST', json: body }),
    onSuccess: (po) => {
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      navigate(`/purchase-orders/${po.id}`);
    },
  });
  const errors = fieldErrors(save.error);
  const general = save.error instanceof ApiError ? (errors.lines ?? save.error.message) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate({
      supplierId: Number(header.supplierId) || undefined,
      warehouseId: Number(header.warehouseId) || undefined,
      expectedDate: header.expectedDate || null,
      note: header.note,
      lines: linesToApi(lines),
    });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link to={isEdit ? `/purchase-orders/${id}` : '/purchase-orders'} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Quay lại
      </Link>
      <PageHeader title={isEdit ? `Sửa đơn ${existing?.code ?? ''}` : 'Tạo đơn mua hàng'} />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {general && <ErrorBanner message={general} />}

        <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectInput
            label="Nhà cung cấp"
            required
            value={header.supplierId}
            onChange={(e) => setHeader({ ...header, supplierId: e.target.value })}
            error={errors.supplierId}
          >
            <option value="">— Chọn nhà cung cấp —</option>
            {suppliers?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            label="Kho nhận"
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
          <TextInput
            label="Ngày dự kiến nhận"
            type="date"
            value={header.expectedDate}
            onChange={(e) => setHeader({ ...header, expectedDate: e.target.value })}
            error={errors.expectedDate}
          />
          <TextInput label="Ghi chú" value={header.note} onChange={(e) => setHeader({ ...header, note: e.target.value })} />
        </div>

        <LinesEditor lines={lines} onChange={setLines} priceField="purchasePrice" title="Vật tư đặt mua" />

        <div className="flex justify-end gap-2">
          <Button onClick={() => navigate(-1)}>Huỷ</Button>
          <Button variant="primary" type="submit" disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : 'Lưu đơn nháp'}
          </Button>
        </div>
      </form>
    </div>
  );
}
