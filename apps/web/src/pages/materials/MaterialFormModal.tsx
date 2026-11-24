import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError, fieldErrors } from '../../lib/api';
import type { Material } from '../../lib/types';
import { useGroups, useUnits } from '../../hooks/lookups';
import { Button, ErrorBanner, Field, Modal, SelectInput, TextInput } from '../../components/ui';

interface FormState {
  code: string;
  name: string;
  specification: string;
  groupId: string;
  baseUnitId: string;
  purchasePrice: string;
  salePrice: string;
  minStock: string;
  conversions: { unitId: string; factor: string }[];
}

const empty: FormState = {
  code: '',
  name: '',
  specification: '',
  groupId: '',
  baseUnitId: '',
  purchasePrice: '0',
  salePrice: '0',
  minStock: '0',
  conversions: [],
};

const fromMaterial = (m: Material): FormState => ({
  code: m.code,
  name: m.name,
  specification: m.specification ?? '',
  groupId: String(m.groupId),
  baseUnitId: String(m.baseUnitId),
  purchasePrice: String(Number(m.purchasePrice)),
  salePrice: String(Number(m.salePrice)),
  minStock: String(Number(m.minStock)),
  conversions: m.conversions.map((c) => ({ unitId: String(c.unitId), factor: String(Number(c.factor)) })),
});

export function MaterialFormModal({
  open,
  material,
  readOnly,
  onClose,
}: {
  open: boolean;
  material: Material | null; // null = tạo mới
  readOnly: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: units = [] } = useUnits();
  const { data: groups = [] } = useGroups();
  const [form, setForm] = useState<FormState>(empty);

  useEffect(() => {
    if (open) setForm(material ? fromMaterial(material) : empty);
  }, [open, material]);

  const save = useMutation({
    mutationFn: (body: unknown) =>
      material
        ? api<Material>(`/materials/${material.id}`, { method: 'PUT', json: body })
        : api<Material>('/materials', { method: 'POST', json: body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['materials'] });
      onClose();
    },
  });
  const errors = fieldErrors(save.error);
  const generalError =
    save.error instanceof ApiError && Object.keys(errors).length === 0 ? save.error.message : null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const baseUnit = units.find((u) => String(u.id) === form.baseUnitId);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate({
      ...form,
      groupId: Number(form.groupId) || undefined,
      baseUnitId: Number(form.baseUnitId) || undefined,
      conversions: form.conversions
        .filter((c) => c.unitId)
        .map((c) => ({ unitId: Number(c.unitId), factor: c.factor })),
    });
  }

  const title = readOnly ? 'Thông tin vật tư' : material ? `Sửa vật tư ${material.code}` : 'Thêm vật tư';

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>{readOnly ? 'Đóng' : 'Huỷ'}</Button>
          {!readOnly && (
            <Button variant="primary" type="submit" form="material-form" disabled={save.isPending}>
              {save.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          )}
        </>
      }
    >
      <form id="material-form" onSubmit={onSubmit} noValidate>
        {generalError && <ErrorBanner message={generalError} />}
        <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Mã vật tư"
            required
            value={form.code}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
            error={errors.code}
            placeholder="VD: DC-CV2.5"
          />
          <TextInput label="Tên vật tư" required value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
          <TextInput
            label="Quy cách"
            value={form.specification}
            onChange={(e) => set('specification', e.target.value)}
            error={errors.specification}
          />
          <SelectInput label="Nhóm vật tư" required value={form.groupId} onChange={(e) => set('groupId', e.target.value)} error={errors.groupId}>
            <option value="">— Chọn nhóm —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            label="Đơn vị tính cơ sở"
            required
            value={form.baseUnitId}
            onChange={(e) => set('baseUnitId', e.target.value)}
            error={errors.baseUnitId}
          >
            <option value="">— Chọn ĐVT —</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </SelectInput>
          <TextInput
            label="Tồn tối thiểu"
            type="number"
            min={0}
            step="any"
            value={form.minStock}
            onChange={(e) => set('minStock', e.target.value)}
            error={errors.minStock}
            hint={baseUnit ? `Theo ${baseUnit.name.toLowerCase()}` : undefined}
          />
          <TextInput
            label="Giá mua (đ)"
            type="number"
            min={0}
            value={form.purchasePrice}
            onChange={(e) => set('purchasePrice', e.target.value)}
            error={errors.purchasePrice}
          />
          <TextInput
            label="Giá bán (đ)"
            type="number"
            min={0}
            value={form.salePrice}
            onChange={(e) => set('salePrice', e.target.value)}
            error={errors.salePrice}
          />

          <div className="sm:col-span-2">
            <Field label="Quy đổi đơn vị" error={errors.conversions}>
              <div className="space-y-2">
                {form.conversions.length === 0 && (
                  <p className="text-sm text-slate-500">Chưa có. Ví dụ: 1 cuộn = 100 mét.</p>
                )}
                {form.conversions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">1</span>
                    <select
                      aria-label="Đơn vị quy đổi"
                      value={c.unitId}
                      onChange={(e) =>
                        set('conversions', form.conversions.map((x, j) => (j === i ? { ...x, unitId: e.target.value } : x)))
                      }
                      className="w-32 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
                    >
                      <option value="">— ĐVT —</option>
                      {units
                        .filter((u) => String(u.id) !== form.baseUnitId)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                    <span className="text-sm text-slate-500">=</span>
                    <input
                      aria-label="Hệ số quy đổi"
                      type="number"
                      min={0}
                      step="any"
                      value={c.factor}
                      onChange={(e) =>
                        set('conversions', form.conversions.map((x, j) => (j === i ? { ...x, factor: e.target.value } : x)))
                      }
                      className="w-24 rounded-md border border-slate-300 px-2 py-2 text-sm"
                    />
                    <span className="text-sm text-slate-500">{baseUnit?.name.toLowerCase() ?? 'ĐVT cơ sở'}</span>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => set('conversions', form.conversions.filter((_, j) => j !== i))}
                        className="ml-auto rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Xoá quy đổi"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <Button
                    variant="ghost"
                    className="px-2"
                    onClick={() => set('conversions', [...form.conversions, { unitId: '', factor: '1' }])}
                  >
                    <Plus className="size-4" /> Thêm quy đổi
                  </Button>
                )}
              </div>
            </Field>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
