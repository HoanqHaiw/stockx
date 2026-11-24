import type { ReactNode } from 'react';
import { fmtDate, fmtMoney, fmtQty, unitOf } from '../lib/format';
import type { OrderLine } from '../lib/types';

/** Ô thông tin trên đầu trang chi tiết chứng từ. */
export function Info({ label, value, sub, wide }: { label: string; value: ReactNode; sub?: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2 lg:col-span-4' : ''}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/**
 * Bảng dòng hàng của chứng từ. Trên điện thoại hiển thị dạng thẻ để không phải vuốt ngang.
 * progress: số đã nhận/đã giao theo đơn vị cơ sở (nếu có).
 */
export function LinesTable({
  lines,
  progressLabel,
  progressOf,
}: {
  lines: OrderLine[];
  progressLabel?: string;
  progressOf?: (l: OrderLine) => number;
}) {
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white">
      <table className="hidden w-full text-sm md:table">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Vật tư</th>
            <th className="px-4 py-2.5 text-right">Số lượng</th>
            <th className="px-4 py-2.5 text-right">Đơn giá</th>
            <th className="px-4 py-2.5 text-right">Thành tiền</th>
            {progressOf && <th className="px-4 py-2.5">{progressLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const unit = unitOf(l.material, l.unitId).name.toLowerCase();
            return (
              <tr key={l.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5">
                  <div className="font-mono text-xs text-slate-500">{l.material.code}</div>
                  <div>{l.material.name}</div>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">
                  {fmtQty(l.quantity)} {unit}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(l.unitPrice)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(l.amount)}</td>
                {progressOf && (
                  <td className="w-44 px-4 py-2.5">
                    <Progress line={l} done={progressOf(l)} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul className="divide-y divide-slate-100 md:hidden">
        {lines.map((l) => {
          const unit = unitOf(l.material, l.unitId).name.toLowerCase();
          return (
            <li key={l.id} className="px-4 py-3 text-sm">
              <div className="font-mono text-xs text-slate-500">{l.material.code}</div>
              <div className="font-medium">{l.material.name}</div>
              <div className="mt-1 flex justify-between text-slate-600">
                <span className="tabular-nums">
                  {fmtQty(l.quantity)} {unit} × {fmtMoney(l.unitPrice)}
                </span>
                <span className="font-medium tabular-nums">{fmtMoney(l.amount)}</span>
              </div>
              {progressOf && (
                <div className="mt-2">
                  <Progress line={l} done={progressOf(l)} label={progressLabel} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Progress({ line, done, label }: { line: OrderLine; done: number; label?: string }) {
  const pct = Math.min(100, (done / Number(line.baseQuantity)) * 100);
  return (
    <>
      <div className="mb-1 text-xs text-slate-600 tabular-nums">
        {label && `${label}: `}
        {fmtQty(done / Number(line.factor))}/{fmtQty(line.quantity)}
      </div>
      <div className="h-1.5 rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-teal-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}

/** Danh sách phiếu kho của một đơn (phiếu nhập / phiếu xuất). */
export function DocHistory({
  title,
  empty,
  docs,
  onOpen,
}: {
  title: string;
  empty: string;
  docs: { id: number; code: string; docDate: string; totalAmount: string; createdBy: { fullName: string } }[];
  onOpen: (id: number) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3 font-medium">{title}</div>
      {docs.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {docs.map((d) => (
            <li key={d.id}>
              <button onClick={() => onOpen(d.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50">
                <div>
                  <div className="font-medium text-teal-700">{d.code}</div>
                  <div className="text-xs text-slate-500">
                    {fmtDate(d.docDate)} · {d.createdBy.fullName}
                  </div>
                </div>
                <span className="tabular-nums">{fmtMoney(d.totalAmount)} đ</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
