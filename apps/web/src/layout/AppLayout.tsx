import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { t } from '../i18n';
import { LanguageSwitch } from '../i18n/LanguageProvider';
import { canAccess, roleLabel } from '../lib/roles';
import { navSections } from './nav';

/** Logo chữ: ô vuông màu nhấn + tên sản phẩm. */
export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-7 place-items-center rounded-md bg-teal-600 font-mono text-xs font-medium text-white">JS</span>
      <span className="font-semibold tracking-[-0.01em] text-slate-900">Justin Stock</span>
    </div>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Trên điện thoại: đóng menu sau khi chuyển trang.
  useEffect(() => setOpen(false), [location.pathname]);

  const sections = navSections
    .map((s) => ({ ...s, items: s.items.filter((i) => canAccess(user, i.roles)) }))
    .filter((s) => s.items.length > 0);
  const initials = user?.fullName
    .split(' ')
    .slice(-2)
    .map((w) => w[0])
    .join('');

  return (
    <div className="flex h-full">
      {open && (
        <button aria-label={t('Đóng menu')} className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-out lg:static lg:translate-x-0 lg:transition-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <Brand />
          <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(false)} aria-label={t('Đóng menu')}>
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          {sections.map((s) => (
            <div key={s.title} className="mt-5 first:mt-2">
              <div className="px-2 pb-1.5 text-xs font-medium text-slate-400">{t(s.title)}</div>
              {s.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      isActive
                        ? 'bg-slate-100 font-medium text-slate-900 before:absolute before:inset-y-1.5 before:-left-3 before:w-0.5 before:rounded-r before:bg-teal-600'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className={`size-4 shrink-0 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
                      {t(item.label)}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 sm:px-6">
          <button className="rounded-md p-1 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label={t('Mở menu')}>
            <Menu className="size-5" />
          </button>
          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitch />
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium text-slate-800">{user?.fullName}</div>
              <div className="text-xs text-slate-500">{user && t(roleLabel[user.role])}</div>
            </div>
            <span className="grid size-8 place-items-center rounded-full bg-slate-100 text-xs font-medium text-slate-700" aria-hidden>
              {initials}
            </span>
            <button
              onClick={logout}
              className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              title={t('Đăng xuất')}
              aria-label={t('Đăng xuất')}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
