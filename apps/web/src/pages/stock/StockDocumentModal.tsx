import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { fmtDate, fmtMoney, fmtQty } from '../../lib/format';
import type { StockDocType, StockDocument } from '../../lib/types';
import { Badge, Button, Modal } from '../../components/ui';

export const docTypeLabel: Record<StockDocType, string> = {
  RECEIPT: 'Phiếu nhập kho',
  ISSUE: 'Phiếu xuất kho',
  TRANSFER: 'Phiếu chuyển kho',
  ADJUSTMENT: 'Phiếu điều chỉnh',
};

export function StockDocumentModal({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data: doc, isLoading } = useQuery({
    queryKey: ['stock', 'documents', id],
    queryFn: () => api<StockDocument>(`/stock/documents/${id}`),
    enabled: id !== null,
  });

  return (
    <Modal
      open={id !== null}
      title={doc ? `${docTypeLabel[doc.type]} ${doc.code}` : 'Phiếu kho'}
      onClose={onClose}
      wide
      footer={<Button onClick={onClose}>Đóng</Button>}
    >
      {isLoading || !doc ? (
        <p className="text-sm text-slate-500">Đang tải…</p>
      ) : (
        <>
          <div className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-slate-500">Ngày</div>
              <div className="font-medium">{fmtDate(doc.docDate)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Kho</div>
              <div className="font-medium">
                {doc.warehouse.name}
                {doc.toWarehouse && ` → ${doc.toWarehouse.name}`}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Trạng thái</div>
              {doc.status === 'POSTED' ? <Badge tone="green">Đã ghi sổ</Badge> : <Badge>{doc.status}</Badge>}
            </div>
            {doc.supplier && (
              <div>
                <div className="text-xs text-slate-500">Nhà cung cấp</div>
                <div className="font-medium">{doc.supplier.name}</div>
              </div>
            )}
            {doc.purchaseOrder && (
              <div>
                <div className="text-xs text-slate-500">Theo đơn mua</div>
                <Link to={`/purchase-orders/${doc.purchaseOrder.id}`} onClick={onClose} className="font-medium text-teal-700 hover:underline">
                  {doc.purchaseOrder.code}
                </Link>
              </div>
            )}
            <div>
              <div className="text-xs text-slate-500">Người lập / ghi sổ</div>
              <div className="font-medium">
                {doc.createdBy.fullName}
                {doc.postedBy && doc.postedBy.fullName !== doc.createdBy.fullName && ` / ${doc.postedBy.fullName}`}
              </div>
            </div>
          </div>
          {doc.note && <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm">{doc.note}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Vật tư</th>
                  <th className="py-2 pr-3 text-right">Số lượng</th>
                  <th className="py-2 pr-3 text-right">Quy đổi</th>
                  <th className="py-2 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs text-slate-500">{l.material.code}</span> {l.material.name}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">
                      {fmtQty(l.quantity)} {l.unit.name.toLowerCase()}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap text-slate-500 tabular-nums">
                      {fmtQty(l.baseQuantity)} {l.material.baseUnit.name.toLowerCase()}
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmtMoney(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-3 text-right text-slate-500">
                    Tổng
                  </td>
                  <td className="pt-3 text-right font-semibold tabular-nums">{fmtMoney(doc.totalAmount)} đ</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
