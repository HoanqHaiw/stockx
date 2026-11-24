import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CheckCircle2, PackagePlus, Pencil } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { fmtDate, fmtMoney, fmtQty, unitOf } from '../../lib/format';
import { canAccess } from '../../lib/roles';
import { poStatusLabel, poStatusTone, type PurchaseOrder, type StockDocument } from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Button, ErrorBanner } from '../../components/ui';
import { ReceiveModal } from './ReceiveModal';
import { StockDocumentModal } from '../stock/StockDocumentModal';

export function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [viewDocId, setViewDocId] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const { data: po, isLoading, error } = useQuery({
    queryKey: ['purchase-orders', id],
    queryFn: () => api<PurchaseOrder>(`/purchase-orders/${id}`),
  });

  const action = useMutation({
    mutationFn: (kind: 'approve' | 'cancel') => api<PurchaseOrder>(`/purchase-orders/${id}/${kind}`, { method: 'POST' }),
    onSuccess: (updated) => {
      qc.setQueryData(['purchase-orders', id], updated);
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  if (isLoading) return <p className="text-sm text-slate-500">Đang tải…</p>;
  if (error || !po) return <ErrorBanner message="Không tải được đơn mua hàng" />;

  const isDraft = po.status === 'DRAFT';
  const canReceive = (po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED') && canAccess(user, ['WAREHOUSE']);
  const canEdit = isDraft && canAccess(user, ['PURCHASING']);
  const canApprove = isDraft && user?.role === 'ADMIN';
  const canCancel = (isDraft || po.status === 'APPROVED') && canAccess(user, ['PURCHASING']);

  function onCancel() {
    if (window.confirm(`Huỷ đơn ${po!.code}? Đơn đã huỷ không thể khôi phục.`)) action.mutate('cancel');
  }
  function onReceived(doc: StockDocument) {
    setReceiveOpen(false);
    setFlash(`Đã ghi sổ phiếu nhập ${doc.code}`);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/purchase-orders" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Đơn mua hàng
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{po.code}</h1>
            <Badge tone={poStatusTone[po.status]}>{poStatusLabel[po.status]}</Badge>
          </div>
          <p className="text-sm text-slate-500">
            Lập ngày {fmtDate(po.orderDate)} bởi {po.createdBy.fullName}
            {po.approvedBy && ` · Duyệt bởi ${po.approvedBy.fullName} ngày ${fmtDate(po.approvedAt)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Link to={`/purchase-orders/${po.id}/edit`}>
              <Button>
                <Pencil className="size-4" /> Sửa
              </Button>
            </Link>
          )}
          {canCancel && (
            <Button variant="danger" onClick={onCancel} disabled={action.isPending}>
              <Ban className="size-4" /> Huỷ đơn
            </Button>
          )}
          {canApprove && (
            <Button variant="primary" onClick={() => action.mutate('approve')} disabled={action.isPending}>
              <CheckCircle2 className="size-4" /> Duyệt đơn
            </Button>
          )}
          {canReceive && (
            <Button variant="primary" onClick={() => setReceiveOpen(true)}>
              <PackagePlus className="size-4" /> Nhập kho
            </Button>
          )}
        </div>
      </div>

      {action.error instanceof ApiError && <ErrorBanner message={action.error.message} />}
      {flash && (
        <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {flash}
        </p>
      )}
      {isDraft && !canApprove && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Đơn nháp đang chờ quản trị viên duyệt.</p>
      )}

      <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Nhà cung cấp" value={po.supplier.name} sub={po.supplier.taxCode ? `MST ${po.supplier.taxCode}` : undefined} />
        <Info label="Kho nhận" value={po.warehouse.name} />
        <Info label="Ngày dự kiến nhận" value={fmtDate(po.expectedDate)} />
        <Info label="Tổng tiền" value={`${fmtMoney(po.totalAmount)} đ`} />
        {po.note && <Info label="Ghi chú" value={po.note} wide />}
      </div>

      <div className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Vật tư</th>
              <th className="px-4 py-2.5 text-right">Số lượng</th>
              <th className="px-4 py-2.5 text-right">Đơn giá</th>
              <th className="px-4 py-2.5 text-right">Thành tiền</th>
              <th className="px-4 py-2.5">Đã nhận</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l) => {
              const unit = unitOf(l.material, l.unitId);
              const pct = Math.min(100, (Number(l.receivedBaseQty) / Number(l.baseQuantity)) * 100);
              return (
                <tr key={l.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-xs text-slate-500">{l.material.code}</div>
                    <div>{l.material.name}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">
                    {fmtQty(l.quantity)} {unit.name.toLowerCase()}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(l.unitPrice)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(l.amount)}</td>
                  <td className="w-44 px-4 py-2.5">
                    <div className="mb-1 text-xs text-slate-600 tabular-nums">
                      {fmtQty(Number(l.receivedBaseQty) / Number(l.factor))}/{fmtQty(l.quantity)}
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-teal-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 font-medium">Phiếu nhập kho</div>
        {po.stockDocuments.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">Chưa nhập kho lần nào.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {po.stockDocuments.map((d) => (
              <li key={d.id}>
                <button onClick={() => setViewDocId(d.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50">
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

      <ReceiveModal po={po} open={receiveOpen} onClose={() => setReceiveOpen(false)} onDone={onReceived} />
      <StockDocumentModal id={viewDocId} onClose={() => setViewDocId(null)} />
    </div>
  );
}

function Info({ label, value, sub, wide }: { label: string; value: string; sub?: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2 lg:col-span-4' : ''}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
