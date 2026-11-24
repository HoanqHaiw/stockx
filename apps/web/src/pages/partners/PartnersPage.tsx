import { useEffect, useState, type FormEvent } from 'react';
import { t } from '../../i18n';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, ApiError, fieldErrors } from '../../lib/api';
import { canAccess, type Role } from '../../lib/roles';
import type { Paged, Partner } from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { useDebounced } from '../../hooks/useDebounced';
import { Badge, Button, EmptyState, ErrorBanner, Modal, PageHeader, Pagination, SearchBox, TextInput } from '../../components/ui';

const PAGE_SIZE = 20;

interface Config {
  resource: 'suppliers' | 'customers';
  title: string;
  noun: string; // "nhà cung cấp" / "khách hàng"
  codeHint: string;
  writeRoles: Role[];
}

export const supplierConfig: Config = {
  resource: 'suppliers',
  title: 'Nhà cung cấp',
  noun: 'nhà cung cấp',
  codeHint: 'VD: NCC-CDV',
  writeRoles: ['PURCHASING'],
};
export const customerConfig: Config = {
  resource: 'customers',
  title: 'Khách hàng',
  noun: 'khách hàng',
  codeHint: 'VD: KH-XDHN',
  writeRoles: ['SALES'],
};

/** Trang danh sách dùng chung cho nhà cung cấp và khách hàng. */
export function PartnersPage({ config }: { config: Config }) {
  const { user } = useAuth();
  const canEdit = canAccess(user, config.writeRoles);
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [active, setActive] = useState<'true' | 'all'>('true');
  const [page, setPage] = useState(1);
  const debouncedQ = useDebounced(q);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), active });
  if (debouncedQ) params.set('q', debouncedQ);
  const { data, isLoading, error } = useQuery({
    queryKey: [config.resource, params.toString()],
    queryFn: () => api<Paged<Partner>>(`/${config.resource}?${params}`),
    placeholderData: keepPreviousData,
  });

  const toggleActive = useMutation({
    mutationFn: (p: Partner) =>
      api(`/${config.resource}/${p.id}/active`, { method: 'PATCH', json: { isActive: !p.isActive } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [config.resource] }),
  });

  const open = (p: Partner | null) => {
    setEditing(p);
    setFormOpen(true);
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={config.title}
        actions={
          canEdit && (
            <Button variant="primary" onClick={() => open(null)}>
              <Plus className="size-4" />{' '}{t('Thêm')}{' '}{t(config.noun)}
            </Button>
          )
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder={t('Tìm mã, tên, MST, SĐT…')}
        />
        <select
          aria-label={t('Lọc theo trạng thái')}
          value={active}
          onChange={(e) => {
            setActive(e.target.value as 'true' | 'all');
            setPage(1);
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="true">{t('Đang giao dịch')}</option>
          <option value="all">{t('Tất cả')}</option>
        </select>
      </div>

      {error && <ErrorBanner message={t('Không tải được danh sách {noun}', { noun: t(config.noun) })} />}

      <div className="rounded-xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {data?.items.map((p) => (
            <li key={p.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
              <button onClick={() => open(p)} className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{p.code}</span>
                  {!p.isActive && <Badge>{t('Ngừng giao dịch')}</Badge>}
                </div>
                <div className="font-medium">{p.name}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-slate-500">
                  {p.taxCode && <span>{t('MST')}: {p.taxCode}</span>}
                  {p.phone && <span>{t('SĐT:')}{' '}{p.phone}</span>}
                  {p.email && <span>{p.email}</span>}
                </div>
              </button>
              {canEdit && (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => toggleActive.mutate(p)}>
                  {p.isActive ? t('Ngừng') : t('Dùng lại')}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {isLoading && <EmptyState>{t('Đang tải…')}</EmptyState>}
        {data && data.items.length === 0 && <EmptyState>{t('Không có')}{' '}{t(config.noun)}{' '}{t('phù hợp.')}</EmptyState>}
        {data && data.total > 0 && (
          <div className="border-t border-slate-100 px-3">
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          </div>
        )}
      </div>

      <PartnerFormModal
        config={config}
        open={formOpen}
        partner={editing}
        readOnly={!canEdit}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}

const emptyForm = { code: '', name: '', taxCode: '', phone: '', email: '', address: '' };

function PartnerFormModal({
  config,
  open,
  partner,
  readOnly,
  onClose,
}: {
  config: Config;
  open: boolean;
  partner: Partner | null;
  readOnly: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  useEffect(() => {
    if (!open) return;
    setForm(
      partner
        ? {
            code: partner.code,
            name: partner.name,
            taxCode: partner.taxCode ?? '',
            phone: partner.phone ?? '',
            email: partner.email ?? '',
            address: partner.address ?? '',
          }
        : emptyForm,
    );
  }, [open, partner]);

  const save = useMutation({
    mutationFn: () =>
      partner
        ? api(`/${config.resource}/${partner.id}`, { method: 'PUT', json: form })
        : api(`/${config.resource}`, { method: 'POST', json: form }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.resource] });
      void qc.invalidateQueries({ queryKey: ['master', 'summary'] });
      onClose();
    },
  });
  // Đóng rồi mở lại thì không còn hiện lỗi cũ.
  useEffect(() => {
    if (open) save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const errors = fieldErrors(save.error);
  const general = save.error instanceof ApiError && Object.keys(errors).length === 0 ? save.error.message : null;
  const bind = (key: keyof typeof emptyForm) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value })),
    error: errors[key],
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Modal
      open={open}
      title={readOnly ? t('Thông tin {noun}', { noun: t(config.noun) }) : partner ? t('Sửa {noun} {code}', { noun: t(config.noun), code: partner.code }) : t('Thêm {noun}', { noun: t(config.noun) })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{readOnly ? t('Đóng') : t('Huỷ')}</Button>
          {!readOnly && (
            <Button variant="primary" type="submit" form="partner-form" disabled={save.isPending}>
              {save.isPending ? t('Đang lưu…') : t('Lưu')}
            </Button>
          )}
        </>
      }
    >
      <form id="partner-form" onSubmit={onSubmit} noValidate>
        {general && <ErrorBanner message={general} />}
        <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
          <TextInput label={t('Mã')} required placeholder={t(config.codeHint)} {...bind('code')} />
          <TextInput label={t('Mã số thuế')} inputMode="numeric" {...bind('taxCode')} />
          <div className="sm:col-span-2">
            <TextInput label={t('Tên')} required {...bind('name')} />
          </div>
          <TextInput label={t('Số điện thoại')} type="tel" {...bind('phone')} />
          <TextInput label="Email" type="email" {...bind('email')} />
          <div className="sm:col-span-2">
            <TextInput label={t('Địa chỉ')} {...bind('address')} />
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
