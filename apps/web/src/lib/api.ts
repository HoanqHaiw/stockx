const TOKEN_KEY = 'vattu-hub.token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* trình duyệt chặn lưu trữ: chỉ giữ phiên trong bộ nhớ */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* bỏ qua */
    }
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const BASE = import.meta.env.VITE_API_URL ?? '';

/** Gọi API kèm token; lỗi trả về luôn có dạng ApiError với thông báo tiếng Việt từ server. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, { ...init, headers, body });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ');
  }

  if (res.status === 401 && token) {
    tokenStore.clear();
    window.dispatchEvent(new Event('vattu-hub:logout'));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'HTTP_' + res.status,
      data?.error?.message ?? 'Có lỗi xảy ra, vui lòng thử lại',
      data?.error?.details,
    );
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
