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
