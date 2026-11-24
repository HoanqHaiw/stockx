import { useQuery } from '@tanstack/react-query';
import { Boxes, Truck, Users, Warehouse } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

interface Summary {
  materials: number;
  warehouses: number;
  suppliers: number;
  customers: number;
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['master', 'summary'],
    queryFn: () => api<Summary>('/master/summary'),
  });

  const tiles = [
    { label: 'Vật tư đang kinh doanh', value: data?.materials, icon: Boxes },
    { label: 'Kho', value: data?.warehouses, icon: Warehouse },
    { label: 'Nhà cung cấp', value: data?.suppliers, icon: Truck },
    { label: 'Khách hàng', value: data?.customers, icon: Users },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-xl font-semibold">Xin chào, {user?.fullName}</h1>
      <p className="mb-6 text-sm text-slate-500">Tổng quan hệ thống quản lý vật tư</p>

      {error && <p className="mb-4 text-sm text-red-600">Không tải được dữ liệu tổng quan.</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs sm:text-sm">{t.label}</span>
              <t.icon className="size-4" />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">
              {isLoading ? <span className="inline-block h-7 w-10 animate-pulse rounded bg-slate-100" /> : t.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
