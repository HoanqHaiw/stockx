import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Package } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { roleLabel, type Role } from '../lib/roles';

// Tài khoản demo tạo bởi prisma/seed.ts, hiển thị sẵn để nhà tuyển dụng thử nhanh từng vai trò.
const DEMO_PASSWORD = 'Demo@123';
const demoAccounts: { role: Role; email: string }[] = [
  { role: 'ADMIN', email: 'admin@vattuhub.test' },
  { role: 'PURCHASING', email: 'muahang@vattuhub.test' },
  { role: 'SALES', email: 'kinhdoanh@vattuhub.test' },
  { role: 'WAREHOUSE', email: 'thukho@vattuhub.test' },
  { role: 'ACCOUNTANT', email: 'ketoan@vattuhub.test' },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (user) return <Navigate to={from} replace />;

  async function doLogin(e: string, p: string) {
    setBusy(true);
    setError(null);
    try {
      await login(e, p);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Đăng nhập thất bại');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void doLogin(email, password);
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-xl font-semibold">
          <Package className="size-6 text-teal-600" /> VatTu Hub
        </div>
        <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold">Đăng nhập</h1>
          <p className="mb-5 text-sm text-slate-500">Hệ thống quản lý vật tư, kho và công nợ</p>

          <label className="mb-1 block text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
          />
          <label className="mb-1 block text-sm font-medium" htmlFor="password">
            Mật khẩu
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
          />
          {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button
            disabled={busy}
            className="w-full rounded-md bg-teal-600 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>

        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/60 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Dùng thử nhanh theo vai trò
          </p>
          <div className="flex flex-wrap gap-2">
            {demoAccounts.map((a) => (
              <button
                key={a.role}
                type="button"
                disabled={busy}
                onClick={() => void doLogin(a.email, DEMO_PASSWORD)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs hover:border-teal-600 hover:text-teal-700 disabled:opacity-60"
              >
                {roleLabel[a.role]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
