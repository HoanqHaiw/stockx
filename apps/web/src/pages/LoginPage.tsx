import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { t } from '../i18n';
import { LanguageSwitch } from '../i18n/LanguageProvider';
import { Brand } from '../layout/AppLayout';
import { ApiError } from '../lib/api';
import { roleLabel, type Role } from '../lib/roles';
import { Button, ErrorBanner, TextInput } from '../components/ui';

// Tài khoản demo tạo bởi prisma/seed.ts, hiển thị sẵn để nhà tuyển dụng thử nhanh từng vai trò.
const DEMO_PASSWORD = 'Demo@123';
const demoAccounts: { role: Role; email: string; does: string }[] = [
  { role: 'ADMIN', email: 'admin@justinstock.test', does: 'Duyệt đơn, quản lý kho' },
  { role: 'PURCHASING', email: 'muahang@justinstock.test', does: 'Lập đơn mua, nhà cung cấp' },
  { role: 'SALES', email: 'kinhdoanh@justinstock.test', does: 'Báo giá, đơn bán' },
  { role: 'WAREHOUSE', email: 'thukho@justinstock.test', does: 'Nhập, xuất, kiểm kê' },
  { role: 'ACCOUNTANT', email: 'ketoan@justinstock.test', does: 'Công nợ, thu chi' },
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
    <div className="flex min-h-full flex-col">
      <header className="flex h-14 items-center justify-between px-4 sm:px-8">
        <Brand />
        <LanguageSwitch />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="grid w-full max-w-4xl gap-10 lg:grid-cols-[1fr_22rem] lg:items-center">
          <div className="hidden lg:block">
            <h1 className="max-w-md text-4xl leading-tight font-semibold tracking-[-0.025em] text-slate-900">
              {t('Vật tư, kho và công nợ trong một nơi.')}
            </h1>
            <p className="mt-4 max-w-md text-slate-600">
              {t('Mua hàng, nhập kho, bán hàng, xuất kho, kiểm kê và theo dõi công nợ cho doanh nghiệp thương mại vật tư cơ điện.')}
            </p>
          </div>

          <div>
            <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(23,36,41,.04)]">
              <h2 className="text-lg font-semibold tracking-[-0.01em]">{t('Đăng nhập')}</h2>
              <p className="mt-1 mb-5 text-sm text-slate-500">{t('Dùng tài khoản công ty của bạn')}</p>
              {error && <ErrorBanner message={error} />}
              <div className="space-y-4">
                <TextInput label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
                <TextInput
                  label="Mật khẩu"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" variant="primary" disabled={busy} className="mt-5 h-10 w-full">
                {busy ? t('Đang đăng nhập…') : t('Đăng nhập')}
              </Button>
            </form>

            <div className="mt-6">
              <p className="mb-2 text-sm font-medium text-slate-700">{t('Dùng thử nhanh theo vai trò')}</p>
              <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {demoAccounts.map((a) => (
                  <li key={a.role}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void doLogin(a.email, DEMO_PASSWORD)}
                      className="group flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 disabled:opacity-50"
                    >
                      <span>
                        <span className="block text-sm font-medium text-slate-800">{t(roleLabel[a.role])}</span>
                        <span className="block text-xs text-slate-500">{t(a.does)}</span>
                      </span>
                      <ArrowRight className="size-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-600" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
