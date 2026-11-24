import { useState } from 'react';
import { t } from '../../i18n';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CheckCircle2, PackageMinus, Pencil } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { fmtDate, fmtMoney } from '../../lib/format';
import { canAccess } from '../../lib/roles';
import { soStatusLabel, soStatusTone, type SalesOrder, type StockDocument } from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { DocHistory, Info, LinesTable } from '../../components/DocParts';
import { Badge, Button, ErrorBanner } from '../../components/ui';
import { StockDocumentModal } from '../stock/StockDocumentModal';
import { DeliverModal } from './DeliverModal';

export function SalesOrderDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [viewDocId, setViewDocId] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const { data: so, isLoading, error } = useQuery({
    queryKey: ['sales-orders', id],
    queryFn: () => api<SalesOrder>(`/sales-orders/${id}`),
  });

  const action = useMutation({
    mutationFn: (kind: 'approve' | 'cancel') => api<SalesOrder>(`/sales-orders/${id}/${kind}`, { method: 'POST' }),
    onSuccess: (updated) => {
      qc.setQueryData(['sales-orders', id], updated);
      void qc.invalidateQueries({ queryKey: ['sales-orders'] });
    },
  });

  if (isLoading) return <p className="text-sm text-slate-500">{t('Đang tải…')}</p>;
  if (error || !so) return <ErrorBanner message={t('Không tải được đơn bán hàng')} />;

  const isDraft = so.status === 'DRAFT';
  const canDeliver = (so.status === 'APPROVED' || so.status === 'PARTIALLY_DELIVERED') && canAccess(user, ['WAREHOUSE']);
  const canEdit = isDraft && canAccess(user, ['SALES']);
  const canApprove = isDraft && user?.role === 'ADMIN';
  const canCancel = (isDraft || so.status === 'APPROVED') && canAccess(user, ['SALES']);

  function onDelivered(doc: StockDocument) {
    setDeliverOpen(false);
    setFlash(t('Đã ghi sổ phiếu xuất {code}', { code: doc.code }));
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/sales-orders" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" />{' '}{t('Đơn bán hàng')}
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{so.code}</h1>
            <Badge tone={soStatusTone[so.status]}>{soStatusLabel[so.status]}</Badge>
          </div>
          <p className="text-sm text-slate-500">
            {t('Lập ngày')}{' '}{fmtDate(so.orderDate)}{' '}{t('bởi')}{' '}{so.createdBy.fullName}
            {so.approvedBy && t(' · Duyệt bởi {name} ngày {date}', { name: so.approvedBy.fullName, date: fmtDate(so.approvedAt) })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Link to={`/sales-orders/${so.id}/edit`}>
              <Button>
                <Pencil className="size-4" />{' '}{t('Sửa')}
              </Button>
            </Link>
          )}
          {canCancel && (
            <Button
              variant="danger"
              disabled={action.isPending}
              onClick={() => window.confirm(t('Huỷ đơn {code}?', { code: so.code })) && action.mutate('cancel')}
            >
              <Ban className="size-4" />{' '}{t('Huỷ đơn')}
            </Button>
          )}
          {canApprove && (
            <Button variant="primary" onClick={() => action.mutate('approve')} disabled={action.isPending}>
              <CheckCircle2 className="size-4" />{' '}{t('Duyệt đơn')}
            </Button>
          )}
          {canDeliver && (
            <Button variant="primary" onClick={() => setDeliverOpen(true)}>
              <PackageMinus className="size-4" />{' '}{t('Xuất kho giao hàng')}
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
        <Info label={t('Khách hàng')} value={so.customer.name} sub={so.customer.taxCode ? `MST ${so.customer.taxCode}` : undefined} />
        <Info label={t('Kho xuất')} value={so.warehouse.name} />
        <Info label={t('Ngày giao dự kiến')} value={fmtDate(so.deliveryDate)} />
        <Info label={t('Tổng tiền')} value={`${fmtMoney(so.totalAmount)} ${t('đ')}`} />
        {so.quotation && (
          <Info
            label={t('Từ báo giá')}
            value={
              <Link to={`/quotations/${so.quotation.id}`} className="text-teal-700 hover:underline">
                {so.quotation.code}
              </Link>
            }
          />
        )}
        {so.note && <Info label={t('Ghi chú')} value={so.note} wide />}
      </div>

      <LinesTable lines={so.lines} progressLabel={t('Đã giao')} progressOf={(l) => Number((l as SalesOrder['lines'][number]).deliveredBaseQty)} />
      <DocHistory title={t('Phiếu xuất kho')} empty={t('Chưa giao hàng lần nào.')} docs={so.stockDocuments} onOpen={setViewDocId} />

      <DeliverModal so={so} open={deliverOpen} onClose={() => setDeliverOpen(false)} onDone={onDelivered} />
      <StockDocumentModal id={viewDocId} onClose={() => setViewDocId(null)} />
    </div>
  );
}
