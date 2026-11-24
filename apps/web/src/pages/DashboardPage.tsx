import type { ReactNode } from 'react';
import { locale, t } from '../i18n';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, ClipboardList, PackageMinus, PackagePlus, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { fmtMoney } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ui';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

interface Dashboard {
  kpi: {
    revenueMonth: string;
    revenuePrevMonth: string;
    purchaseMonth: string;
    inventoryValue: string;
    receivable: string;
    receivableOverdue: string;
    payable: string;
    lowStockCount: number;
  };
  pending: {
    purchaseOrdersToApprove: number;
    salesOrdersToApprove: number;
    purchaseOrdersToReceive: number;
    salesOrdersToDeliver: number;
  };
  series: { day: string; revenue: string; purchase: string }[];
  topMaterials: { code: string; name: string; revenue: string }[];
  topDebtors: { code: string; name: string; balance: string }[];
}

// Hai màu danh mục đầu tiên của bảng màu đã kiểm định (đủ tách biệt cho người mù màu).
const SERIES = { revenue: '#2a78d6', purchase: '#eb6834' };

/** Rút gọn số tiền cho trục và ô số liệu: 1.250.000.000 → 1,25 tỷ. */
const short = (v: number) =>
  Math.abs(v) >= 1e9
    ? `${(v / 1e9).toLocaleString(locale(), { maximumFractionDigits: 2 })} ${t('tỷ')}`
    : Math.abs(v) >= 1e6
      ? `${(v / 1e6).toLocaleString(locale(), { maximumFractionDigits: 1 })} ${t('tr')}`
      : v.toLocaleString(locale());

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'dashboard'],
    queryFn: () => api<Dashboard>('/reports/dashboard'),
  });

  if (error) return <ErrorBanner message={t('Không tải được bảng điều khiển')} />;

  const k = data?.kpi;
  const growth =
    k && Number(k.revenuePrevMonth) > 0 ? (Number(k.revenueMonth) / Number(k.revenuePrevMonth) - 1) * 100 : null;

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-xl font-semibold">{t('Xin chào,')}{' '}{user?.fullName}</h1>
      <p className="mb-5 text-sm text-slate-500">{t('Tình hình kinh doanh và kho tháng này')}</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={t('Doanh thu tháng này')}
          value={k && `${short(Number(k.revenueMonth))} ${t('đ')}`}
          sub={
            k && (
              <span className="inline-flex items-center gap-0.5 text-slate-500">
                {growth !== null &&
                  (growth >= 0 ? (
                    <ArrowUpRight className="size-3.5 text-emerald-700" />
                  ) : (
                    <ArrowDownRight className="size-3.5 text-slate-400" />
                  ))}
                {t('Cả tháng trước:')}{' '}{short(Number(k.revenuePrevMonth))}{' '}{t('đ')}
              </span>
            )
          }
          loading={isLoading}
        />
        <Kpi label={t('Giá trị nhập tháng này')} value={k && `${short(Number(k.purchaseMonth))} ${t('đ')}`} loading={isLoading} />
        <Kpi
          label={t('Giá trị tồn kho')}
          value={k && `${short(Number(k.inventoryValue))} ${t('đ')}`}
          sub={
            k && k.lowStockCount > 0 ? (
              <Link to="/stock/balances" className="inline-flex items-center gap-1 text-red-700 hover:underline">
                <AlertTriangle className="size-3.5" /> {k.lowStockCount}{' '}{t('mã dưới mức tối thiểu')}
              </Link>
            ) : undefined
          }
          loading={isLoading}
        />
        <Kpi
          label={t('Phải thu khách hàng')}
          value={k && `${short(Number(k.receivable))} ${t('đ')}`}
          sub={
            k && Number(k.receivableOverdue) > 0 ? (
              <span className="inline-flex items-center gap-1 text-red-700">
                <AlertTriangle className="size-3.5" />{' '}{t('Quá hạn')}{' '}{short(Number(k.receivableOverdue))}{' '}{t('đ')}
              </span>
            ) : (
              k && t('Phải trả NCC: {v}', { v: `${short(Number(k.payable))} ${t('đ')}` })
            )
          }
          loading={isLoading}
        />
      </div>

      {data && (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Todo icon={<ClipboardList className="size-4" />} to="/purchase-orders" label={t('Đơn mua chờ duyệt')} n={data.pending.purchaseOrdersToApprove} />
          <Todo icon={<ClipboardList className="size-4" />} to="/sales-orders" label={t('Đơn bán chờ duyệt')} n={data.pending.salesOrdersToApprove} />
          <Todo icon={<PackagePlus className="size-4" />} to="/stock/receipts" label={t('Đơn chờ nhận hàng')} n={data.pending.purchaseOrdersToReceive} />
          <Todo icon={<PackageMinus className="size-4" />} to="/stock/issues" label={t('Đơn chờ giao hàng')} n={data.pending.salesOrdersToDeliver} />
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">{t('Doanh thu và giá trị nhập 30 ngày gần nhất')}</h2>
          <div className="h-64">{data ? <TrendChart series={data.series} /> : <div className="h-full animate-pulse rounded bg-slate-50" />}</div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Boxes className="size-4 text-slate-400" />{' '}{t('Bán chạy 30 ngày')}
          </h2>
          <RankList items={data?.topMaterials.map((m) => ({ key: m.code, label: m.name, sub: m.code, value: Number(m.revenue) })) ?? []} />
        </section>
      </div>

      {data && data.topDebtors.length > 0 && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 lg:w-1/3">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Wallet className="size-4 text-slate-400" />{' '}{t('Khách hàng nợ nhiều nhất')}
          </h2>
          <RankList items={data.topDebtors.map((d) => ({ key: d.code, label: d.name, sub: d.code, value: Number(d.balance) }))} />
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, loading }: { label: string; value?: string; sub?: ReactNode; loading: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500 sm:text-sm">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">
        {loading ? <span className="inline-block h-7 w-24 animate-pulse rounded bg-slate-100" /> : value}
      </div>
      {sub && <div className="mt-1 text-xs">{sub}</div>}
    </div>
  );
}

function Todo({ icon, label, n, to }: { icon: ReactNode; label: string; n: number; to: string }) {
  return (
    <Link
      to={to}
      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
        n > 0 ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100' : 'border-slate-200 bg-white text-slate-500'
      }`}
    >
      <span className="flex items-center gap-2">
        {icon} {label}
      </span>
      <span className="font-semibold tabular-nums">{n}</span>
    </Link>
  );
}

/** Danh sách xếp hạng có thanh tỉ lệ (thay cho biểu đồ cột khi chỉ có ≤ 5 mục). */
function RankList({ items }: { items: { key: string; label: string; sub: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="text-sm text-slate-500">{t('Chưa có dữ liệu.')}</p>;
  return (
    <ol className="space-y-3">
      {items.map((i) => (
        <li key={i.key} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="truncate">{i.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{short(i.value)}{' '}{t('đ')}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-slate-400" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function TrendChart({ series }: { series: Dashboard['series'] }) {
  const labels = series.map((s) => {
    const [, m, d] = s.day.split('-');
    return `${d}/${m}`;
  });
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false }, // rê chuột ở đâu cũng xem được cả hai giá trị của ngày đó
    plugins: {
      legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8, color: '#475569' } },
      tooltip: {
        callbacks: { label: (c) => `${c.dataset.label}: ${fmtMoney(c.parsed.y)} ${t('đ')}` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#64748b', maxTicksLimit: 8 } },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: '#f1f5f9' },
        ticks: { color: '#64748b', callback: (v) => short(Number(v)), maxTicksLimit: 5 },
      },
    },
    elements: { line: { borderWidth: 2, tension: 0.25 }, point: { radius: 0, hoverRadius: 4 } },
  };
  return (
    <Line
      options={options}
      aria-label={t('Biểu đồ doanh thu và giá trị nhập theo ngày')}
      data={{
        labels,
        datasets: [
          { label: t('Doanh thu'), data: series.map((s) => Number(s.revenue)), borderColor: SERIES.revenue, backgroundColor: SERIES.revenue },
          { label: t('Giá trị nhập'), data: series.map((s) => Number(s.purchase)), borderColor: SERIES.purchase, backgroundColor: SERIES.purchase },
        ],
      }}
    />
  );
}
