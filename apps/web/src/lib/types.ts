export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Unit {
  id: number;
  code: string;
  name: string;
}

export interface MaterialGroup {
  id: number;
  code: string;
  name: string;
}

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  address: string | null;
  type: 'MAIN' | 'SITE';
  isActive: boolean;
}

export interface Material {
  id: number;
  code: string;
  name: string;
  specification: string | null;
  groupId: number;
  baseUnitId: number;
  purchasePrice: string;
  salePrice: string;
  minStock: string;
  isActive: boolean;
  group: MaterialGroup;
  baseUnit: Unit;
  conversions: { id: number; unitId: number; factor: string; unit: Unit }[];
  totalStock?: string;
}

export interface MaterialDetail extends Material {
  balances: { warehouseId: number; quantity: string; warehouse: Warehouse }[];
}

export interface Partner {
  id: number;
  code: string;
  name: string;
  taxCode: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
}

export type PoStatus = 'DRAFT' | 'APPROVED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

export const poStatusLabel: Record<PoStatus, string> = {
  DRAFT: 'Nháp',
  APPROVED: 'Đã duyệt',
  PARTIALLY_RECEIVED: 'Nhận một phần',
  RECEIVED: 'Đã nhận đủ',
  CANCELLED: 'Đã huỷ',
};
export const poStatusTone: Record<PoStatus, 'slate' | 'teal' | 'amber' | 'green' | 'red'> = {
  DRAFT: 'slate',
  APPROVED: 'teal',
  PARTIALLY_RECEIVED: 'amber',
  RECEIVED: 'green',
  CANCELLED: 'red',
};

export interface PurchaseOrderSummary {
  id: number;
  code: string;
  status: PoStatus;
  orderDate: string;
  expectedDate: string | null;
  totalAmount: string;
  supplier: { code: string; name: string };
  warehouse: { code: string; name: string };
}

export interface PurchaseOrderLine {
  id: number;
  materialId: number;
  unitId: number;
  factor: string;
  quantity: string;
  baseQuantity: string;
  receivedBaseQty: string;
  unitPrice: string;
  amount: string;
  material: Material;
}

export interface PurchaseOrder extends Omit<PurchaseOrderSummary, 'supplier' | 'warehouse'> {
  supplierId: number;
  warehouseId: number;
  note: string | null;
  supplier: Partner;
  warehouse: Warehouse;
  createdBy: { id: number; fullName: string };
  approvedBy: { id: number; fullName: string } | null;
  approvedAt: string | null;
  lines: PurchaseOrderLine[];
  stockDocuments: {
    id: number;
    code: string;
    docDate: string;
    status: string;
    totalAmount: string;
    createdBy: { fullName: string };
  }[];
}

// ───────── Bán hàng ─────────

export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
export const quotationStatusLabel: Record<QuotationStatus, string> = {
  DRAFT: 'Nháp',
  SENT: 'Đã gửi khách',
  ACCEPTED: 'Đã chốt đơn',
  REJECTED: 'Khách từ chối',
  EXPIRED: 'Hết hạn',
};
export const quotationStatusTone: Record<QuotationStatus, 'slate' | 'teal' | 'amber' | 'green' | 'red'> = {
  DRAFT: 'slate',
  SENT: 'teal',
  ACCEPTED: 'green',
  REJECTED: 'red',
  EXPIRED: 'amber',
};

/** Báo giá chưa chốt mà quá hạn hiệu lực thì hiển thị là "Hết hạn". */
export function effectiveQuotationStatus(q: { status: QuotationStatus; validUntil: string | null }): QuotationStatus {
  if ((q.status === 'DRAFT' || q.status === 'SENT') && q.validUntil) {
    const end = new Date(q.validUntil);
    end.setHours(23, 59, 59, 999);
    if (end < new Date()) return 'EXPIRED';
  }
  return q.status;
}

export interface OrderLine {
  id: number;
  materialId: number;
  unitId: number;
  factor: string;
  quantity: string;
  baseQuantity: string;
  unitPrice: string;
  amount: string;
  material: Material;
}

export interface QuotationSummary {
  id: number;
  code: string;
  status: QuotationStatus;
  quoteDate: string;
  validUntil: string | null;
  totalAmount: string;
  customer: { code: string; name: string };
}

export interface Quotation extends Omit<QuotationSummary, 'customer'> {
  customerId: number;
  note: string | null;
  customer: Partner;
  createdBy: { id: number; fullName: string };
  lines: OrderLine[];
  salesOrders: { id: number; code: string; status: SoStatus }[];
}

export type SoStatus = 'DRAFT' | 'APPROVED' | 'PARTIALLY_DELIVERED' | 'DELIVERED' | 'CANCELLED';
export const soStatusLabel: Record<SoStatus, string> = {
  DRAFT: 'Nháp',
  APPROVED: 'Đã duyệt',
  PARTIALLY_DELIVERED: 'Giao một phần',
  DELIVERED: 'Đã giao đủ',
  CANCELLED: 'Đã huỷ',
};
export const soStatusTone: Record<SoStatus, 'slate' | 'teal' | 'amber' | 'green' | 'red'> = {
  DRAFT: 'slate',
  APPROVED: 'teal',
  PARTIALLY_DELIVERED: 'amber',
  DELIVERED: 'green',
  CANCELLED: 'red',
};

export interface SalesOrderSummary {
  id: number;
  code: string;
  status: SoStatus;
  orderDate: string;
  deliveryDate: string | null;
  totalAmount: string;
  customer: { code: string; name: string };
  warehouse: { code: string; name: string };
}

export interface SalesOrder extends Omit<SalesOrderSummary, 'customer' | 'warehouse'> {
  customerId: number;
  warehouseId: number;
  note: string | null;
  customer: Partner;
  warehouse: Warehouse;
  quotation: { id: number; code: string } | null;
  createdBy: { id: number; fullName: string };
  approvedBy: { id: number; fullName: string } | null;
  approvedAt: string | null;
  lines: (OrderLine & { deliveredBaseQty: string })[];
  stockDocuments: PurchaseOrder['stockDocuments'];
}

/** Chi tiết lỗi thiếu hàng do API trả về khi ghi sổ phiếu xuất. */
export interface ShortageItem {
  materialId: number;
  materialCode: string;
  warehouseId: number;
  available: string;
  required: string;
}

export type StockDocType = 'RECEIPT' | 'ISSUE' | 'TRANSFER' | 'ADJUSTMENT';

export interface StockDocumentSummary {
  id: number;
  code: string;
  type: StockDocType;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  docDate: string;
  note: string | null;
  totalAmount: string;
  warehouse: { code: string; name: string };
  toWarehouse: { code: string; name: string } | null;
  supplier: { name: string } | null;
  customer: { name: string } | null;
  purchaseOrder: { id: number; code: string } | null;
  salesOrder: { id: number; code: string } | null;
  createdBy: { fullName: string };
  _count: { lines: number };
}

export interface StockDocument extends Omit<StockDocumentSummary, '_count'> {
  postedBy: { fullName: string } | null;
  postedAt: string | null;
  lines: {
    id: number;
    quantity: string;
    baseQuantity: string;
    unitPrice: string;
    amount: string;
    bookQty: string | null; // chỉ có ở phiếu kiểm kê
    countedQty: string | null;
    unit: Unit;
    material: Material;
  }[];
}

export interface ImportResult {
  total: number;
  toCreate: number;
  toUpdate: number;
  errors: { row: number; code: string; messages: string[] }[];
  applied: boolean;
  errorFile?: string;
}
