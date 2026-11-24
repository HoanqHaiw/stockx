import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { api, ApiError, fieldErrors } from '../../lib/api';
import { fmtMoney, toDateInput } from '../../lib/format';
import type { Material, Paged, Partner, PurchaseOrder } from '../../lib/types';
import { useWarehouses } from '../../hooks/lookups';
import { MaterialPicker } from '../../components/MaterialPicker';
import { Button, ErrorBanner, PageHeader, SelectInput, TextInput } from '../../components/ui';

interface LineState {
  key: number;
  material: Material | null;
  unitId: string;
  quantity: string;
  unitPrice: string;
}

let nextKey = 1;
const newLine = (): LineState => ({ key: nextKey++, material: null, unitId: '', quantity: '1', unitPrice: '0' });

/** Hệ số của đơn vị đã chọn so với đơn vị cơ sở. */
const factorOf = (m: Material, unitId: string) =>
  String(m.baseUnitId) === unitId ? 1 : Number(m.conversions.find((c) => String(c.unitId) === unitId)?.factor ?? 1);

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
  const [lines, setLines] = useState<LineState[]>([newLine()]);

  useEffect(() => {
    if (!existing) return;
    setHeader({
      supplierId: String(existing.supplierId),
      warehouseId: String(existing.warehouseId),
      expectedDate: toDateInput(existing.expectedDate),
      note: existing.note ?? '',
    });
    setLines(
      existing.lines.map((l) => ({
        key: nextKey++,
        material: l.material,
        unitId: String(l.unitId),
        quantity: String(Number(l.quantity)),
        unitPrice: String(Number(l.unitPrice)),
      })),
    );
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

  const updateLine = (key: number, patch: Partial<LineState>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function pickMaterial(key: number, m: Material) {
    updateLine(key, { material: m, unitId: String(m.baseUnitId), unitPrice: String(Number(m.purchasePrice)) });
  }
  function changeUnit(l: LineState, unitId: string) {
    // Đổi đơn vị thì gợi ý đơn giá theo giá mua của đơn vị cơ sở × hệ số.
    const price = l.material ? Math.round(Number(l.material.purchasePrice) * factorOf(l.material, unitId)) : 0;
    updateLine(l.key, { unitId, unitPrice: String(price) });
  }

  const total = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate({
      supplierId: Number(header.supplierId) || undefined,
      warehouseId: Number(header.warehouseId) || undefined,
      expectedDate: header.expectedDate || null,
      note: header.note,
      lines: lines
        .filter((l) => l.material)
        .map((l) => ({ materialId: l.material!.id, unitId: Number(l.unitId), quantity: l.quantity, unitPrice: l.unitPrice })),
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

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 font-medium">Vật tư đặt mua</div>
          <div className="divide-y divide-slate-100">
            {lines.map((l, i) => {
              const units = l.material
                ? [l.material.baseUnit, ...l.material.conversions.map((c) => c.unit)]
                : [];
              const factor = l.material ? factorOf(l.material, l.unitId) : 1;
              return (
                <div
                  key={l.key}
                  className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4 xl:grid-cols-[2rem_minmax(0,1fr)_8rem_7rem_9rem_9rem_2.5rem] xl:items-start"
                >
                  <div className="col-span-2 text-sm font-medium text-slate-400 sm:col-span-4 xl:col-span-1 xl:pt-2">Dòng {i + 1}</div>
                  <div className="col-span-2 sm:col-span-4 xl:col-span-1">
                    <MaterialPicker value={l.material} onChange={(m) => pickMaterial(l.key, m)} />
                    {l.material && factor !== 1 && (
                      <p className="mt-1 text-xs text-slate-500">
                        = {(Number(l.quantity || 0) * factor).toLocaleString('vi-VN')} {l.material.baseUnit.name.toLowerCase()}
                      </p>
                    )}
                  </div>
                  <select
                    aria-label="Đơn vị"
                    value={l.unitId}
                    onChange={(e) => changeUnit(l, e.target.value)}
                    disabled={!l.material}
                    className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm disabled:bg-slate-50"
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Số lượng"
                    type="number"
                    min={0}
                    step="any"
                    value={l.quantity}
                    onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                    className="rounded-md border border-slate-300 px-2 py-2 text-right text-sm"
                  />
                  <input
                    aria-label="Đơn giá"
                    type="number"
                    min={0}
                    value={l.unitPrice}
                    onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                    className="rounded-md border border-slate-300 px-2 py-2 text-right text-sm"
                  />
                  <div className="self-center text-right text-sm font-medium tabular-nums xl:self-start xl:pt-2">
                    {fmtMoney(Number(l.quantity || 0) * Number(l.unitPrice || 0))}
                  </div>
                  <button
                    type="button"
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    className="justify-self-end rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    aria-label="Xoá dòng"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
            <Button variant="ghost" onClick={() => setLines((ls) => [...ls, newLine()])}>
              <Plus className="size-4" /> Thêm dòng
            </Button>
            <div className="text-sm">
              Tổng cộng: <span className="text-lg font-semibold tabular-nums">{fmtMoney(total)} đ</span>
            </div>
          </div>
        </div>

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
