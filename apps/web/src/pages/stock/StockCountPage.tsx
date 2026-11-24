import { useMemo, useState } from 'react';
import { t } from '../../i18n';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { fmtMoney, fmtQty } from '../../lib/format';
import type { StockDocument } from '../../lib/types';
import { useGroups, useWarehouses } from '../../hooks/lookups';
import { Button, EmptyState, ErrorBanner, PageHeader, SearchBox, TextInput } from '../../components/ui';

interface SheetRow {
  id: number;
  code: string;
  name: string;
  unitName: string;
  groupName: string;
  purchasePrice: string;
  quantity: string; // tồn sổ sách tại kho
}

/**
 * Kiểm kê: chọn kho, thủ kho nhập số đếm thực tế cho từng vật tư (không cần đếm hết, chỉ dòng có nhập mới
 * được ghi). Chênh lệch được tính lại ở server theo tồn tại thời điểm lưu.
 */
export function StockCountPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: warehouses = [] } = useWarehouses();
  const { data: groups = [] } = useGroups();
  const [warehouseId, setWarehouseId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [q, setQ] = useState('');
  const [counted, setCounted] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  const wid = warehouseId || (warehouses[0] ? String(warehouses[0].id) : '');

  // Danh sách vật tư kèm tồn sổ sách của kho (kể cả mã đang bằng 0 để ghi tăng khi đếm thấy).
  const { data: sheet, isLoading } = useQuery({
    queryKey: ['stock', 'overview', 'count-sheet', wid],
    queryFn: () => api<{ items: SheetRow[] }>(`/stock/overview?warehouseId=${wid}&pageSize=500`),
    enabled: !!wid,
  });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const groupName = groups.find((g) => String(g.id) === groupId)?.name;
    return (sheet?.items ?? []).filter(
      (r) =>
        (!groupName || r.groupName === groupName) &&
        (!needle || r.code.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle)),
    );
  }, [sheet, q, groupId, groups]);

  const entered = (sheet?.items ?? []).filter((r) => counted[r.id] !== undefined && counted[r.id] !== '');
  const diffs = entered.map((r) => ({ r, diff: Number(counted[r.id]) - Number(r.quantity) }));
  const changed = diffs.filter((d) => Math.abs(d.diff) > 1e-9);
  const diffValue = changed.reduce((s, d) => s + d.diff * Number(d.r.purchasePrice), 0);

  const save = useMutation({
    mutationFn: () =>
      api<StockDocument>('/stock/counts', {
        method: 'POST',
        json: {
          warehouseId: Number(wid),
          note: note || undefined,
          lines: entered.map((r) => ({ materialId: r.id, countedQty: counted[r.id] })),
        },
      }),
    onSuccess: () => {
      for (const key of ['stock', 'materials']) void qc.invalidateQueries({ queryKey: [key] });
      navigate('/stock/counts');
    },
  });

  function confirmSave() {
    const msg =
      changed.length === 0
        ? t('Ghi nhận kiểm kê {n} mã, tất cả khớp sổ sách?', { n: entered.length })
        : t('Ghi nhận kiểm kê {n} mã, điều chỉnh {m} mã lệch (giá trị {v})?', { n: entered.length, m: changed.length, v: `${fmtMoney(diffValue)} ${t('đ')}` });
    if (window.confirm(msg)) save.mutate();
  }

  return (
    <div className="mx-auto max-w-4xl pb-24">
      <Link to="/stock/counts" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" />{' '}{t('Kiểm kê')}
      </Link>
      <PageHeader title={t('Phiếu kiểm kê')} subtitle={t('Nhập số đếm thực tế; mã không nhập sẽ không bị điều chỉnh')} />

      {save.error instanceof ApiError && <ErrorBanner message={save.error.message} />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          aria-label={t('Kho kiểm kê')}
          value={wid}
          onChange={(e) => {
            if (entered.length && !window.confirm(t('Đổi kho sẽ xoá các số đã nhập. Tiếp tục?'))) return;
            setWarehouseId(e.target.value);
            setCounted({});
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t('Nhóm')}
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">{t('Tất cả nhóm')}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <SearchBox value={q} onChange={setQ} placeholder={t('Tìm mã, tên…')} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => {
            const v = counted[r.id];
            const diff = v !== undefined && v !== '' ? Number(v) - Number(r.quantity) : null;
            return (
              <li key={r.id} className={`flex items-center gap-3 px-4 py-2.5 ${diff ? 'bg-amber-50/60' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-slate-500">{r.code}</div>
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="text-xs text-slate-500">
                    {t('Sổ sách:')}{' '}<span className="tabular-nums">{fmtQty(r.quantity)}</span> {r.unitName.toLowerCase()}
                    {diff !== null && Math.abs(diff) > 1e-9 && (
                      <span className={`ml-2 font-medium ${diff < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {diff > 0 ? '+' : ''}
                        {fmtQty(diff)}
                      </span>
                    )}
                    {diff !== null && Math.abs(diff) <= 1e-9 && <span className="ml-2 text-emerald-700">{t('khớp')}</span>}
                  </div>
                </div>
                <input
                  aria-label={t('Số đếm {code}', { code: r.code })}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  placeholder={t('Đếm')}
                  value={v ?? ''}
                  onChange={(e) => setCounted({ ...counted, [r.id]: e.target.value })}
                  className="w-24 rounded-md border border-slate-300 px-2 py-2 text-right text-sm"
                />
              </li>
            );
          })}
        </ul>
        {isLoading && <EmptyState>{t('Đang tải…')}</EmptyState>}
        {sheet && rows.length === 0 && <EmptyState>{t('Không có vật tư phù hợp.')}</EmptyState>}
      </div>

      <div className="mt-4">
        <TextInput label={t('Ghi chú')} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('VD: Kiểm kê cuối tháng 11, người đếm: anh Tuấn')} />
      </div>

      {/* Thanh tóm tắt cố định ở đáy, tiện thao tác bằng một tay trên điện thoại */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="text-sm">
            <div>
              {t('Đã đếm')}{' '}<b>{entered.length}</b>{' '}{t('mã · lệch')}{' '}<b className={changed.length ? 'text-amber-700' : ''}>{changed.length}</b>
            </div>
            {changed.length > 0 && (
              <div className={`text-xs tabular-nums ${diffValue < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                {t('Giá trị chênh lệch:')}{' '}{fmtMoney(diffValue)}{' '}{t('đ')}
              </div>
            )}
          </div>
          <Button variant="primary" disabled={entered.length === 0 || save.isPending} onClick={confirmSave}>
            {save.isPending ? t('Đang ghi…') : t('Ghi nhận kiểm kê')}
          </Button>
        </div>
      </div>
    </div>
  );
}
