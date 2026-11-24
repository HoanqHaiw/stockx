import { useEffect, useState, type FormEvent } from 'react';
import { t } from '../i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus } from 'lucide-react';
import { api, ApiError, fieldErrors } from '../lib/api';
import type { Warehouse } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useWarehouses } from '../hooks/lookups';
import { Badge, Button, ErrorBanner, Modal, PageHeader, SelectInput, TextInput } from '../components/ui';

const typeLabel = { MAIN: 'Kho tổng', SITE: 'Kho công trình' } as const;

export function WarehousesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const qc = useQueryClient();
  const { data = [], isLoading } = useWarehouses(true);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const toggle = useMutation({
    mutationFn: (w: Warehouse) => api(`/master/warehouses/${w.id}/active`, { method: 'PATCH', json: { isActive: !w.isActive } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master', 'warehouses'] }),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Kho"
        subtitle={isAdmin ? undefined : t('Chỉ quản trị viên được thêm hoặc sửa kho')}
        actions={
          isAdmin && (
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />{' '}{t('Thêm kho')}
            </Button>
          )
        }
      />
      {toggle.error instanceof ApiError && <ErrorBanner message={toggle.error.message} />}
      {isLoading && <p className="text-sm text-slate-500">{t('Đang tải…')}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {data.map((w) => (
          <div key={w.id} className={`rounded-xl border bg-white p-4 ${w.isActive ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-70'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-xs text-slate-500">{w.code}</div>
                <div className="font-semibold">{w.name}</div>
              </div>
              <div className="flex gap-1">
                <Badge tone={w.type === 'MAIN' ? 'teal' : 'amber'}>{typeLabel[w.type]}</Badge>
                {!w.isActive && <Badge>{t('Ngừng')}</Badge>}
              </div>
            </div>
            {w.address && (
              <p className="mt-2 flex items-start gap-1 text-sm text-slate-500">
                <MapPin className="mt-0.5 size-3.5 shrink-0" /> {w.address}
              </p>
            )}
            {isAdmin && (
              <div className="mt-3 flex gap-2">
                <Button
                  className="px-2 py-1 text-xs"
                  onClick={() => {
                    setEditing(w);
                    setFormOpen(true);
                  }}
                >
                  {t('Sửa')}
                </Button>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => toggle.mutate(w)}>
                  {w.isActive ? t('Ngừng sử dụng') : t('Dùng lại')}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      <WarehouseFormModal open={formOpen} warehouse={editing} onClose={() => setFormOpen(false)} />
    </div>
  );
}

function WarehouseFormModal({ open, warehouse, onClose }: { open: boolean; warehouse: Warehouse | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ code: '', name: '', address: '', type: 'MAIN' as Warehouse['type'] });
  useEffect(() => {
    if (open) {
      setForm(
        warehouse
          ? { code: warehouse.code, name: warehouse.name, address: warehouse.address ?? '', type: warehouse.type }
          : { code: '', name: '', address: '', type: 'MAIN' },
      );
    }
  }, [open, warehouse]);

  const save = useMutation({
    mutationFn: () =>
      warehouse
        ? api(`/master/warehouses/${warehouse.id}`, { method: 'PUT', json: form })
        : api('/master/warehouses', { method: 'POST', json: form }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['master'] });
      onClose();
    },
  });
  useEffect(() => {
    if (open) save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const errors = fieldErrors(save.error);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Modal
      open={open}
      title={warehouse ? t('Sửa kho {code}', { code: warehouse.code }) : t('Thêm kho')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('Huỷ')}</Button>
          <Button variant="primary" type="submit" form="warehouse-form" disabled={save.isPending}>
            {t('Lưu')}
          </Button>
        </>
      }
    >
      <form id="warehouse-form" onSubmit={onSubmit} noValidate className="grid gap-4">
        {save.error instanceof ApiError && Object.keys(errors).length === 0 && <ErrorBanner message={save.error.message} />}
        <TextInput label={t('Mã kho')} required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} error={errors.code} />
        <TextInput label={t('Tên kho')} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
        <SelectInput label={t('Loại kho')} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Warehouse['type'] })}>
          <option value="MAIN">{t('Kho tổng')}</option>
          <option value="SITE">{t('Kho công trình')}</option>
        </SelectInput>
        <TextInput label={t('Địa chỉ')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} error={errors.address} />
      </form>
    </Modal>
  );
}
