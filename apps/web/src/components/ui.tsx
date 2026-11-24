import { useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

// ───────── Nút ─────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-teal-600 text-white hover:bg-teal-700 border-transparent',
  secondary: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent',
  danger: 'bg-white text-red-700 hover:bg-red-50 border-red-200',
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
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

// ───────── Ô nhập ─────────
const inputCls =
  'w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600/20 disabled:bg-slate-50';
const borderCls = (error?: string) => (error ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-teal-600');

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
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
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
      <input id={id} {...props} className={`${inputCls} ${borderCls(error)} ${props.className ?? ''}`} />
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
      <select id={id} {...props} className={`${inputCls} ${borderCls(error)} bg-white`}>
        {children}
      </select>
    </Field>
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
        placeholder={placeholder}
        className={`${inputCls} border-slate-300 pl-9 focus:border-teal-600`}
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:rounded-xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Đóng">
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
export function Badge({ tone = 'slate', children }: { tone?: 'slate' | 'green' | 'red' | 'amber' | 'teal'; children: ReactNode }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-800',
    teal: 'bg-teal-50 text-teal-700',
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
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
    <div className="flex items-center justify-between gap-2 px-1 py-3 text-sm text-slate-600">
      <span>
        {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Trang trước">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="tabular-nums">
          {page}/{pages}
        </span>
        <Button variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Trang sau">
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-12 text-center text-sm text-slate-500">{children}</div>;
}

export function ErrorBanner({ message }: { message: string }) {
  return <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>;
}
