import { useState } from 'react';
import { t } from '../../i18n';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CheckCircle2, PackagePlus, Pencil } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { fmtDate, fmtMoney } from '../../lib/format';
import { canAccess } from '../../lib/roles';
import { poStatusLabel, poStatusTone, type PurchaseOrder, type StockDocument } from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { DocHistory, Info, LinesTable } from '../../components/DocParts';
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

  if (isLoading) return <p className="text-sm text-slate-500">{t('Đang tải…')}</p>;
  if (error || !po) return <ErrorBanner message={t('Không tải được đơn mua hàng')} />;

  const isDraft = po.status === 'DRAFT';
  const canReceive = (po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED') && canAccess(user, ['WAREHOUSE']);
  const canEdit = isDraft && canAccess(user, ['PURCHASING']);
  const canApprove = isDraft && user?.role === 'ADMIN';
  const canCancel = (isDraft || po.status === 'APPROVED') && canAccess(user, ['PURCHASING']);

  function onCancel() {
    if (window.confirm(t('Huỷ đơn {code}? Đơn đã huỷ không thể khôi phục.', { code: po!.code }))) action.mutate('cancel');
  }
  function onReceived(doc: StockDocument) {
    setReceiveOpen(false);
    setFlash(t('Đã ghi sổ phiếu nhập {code}', { code: doc.code }));
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/purchase-orders" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" />{' '}{t('Đơn mua hàng')}
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{po.code}</h1>
            <Badge tone={poStatusTone[po.status]}>{poStatusLabel[po.status]}</Badge>
          </div>
          <p className="text-sm text-slate-500">
            {t('Lập ngày')}{' '}{fmtDate(po.orderDate)}{' '}{t('bởi')}{' '}{po.createdBy.fullName}
            {po.approvedBy && t(' · Duyệt bởi {name} ngày {date}', { name: po.approvedBy.fullName, date: fmtDate(po.approvedAt) })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Link to={`/purchase-orders/${po.id}/edit`}>
              <Button>
                <Pencil className="size-4" />{' '}{t('Sửa')}
              </Button>
            </Link>
          )}
          {canCancel && (
            <Button variant="danger" onClick={onCancel} disabled={action.isPending}>
              <Ban className="size-4" />{' '}{t('Huỷ đơn')}
            </Button>
          )}
          {canApprove && (
            <Button variant="primary" onClick={() => action.mutate('approve')} disabled={action.isPending}>
              <CheckCircle2 className="size-4" />{' '}{t('Duyệt đơn')}
            </Button>
          )}
          {canReceive && (
            <Button variant="primary" onClick={() => setReceiveOpen(true)}>
              <PackagePlus className="size-4" />{' '}{t('Nhập kho')}
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
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('Đơn nháp đang chờ quản trị viên duyệt.')}</p>
      )}

      <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Info label={t('Nhà cung cấp')} value={po.supplier.name} sub={po.supplier.taxCode ? `MST ${po.supplier.taxCode}` : undefined} />
        <Info label={t('Kho nhận')} value={po.warehouse.name} />
        <Info label={t('Ngày dự kiến nhận')} value={fmtDate(po.expectedDate)} />
        <Info label={t('Tổng tiền')} value={`${fmtMoney(po.totalAmount)} ${t('đ')}`} />
        {po.note && <Info label={t('Ghi chú')} value={po.note} wide />}
      </div>

      <LinesTable lines={po.lines} progressLabel={t('Đã nhận')} progressOf={(l) => Number((l as PurchaseOrder['lines'][number]).receivedBaseQty)} />
      <DocHistory title={t('Phiếu nhập kho')} empty={t('Chưa nhập kho lần nào.')} docs={po.stockDocuments} onOpen={setViewDocId} />

      <ReceiveModal po={po} open={receiveOpen} onClose={() => setReceiveOpen(false)} onDone={onReceived} />
      <StockDocumentModal id={viewDocId} onClose={() => setViewDocId(null)} />
    </div>
  );
}
