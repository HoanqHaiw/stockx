import { useEffect, useState } from 'react';
import { t } from '../../i18n';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Handshake, Pencil, Send, XCircle } from 'lucide-react';
import { api, ApiError, downloadFile } from '../../lib/api';
import { fmtDate, fmtMoney } from '../../lib/format';
import { canAccess } from '../../lib/roles';
import {
  effectiveQuotationStatus,
  quotationStatusLabel,
  quotationStatusTone,
  soStatusLabel,
  type Quotation,
  type SalesOrder,
} from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { useWarehouses } from '../../hooks/lookups';
import { Info, LinesTable } from '../../components/DocParts';
import { Badge, Button, ErrorBanner, Modal, SelectInput, TextInput } from '../../components/ui';

export function QuotationDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [convertOpen, setConvertOpen] = useState(false);

  const { data: q, isLoading, error } = useQuery({
    queryKey: ['quotations', id],
    queryFn: () => api<Quotation>(`/quotations/${id}`),
  });

  const action = useMutation({
    mutationFn: (kind: 'send' | 'reject') => api<Quotation>(`/quotations/${id}/${kind}`, { method: 'POST' }),
    onSuccess: (updated) => {
      qc.setQueryData(['quotations', id], updated);
      void qc.invalidateQueries({ queryKey: ['quotations'] });
    },
  });

  if (isLoading) return <p className="text-sm text-slate-500">{t('Đang tải…')}</p>;
  if (error || !q) return <ErrorBanner message={t('Không tải được báo giá')} />;

  const status = effectiveQuotationStatus(q);
  const isSales = canAccess(user, ['SALES']);
  const open = status === 'DRAFT' || status === 'SENT';

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/quotations" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" />{' '}{t('Báo giá')}
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{q.code}</h1>
            <Badge tone={quotationStatusTone[status]}>{quotationStatusLabel[status]}</Badge>
          </div>
          <p className="text-sm text-slate-500">
            {t('Lập ngày')}{' '}{fmtDate(q.quoteDate)}{' '}{t('bởi')}{' '}{q.createdBy.fullName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void downloadFile(`/quotations/${q.id}/excel`, `bao-gia-${q.code}.xlsx`)}>
            <Download className="size-4" />{' '}{t('Tải Excel')}
          </Button>
          {isSales && q.status === 'DRAFT' && (
            <Link to={`/quotations/${q.id}/edit`}>
              <Button>
                <Pencil className="size-4" />{' '}{t('Sửa')}
              </Button>
            </Link>
          )}
          {isSales && open && (
            <Button variant="danger" onClick={() => action.mutate('reject')} disabled={action.isPending}>
              <XCircle className="size-4" />{' '}{t('Khách từ chối')}
            </Button>
          )}
          {isSales && q.status === 'DRAFT' && (
            <Button onClick={() => action.mutate('send')} disabled={action.isPending}>
              <Send className="size-4" />{' '}{t('Đánh dấu đã gửi')}
            </Button>
          )}
          {isSales && open && (
            <Button variant="primary" onClick={() => setConvertOpen(true)}>
              <Handshake className="size-4" />{' '}{t('Chốt thành đơn bán')}
            </Button>
          )}
        </div>
      </div>

      {action.error instanceof ApiError && <ErrorBanner message={action.error.message} />}
      {status === 'EXPIRED' && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('Báo giá đã quá hạn hiệu lực. Hãy lập báo giá mới nếu khách vẫn muốn mua.')}
        </p>
      )}
      {q.salesOrders.map((so) => (
        <p key={so.id} className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {t('Đã chốt thành đơn bán')}{' '}
          <Link to={`/sales-orders/${so.id}`} className="font-medium underline">
            {so.code}
          </Link>{' '}
          ({soStatusLabel[so.status]}).
        </p>
      ))}

      <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Info label={t('Khách hàng')} value={q.customer.name} sub={q.customer.taxCode ? `MST ${q.customer.taxCode}` : undefined} />
        <Info label={t('Hiệu lực đến')} value={fmtDate(q.validUntil)} />
        <Info label={t('Số dòng')} value={String(q.lines.length)} />
        <Info label={t('Tổng tiền')} value={`${fmtMoney(q.totalAmount)} ${t('đ')}`} />
        {q.note && <Info label={t('Ghi chú')} value={q.note} wide />}
      </div>

      <LinesTable lines={q.lines} />

      <ConvertModal quotation={q} open={convertOpen} onClose={() => setConvertOpen(false)} />
    </div>
  );
}

function ConvertModal({ quotation, open, onClose }: { quotation: Quotation; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: warehouses = [] } = useWarehouses();
  const [warehouseId, setWarehouseId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');

  useEffect(() => {
    const main = warehouses.find((w) => w.type === 'MAIN') ?? warehouses[0];
    if (open && main && !warehouseId) setWarehouseId(String(main.id));
  }, [open, warehouses, warehouseId]);

  const convert = useMutation({
    mutationFn: () =>
      api<SalesOrder>(`/quotations/${quotation.id}/convert`, {
        method: 'POST',
        json: { warehouseId: Number(warehouseId), deliveryDate: deliveryDate || null },
      }),
    onSuccess: (so) => {
      void qc.invalidateQueries({ queryKey: ['quotations'] });
      void qc.invalidateQueries({ queryKey: ['sales-orders'] });
      navigate(`/sales-orders/${so.id}`);
    },
  });

  return (
    <Modal
      open={open}
      title={t('Chốt báo giá {code} thành đơn bán', { code: quotation.code })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('Huỷ')}</Button>
          <Button variant="primary" disabled={convert.isPending || !warehouseId} onClick={() => convert.mutate()}>
            {t('Tạo đơn bán')}
          </Button>
        </>
      }
    >
      {convert.error instanceof ApiError && <ErrorBanner message={convert.error.message} />}
      <p className="mb-4 text-sm text-slate-600">
        {t('Đơn bán sẽ có đúng')}{' '}{quotation.lines.length}{' '}{t('dòng hàng và giá đã báo (')}{fmtMoney(quotation.totalAmount)}{' '}{t('đ), ở trạng thái nháp chờ duyệt.')}
      </p>
      <div className="grid gap-4">
        <SelectInput label={t('Kho xuất hàng')} required value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </SelectInput>
        <TextInput label={t('Ngày giao dự kiến')} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
      </div>
    </Modal>
  );
}
