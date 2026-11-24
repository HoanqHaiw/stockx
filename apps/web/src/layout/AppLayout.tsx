import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { LogOut, Menu, Package, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { canAccess, roleLabel } from '../lib/roles';
import { navSections } from './nav';

export function AppLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Trên điện thoại: đóng menu sau khi chuyển trang.
  useEffect(() => setOpen(false), [location.pathname]);

  const sections = navSections
    .map((s) => ({ ...s, items: s.items.filter((i) => canAccess(user, i.roles)) }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="flex h-full">
      {open && (
        <button
          aria-label="Đóng menu"
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 text-slate-300 transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold text-white">
            <Package className="size-5 text-teal-400" /> VatTu Hub
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Đóng menu">
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {sections.map((s) => (
            <div key={s.title} className="mt-4">
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {s.title}
              </div>
              {s.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                      isActive ? 'bg-teal-600 text-white' : 'hover:bg-slate-800 hover:text-white'
                    }`
                  }
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Mở menu">
            <Menu className="size-5" />
          </button>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{user?.fullName}</div>
              <div className="text-xs text-slate-500">{user && roleLabel[user.role]}</div>
            </div>
            <button
              onClick={logout}
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title="Đăng xuất"
              aria-label="Đăng xuất"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
