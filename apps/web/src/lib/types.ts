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

export interface ImportResult {
  total: number;
  toCreate: number;
  toUpdate: number;
  errors: { row: number; code: string; messages: string[] }[];
  applied: boolean;
  errorFile?: string;
}
