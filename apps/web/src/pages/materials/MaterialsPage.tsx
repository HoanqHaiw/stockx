import { useState } from 'react';
import { t } from '../../i18n';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Upload } from 'lucide-react';
import { api, downloadFile } from '../../lib/api';
import { fmtMoney, fmtQty } from '../../lib/format';
import { canAccess } from '../../lib/roles';
import type { Material, Paged } from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { useDebounced } from '../../hooks/useDebounced';
import { useGroups } from '../../hooks/lookups';
import { Badge, Button, EmptyState, ErrorBanner, PageHeader, Pagination, SearchBox } from '../../components/ui';
import { MaterialFormModal } from './MaterialFormModal';
import { ImportMaterialsModal } from './ImportMaterialsModal';

const PAGE_SIZE = 20;

export function MaterialsPage() {
  const { user } = useAuth();
  const canEdit = canAccess(user, ['PURCHASING']);
  const qc = useQueryClient();
  const { data: groups = [] } = useGroups();

  const [q, setQ] = useState('');
  const [groupId, setGroupId] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [active, setActive] = useState<'true' | 'false'>('true');
  const [page, setPage] = useState(1);
  const debouncedQ = useDebounced(q);

  const [editing, setEditing] = useState<Material | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), active });
  if (debouncedQ) params.set('q', debouncedQ);
  if (groupId) params.set('groupId', groupId);
  if (lowStock) params.set('lowStock', 'true');

  const { data, isLoading, error } = useQuery({
    queryKey: ['materials', params.toString()],
    queryFn: () => api<Paged<Material>>(`/materials?${params}`),
    placeholderData: keepPreviousData,
  });

  const toggleActive = useMutation({
    mutationFn: (m: Material) => api(`/materials/${m.id}/active`, { method: 'PATCH', json: { isActive: !m.isActive } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials'] }),
  });

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };
  const open = (m: Material | null) => {
    setEditing(m);
    setFormOpen(true);
  };
  async function exportExcel() {
    setExporting(true);
    try {
      await downloadFile('/materials/export', 'vat-tu.xlsx');
    } finally {
      setExporting(false);
    }
  }

  const isLow = (m: Material) => m.isActive && Number(m.minStock) > 0 && Number(m.totalStock) < Number(m.minStock);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t('Vật tư')}
        subtitle={t('Danh mục vật tư, quy cách, đơn vị tính và tồn kho tổng')}
        actions={
          <>
            <Button onClick={() => void exportExcel()} disabled={exporting}>
              <Download className="size-4" /> {exporting ? t('Đang xuất…') : t('Xuất Excel')}
            </Button>
            {canEdit && (
              <>
                <Button onClick={() => setImportOpen(true)}>
                  <Upload className="size-4" />{' '}{t('Nhập Excel')}
                </Button>
                <Button variant="primary" onClick={() => open(null)}>
                  <Plus className="size-4" />{' '}{t('Thêm vật tư')}
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={resetPage(setQ)} placeholder={t('Tìm mã, tên, quy cách…')} />
        <select
          aria-label={t('Lọc theo nhóm')}
          value={groupId}
          onChange={(e) => resetPage(setGroupId)(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">{t('Tất cả nhóm')}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t('Lọc theo trạng thái')}
          value={active}
          onChange={(e) => resetPage(setActive)(e.target.value as 'true' | 'false')}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="true">{t('Đang dùng')}</option>
          <option value="false">{t('Ngừng dùng')}</option>
        </select>
        <label className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
          <input type="checkbox" checked={lowStock} onChange={(e) => resetPage(setLowStock)(e.target.checked)} />
          {t('Dưới mức tối thiểu')}
        </label>
      </div>

      {error && <ErrorBanner message={t('Không tải được danh sách vật tư')} />}

      <div className="rounded-xl border border-slate-200 bg-white">
        {/* Bảng trên máy tính */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-2.5">{t('Mã')}</th>
                <th className="px-4 py-2.5">{t('Tên vật tư')}</th>
                <th className="px-4 py-2.5">{t('Nhóm')}</th>
                <th className="px-4 py-2.5">{t('ĐVT')}</th>
                <th className="px-4 py-2.5 text-right">{t('Giá bán')}</th>
                <th className="px-4 py-2.5 text-right">{t('Tồn tổng')}</th>
                <th className="px-4 py-2.5 text-right">{t('Tối thiểu')}</th>
                {canEdit && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((m) => (
                <tr key={m.id} onClick={() => open(m)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{m.code}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{m.name}</div>
                    {m.specification && <div className="text-xs text-slate-500">{m.specification}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{m.group.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {m.baseUnit.name}
                    {m.conversions.length > 0 && (
                      <div className="text-xs text-slate-400">
                        {m.conversions.map((c) => `${c.unit.name} = ${fmtQty(c.factor)}`).join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(m.salePrice)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {isLow(m) ? <Badge tone="red">{fmtQty(m.totalStock)}</Badge> : fmtQty(m.totalStock)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">{fmtQty(m.minStock)}</td>
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleActive.mutate(m);
                        }}
                      >
                        {m.isActive ? t('Ngừng dùng') : t('Dùng lại')}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Thẻ trên điện thoại */}
        <ul className="divide-y divide-slate-100 md:hidden">
          {data?.items.map((m) => (
            <li key={m.id}>
              <button onClick={() => open(m)} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-slate-500">{m.code}</div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-slate-500">{m.group.name}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-semibold tabular-nums ${isLow(m) ? 'text-red-600' : ''}`}>{fmtQty(m.totalStock)}</div>
                  <div className="text-xs text-slate-500">{m.baseUnit.name.toLowerCase()}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>

        {isLoading && <EmptyState>{t('Đang tải…')}</EmptyState>}
        {data && data.items.length === 0 && <EmptyState>{t('Không có vật tư phù hợp.')}</EmptyState>}
        {data && data.total > 0 && (
          <div className="border-t border-slate-100 px-3">
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          </div>
        )}
      </div>

      <MaterialFormModal open={formOpen} material={editing} readOnly={!canEdit} onClose={() => setFormOpen(false)} />
      <ImportMaterialsModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
