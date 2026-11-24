import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, downloadFile } from '../../lib/api';
import { fmtMoney } from '../../lib/format';
import { useDebounced } from '../../hooks/useDebounced';
import { Button, EmptyState, ErrorBanner, PageHeader, SearchBox } from '../../components/ui';
import { DebtDetailModal } from './DebtDetailModal';

export type PartnerKind = 'customer' | 'supplier';

export interface Aging {
  current: string;
  overdue1to30: string;
  overdue31to60: string;
  overdueOver60: string;
}
interface Summary {
  rows: { partnerId: number; code: string; name: string; increase: string; decrease: string; balance: string; aging: Aging }[];
  totals: { increase: string; decrease: string; balance: string; aging: Aging };
  paymentTermDays: number;
}

export const agingCols: { key: keyof Aging; label: string; tone: string }[] = [
  { key: 'current', label: 'Chưa đến hạn', tone: 'text-slate-700' },
  { key: 'overdue1to30', label: 'Quá hạn 1–30 ngày', tone: 'text-amber-700' },
  { key: 'overdue31to60', label: 'Quá hạn 31–60 ngày', tone: 'text-orange-700' },
  { key: 'overdueOver60', label: 'Quá hạn > 60 ngày', tone: 'text-red-700' },
];

/** Công nợ phải thu (khách hàng) / phải trả (nhà cung cấp), có phân tuổi nợ. */
export function DebtsPage() {
  const [kind, setKind] = useState<PartnerKind>('customer');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const debouncedQ = useDebounced(q);

  const { data, isLoading, error } = useQuery({
    queryKey: ['debts', kind, debouncedQ],
    queryFn: () => api<Summary>(`/debts/${kind}?q=${encodeURIComponent(debouncedQ)}`),
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Công nợ"
        subtitle={data ? `Hạn thanh toán ${data.paymentTermDays} ngày kể từ ngày giao/nhận hàng; tiền trả trừ vào khoản nợ cũ nhất trước` : undefined}
        actions={
          <Button onClick={() => void downloadFile(`/debts/${kind}/excel`, `cong-no-${kind}.xlsx`)}>
            <Download className="size-4" /> Xuất Excel
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm" role="tablist">
          {(
            [
              ['customer', 'Phải thu khách hàng'],
              ['supplier', 'Phải trả nhà cung cấp'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1.5 font-medium ${kind === k ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Tìm mã, tên đối tác…" />
      </div>

      {error && <ErrorBanner message="Không tải được công nợ" />}

      {data && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="text-xs text-slate-500">Tổng còn nợ</div>
            <div className="font-semibold tabular-nums">{fmtMoney(data.totals.balance)} đ</div>
          </div>
          {agingCols.map((c) => (
            <div key={c.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="text-xs text-slate-500">{c.label}</div>
              <div className={`font-semibold tabular-nums ${Number(data.totals.aging[c.key]) > 0 ? c.tone : 'text-slate-400'}`}>
                {fmtMoney(data.totals.aging[c.key])} đ
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5">{kind === 'customer' ? 'Khách hàng' : 'Nhà cung cấp'}</th>
                <th className="px-4 py-2.5 text-right">Phát sinh</th>
                <th className="px-4 py-2.5 text-right">Đã thanh toán</th>
                <th className="px-4 py-2.5 text-right">Còn nợ</th>
                {agingCols.map((c) => (
                  <th key={c.key} className="px-4 py-2.5 text-right">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r) => (
                <tr key={r.partnerId} onClick={() => setOpen(r.partnerId)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-xs text-slate-500">{r.code}</div>
                    <div className="font-medium">{r.name}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(r.increase)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(r.decrease)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtMoney(r.balance)}</td>
                  {agingCols.map((c) => (
                    <td key={c.key} className={`px-4 py-2.5 text-right tabular-nums ${Number(r.aging[c.key]) > 0 ? c.tone : 'text-slate-300'}`}>
                      {fmtMoney(r.aging[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-slate-100 md:hidden">
          {data?.rows.map((r) => {
            const overdue = Number(r.aging.overdue1to30) + Number(r.aging.overdue31to60) + Number(r.aging.overdueOver60);
            return (
              <li key={r.partnerId}>
                <button onClick={() => setOpen(r.partnerId)} className="flex w-full justify-between gap-3 px-4 py-3 text-left">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-slate-500">{r.code}</div>
                    <div className="truncate font-medium">{r.name}</div>
                    {overdue > 0 && <div className="text-xs text-red-700">Quá hạn {fmtMoney(overdue)} đ</div>}
                  </div>
                  <div className="shrink-0 font-semibold tabular-nums">{fmtMoney(r.balance)} đ</div>
                </button>
              </li>
            );
          })}
        </ul>
        {isLoading && <EmptyState>Đang tải…</EmptyState>}
        {data && data.rows.length === 0 && <EmptyState>Chưa phát sinh công nợ.</EmptyState>}
      </div>

      <DebtDetailModal kind={kind} partnerId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
