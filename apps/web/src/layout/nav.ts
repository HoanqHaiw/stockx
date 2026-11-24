import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  FileText,
  LayoutDashboard,
  PackageMinus,
  PackagePlus,
  Truck,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../lib/roles';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[]; // bỏ trống = mọi vai trò
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    title: 'Tổng quan',
    items: [{ to: '/', label: 'Bảng điều khiển', icon: LayoutDashboard }],
  },
  {
    title: 'Danh mục',
    items: [
      { to: '/materials', label: 'Vật tư', icon: Boxes },
      { to: '/suppliers', label: 'Nhà cung cấp', icon: Truck, roles: ['PURCHASING', 'ACCOUNTANT'] },
      { to: '/customers', label: 'Khách hàng', icon: Users, roles: ['SALES', 'ACCOUNTANT'] },
      { to: '/warehouses', label: 'Kho', icon: Warehouse, roles: ['WAREHOUSE'] },
    ],
  },
  {
    title: 'Mua bán',
    items: [
      { to: '/purchase-orders', label: 'Đơn mua hàng', icon: ClipboardList, roles: ['PURCHASING'] },
      { to: '/quotations', label: 'Báo giá', icon: FileText, roles: ['SALES'] },
      { to: '/sales-orders', label: 'Đơn bán hàng', icon: ClipboardList, roles: ['SALES'] },
    ],
  },
  {
    title: 'Kho',
    items: [
      { to: '/stock/receipts', label: 'Nhập kho', icon: PackagePlus, roles: ['WAREHOUSE'] },
      { to: '/stock/issues', label: 'Xuất kho', icon: PackageMinus, roles: ['WAREHOUSE'] },
      { to: '/stock/transfers', label: 'Chuyển kho', icon: ArrowLeftRight, roles: ['WAREHOUSE'] },
      { to: '/stock/counts', label: 'Kiểm kê', icon: ClipboardCheck, roles: ['WAREHOUSE'] },
      { to: '/stock/balances', label: 'Tồn kho', icon: Boxes },
    ],
  },
  {
    title: 'Tài chính',
    items: [
      { to: '/debts', label: 'Công nợ', icon: Wallet, roles: ['ACCOUNTANT'] },
      { to: '/reports', label: 'Báo cáo', icon: BarChart3, roles: ['ACCOUNTANT', 'PURCHASING', 'SALES'] },
    ],
  },
];
