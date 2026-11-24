import { en } from './en';

/**
 * Song ngữ Việt – Anh theo kiểu gettext: chuỗi tiếng Việt trong code chính là khoá,
 * bản tiếng Anh tra trong en.ts. Thiếu bản dịch thì hiển thị tiếng Việt (không vỡ giao diện).
 *
 * t() là hàm thường (không phải hook) nên dùng được cả trong hằng số, hàm định dạng, confirm().
 * Khi đổi ngôn ngữ, LanguageProvider gắn lại key cho cây giao diện để mọi thứ render lại.
 */
export type Lang = 'vi' | 'en';
const STORAGE_KEY = 'justin-stock.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'vi' || saved === 'en') return saved;
  } catch {
    /* bộ nhớ trình duyệt bị chặn */
  }
  return 'vi'; // người dùng chính là doanh nghiệp Việt Nam
}

let current: Lang = initialLang();

export const getLang = () => current;
export const locale = () => (current === 'en' ? 'en-US' : 'vi-VN');

export function setLang(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* bỏ qua */
  }
  document.documentElement.lang = lang;
}

const VI_CHARS = /[À-ỹđĐ]/;
const missing = new Set<string>();

/** Dịch một chuỗi tiếng Việt. Tham số dạng {ten} được thay bằng giá trị trong params. */
export function t(vi: string, params?: Record<string, string | number>): string {
  let s = vi;
  if (current === 'en') {
    const hit = en[vi];
    if (hit !== undefined) s = hit;
    else if (import.meta.env.DEV && VI_CHARS.test(vi) && !missing.has(vi)) {
      missing.add(vi);
      console.warn('[i18n] Thiếu bản dịch:', vi);
    }
  }
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
  return s;
}
