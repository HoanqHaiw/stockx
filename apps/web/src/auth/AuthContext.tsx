import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, tokenStore } from '../lib/api';
import type { User } from '../lib/roles';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => !!tokenStore.get());

  // Khôi phục phiên từ token đã lưu.
  useEffect(() => {
    if (!tokenStore.get()) return;
    api<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      // Chỉ xoá phiên khi token thật sự hết hạn; mất kết nối tạm thời thì giữ token để tải lại là vào được.
      .catch((err) => err instanceof ApiError && err.status === 401 && tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  // API trả 401 ở bất kỳ đâu thì đăng xuất.
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('vattu-hub:logout', onLogout);
    return () => window.removeEventListener('vattu-hub:logout', onLogout);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      json: { email, password },
    });
    tokenStore.set(r.token);
    setUser(r.user);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}
