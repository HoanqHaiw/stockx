export type Role = 'ADMIN' | 'PURCHASING' | 'SALES' | 'WAREHOUSE' | 'ACCOUNTANT';

export interface User {
  id: number;
  email: string;
  fullName: string;
  role: Role;
}

export const roleLabel: Record<Role, string> = {
  ADMIN: 'Quản trị',
  PURCHASING: 'Mua hàng',
  SALES: 'Kinh doanh',
  WAREHOUSE: 'Thủ kho',
  ACCOUNTANT: 'Kế toán',
};

/** ADMIN luôn có quyền. Khớp với requireRole ở backend. */
export const canAccess = (user: User | null, roles?: Role[]) =>
  !!user && (!roles || user.role === 'ADMIN' || roles.includes(user.role));
