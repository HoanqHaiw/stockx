const TOKEN_KEY = 'justin-stock.token';

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
export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown; /** mã lỗi HTTP vẫn trả về thân phản hồi như kết quả */ okStatuses?: number[] } = {},
): Promise<T> {
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
    window.dispatchEvent(new Event('justin-stock:logout'));
  }
  if (!res.ok && !init.okStatuses?.includes(res.status)) {
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

/** Lỗi theo từng trường từ Zod ở backend: { code: ['Mã ...'] } → { code: 'Mã ...' }. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError)) return {};
  const fe = (err.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors ?? {};
  return Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0]]));
}

/** Tải file từ API có kèm token (không dùng được thẻ <a href> trực tiếp). */
export async function downloadFile(path: string, fallbackName: string) {
  const token = tokenStore.get();
  const res = await fetch(`${BASE}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD', 'Không tải được file');
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  saveBlob(await res.blob(), name);
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function base64ToBlob(base64: string, type: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type });
}
