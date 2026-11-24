import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins } from 'lucide-react';
import { api, ApiError, fieldErrors } from '../../lib/api';
import { fmtDate, fmtMoney } from '../../lib/format';
import { canAccess } from '../../lib/roles';
import { useAuth } from '../../auth/AuthContext';
import { Button, ErrorBanner, Modal, SelectInput, TextInput } from '../../components/ui';
import { StockDocumentModal } from '../stock/StockDocumentModal';
import { agingCols, type Aging, type PartnerKind } from './DebtsPage';

interface Ledger {
  partner: { id: number; code: string; name: string; taxCode: string | null; phone: string | null };
  balance: string;
  aging: Aging;
  rows: {
    id: string;
    date: string;
    ref: { kind: 'document' | 'payment'; id: number; code: string };
    description: string;
    increase: string;
    decrease: string;
    balance: string;
  }[];
}

/** Sổ chi tiết công nợ của một đối tác và nút ghi nhận thu/chi cho kế toán. */
export function DebtDetailModal({ kind, partnerId, onClose }: { kind: PartnerKind; partnerId: number | null; onClose: () => void }) {
  const { user } = useAuth();
  const [payOpen, setPayOpen] = useState(false);
  const [docId, setDocId] = useState<number | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['debts', kind, 'ledger', partnerId],
    queryFn: () => api<Ledger>(`/debts/${kind}/${partnerId}`),
    enabled: partnerId !== null,
  });
  const canPay = canAccess(user, ['ACCOUNTANT']) && data && Number(data.balance) > 0;

  return (
    <>
      <Modal
        open={partnerId !== null}
        title={data ? `Công nợ – ${data.partner.name}` : 'Công nợ'}
        onClose={onClose}
        wide
        footer={
          <>
            <Button onClick={onClose}>Đóng</Button>
            {canPay && (
              <Button variant="primary" onClick={() => setPayOpen(true)}>
                <HandCoins className="size-4" /> {kind === 'customer' ? 'Ghi nhận thu tiền' : 'Ghi nhận trả tiền'}
              </Button>
            )}
          </>
        }
      >
        {isLoading || !data ? (
          <p className="text-sm text-slate-500">Đang tải…</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Còn nợ</div>
                <div className="font-semibold tabular-nums">{fmtMoney(data.balance)} đ</div>
              </div>
              {agingCols.map((c) => (
                <div key={c.key} className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">{c.label}</div>
                  <div className={`tabular-nums ${Number(data.aging[c.key]) > 0 ? c.tone : 'text-slate-400'}`}>
                    {fmtMoney(data.aging[c.key])}
                  </div>
                </div>
              ))}
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-md border border-slate-200">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Ngày</th>
                    <th className="px-3 py-2">Chứng từ</th>
                    <th className="px-3 py-2">Diễn giải</th>
                    <th className="px-3 py-2 text-right">Phát sinh</th>
                    <th className="px-3 py-2 text-right">Thanh toán</th>
                    <th className="px-3 py-2 text-right">Số dư</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.ref.kind === 'document' ? (
                          <button onClick={() => setDocId(r.ref.id)} className="font-medium text-teal-700 hover:underline">
                            {r.ref.code}
                          </button>
                        ) : (
                          <span className="font-medium">{r.ref.code}</span>
                        )}
                      </td>
                      <td className="max-w-56 truncate px-3 py-2 text-slate-600">{r.description}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(r.increase) ? fmtMoney(r.increase) : ''}</td>
                      <td className="px-3 py-2 text-right text-emerald-700 tabular-nums">{Number(r.decrease) ? fmtMoney(r.decrease) : ''}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
      {data && (
        <PaymentModal
          open={payOpen}
          kind={kind}
          partner={data.partner}
          balance={Number(data.balance)}
          onClose={() => setPayOpen(false)}
        />
      )}
      <StockDocumentModal id={docId} onClose={() => setDocId(null)} />
    </>
  );
}

function PaymentModal({
  open,
  kind,
  partner,
  balance,
  onClose,
}: {
  open: boolean;
  kind: PartnerKind;
  partner: Ledger['partner'];
  balance: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const today = new Date().toLocaleDateString('sv-SE');
  const [form, setForm] = useState({ amount: '', method: 'BANK_TRANSFER', paymentDate: today, note: '' });

  const save = useMutation({
    mutationFn: () =>
      api('/payments', {
        method: 'POST',
        json: {
          partnerType: kind.toUpperCase(),
          partnerId: partner.id,
          amount: form.amount,
          method: form.method,
          paymentDate: form.paymentDate,
          note: form.note,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['debts'] });
      void qc.invalidateQueries({ queryKey: ['reports'] });
      onClose();
    },
  });
  useEffect(() => {
    if (open) {
      setForm({ amount: String(balance), method: 'BANK_TRANSFER', paymentDate: today, note: '' });
      save.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const errors = fieldErrors(save.error);

  return (
    <Modal
      open={open}
      title={kind === 'customer' ? 'Phiếu thu tiền khách hàng' : 'Phiếu chi trả nhà cung cấp'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Đang ghi…' : 'Ghi nhận'}
          </Button>
        </>
      }
    >
      {save.error instanceof ApiError && Object.keys(errors).length === 0 && <ErrorBanner message={save.error.message} />}
      <p className="mb-4 text-sm text-slate-600">
        {partner.name} đang {kind === 'customer' ? 'nợ' : 'được nợ'} <b>{fmtMoney(balance)} đ</b>.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Số tiền (đ)"
          required
          type="number"
          min={0}
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          error={errors.amount}
          hint={form.amount ? `${fmtMoney(form.amount)} đ` : undefined}
        />
        <TextInput
          label="Ngày"
          type="date"
          value={form.paymentDate}
          onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
          error={errors.paymentDate}
        />
        <SelectInput label="Hình thức" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
          <option value="BANK_TRANSFER">Chuyển khoản</option>
          <option value="CASH">Tiền mặt</option>
        </SelectInput>
        <TextInput label="Ghi chú" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="VD: UNC số 125 – Vietcombank" />
      </div>
    </Modal>
  );
}
