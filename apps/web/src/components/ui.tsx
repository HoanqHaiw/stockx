import { useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { t } from '../i18n';

/** Chuỗi thì dịch, phần tử React thì giữ nguyên. */
const tr = (v: ReactNode) => (typeof v === 'string' ? t(v) : v);

// ───────── Nút ─────────
// Theo hệ thiết kế: một cặp nút chính/phụ. "ghost" chỉ dùng cho nút biểu tượng và thao tác phụ trong dòng.
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700 hover:border-teal-700',
  secondary: 'bg-white text-slate-800 border-slate-300 hover:border-slate-400 hover:bg-slate-50',
  ghost: 'bg-transparent text-slate-600 border-transparent hover:bg-slate-100 hover:text-slate-800',
  danger: 'bg-white text-red-700 border-slate-300 hover:border-red-300 hover:bg-red-50',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-3.5 text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45 ${variants[variant]} ${className}`}
    />
  );
}

// ───────── Ô nhập ─────────
const inputCls =
  'h-10 w-full rounded-md border bg-white px-3 text-sm text-slate-800 transition-colors placeholder:text-slate-400 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 disabled:bg-slate-50 disabled:text-slate-500';
const borderCls = (error?: string) =>
  error ? 'border-red-600 border-2 focus-visible:outline-red-600' : 'border-slate-300 hover:border-slate-400 focus-visible:outline-teal-600';

export function Field({
  label,
  error,
  required,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {t(label)} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-red-700">{t(error)}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-slate-500">{t(hint)}</p>
      )}
    </div>
  );
}

export function TextInput({
  label,
  error,
  required,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <Field label={label} error={error} required={required} hint={hint} htmlFor={id}>
      <input
        id={id}
        aria-invalid={!!error}
        {...props}
        placeholder={props.placeholder ? t(props.placeholder) : undefined}
        className={`${inputCls} ${borderCls(error)} ${props.className ?? ''}`}
      />
    </Field>
  );
}

export function SelectInput({
  label,
  error,
  required,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <Field label={label} error={error} required={required} htmlFor={id}>
      <select id={id} aria-invalid={!!error} {...props} className={`${inputCls} ${borderCls(error)} pr-8`}>
        {children}
      </select>
    </Field>
  );
}

/** Ô chọn gọn dùng cho thanh lọc. */
export function FilterSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-9 rounded-md border border-slate-300 bg-white px-3 pr-8 text-sm text-slate-700 transition-colors hover:border-slate-400 focus:outline-none focus-visible:outline-2 focus-visible:outline-teal-600 ${props.className ?? ''}`}
    />
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-auto sm:max-w-xs sm:min-w-0 sm:flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t(placeholder)}
        aria-label={t(placeholder)}
        className="h-9 w-full rounded-md border border-slate-300 bg-white pr-3 pl-9 text-sm transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:outline-none focus-visible:outline-2 focus-visible:outline-teal-600"
      />
    </div>
  );
}

// ───────── Hộp thoại ─────────
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Chỉ hộp thoại trên cùng đóng lại khi có nhiều hộp chồng nhau.
      const dialogs = document.querySelectorAll('[role="dialog"]');
      const self = document.getElementById(dialogId);
      if (dialogs[dialogs.length - 1] === self) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const dialogId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/35 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-label={t(title)}
        onMouseDown={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(23,36,41,.06),0_12px_32px_-8px_rgba(23,36,41,.18)] sm:rounded-xl ${
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <h2 className="font-semibold tracking-[-0.01em]">{t(title)}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800" aria-label={t('Đóng')}>
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ───────── Khác ─────────
type Tone = 'slate' | 'green' | 'red' | 'amber' | 'teal';
const tones: Record<Tone, { box: string; dot: string }> = {
  slate: { box: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  green: { box: 'bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
  red: { box: 'bg-red-50 text-red-700', dot: 'bg-red-600' },
  amber: { box: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  teal: { box: 'bg-teal-50 text-teal-700', dot: 'bg-teal-600' },
};

/** Nhãn trạng thái: chấm màu + chữ (không dùng màu làm tín hiệu duy nhất). */
export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone].box}`}>
      <span className={`size-1.5 rounded-full ${tones[tone].dot}`} aria-hidden />
      {tr(children)}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">{t(title)}</h1>
        {subtitle && <p className="mt-1 max-w-[62ch] text-sm text-slate-500">{t(subtitle)}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Khung trắng viền mảnh dùng cho bảng, danh sách, nhóm thông tin. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(23,36,41,.04)] ${className}`}>{children}</div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-2 px-1 py-2.5 text-sm text-slate-500">
      <span className="tabular-nums">{t('{from}–{to} trên {total}', { from, to, total })}</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" className="px-2" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('Trang trước')}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="tabular-nums text-slate-700">
          {page}/{pages}
        </span>
        <Button variant="ghost" className="px-2" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('Trang sau')}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-4 py-12 text-center text-sm text-slate-500">{tr(children)}</div>;
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {t(message)}
    </p>
  );
}
