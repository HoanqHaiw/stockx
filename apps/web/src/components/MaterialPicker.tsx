import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import type { Material, Paged } from '../lib/types';
import { useDebounced } from '../hooks/useDebounced';

/** Ô chọn vật tư có tìm kiếm theo mã/tên, phù hợp danh mục hàng trăm mã. */
export function MaterialPicker({
  value,
  onChange,
  error,
}: {
  value: Material | null;
  onChange: (m: Material) => void;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 200);
  const ref = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['materials', 'picker', debounced],
    queryFn: () => api<Paged<Material>>(`/materials?pageSize=15&q=${encodeURIComponent(debounced)}`),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-left text-sm ${
          error ? 'border-red-400' : 'border-slate-300'
        }`}
      >
        <span className={`truncate ${value ? '' : 'text-slate-400'}`}>
          {value ? (
            <>
              <span className="font-mono text-xs text-slate-500">{value.code}</span> {value.name}
            </>
          ) : (
            'Chọn vật tư…'
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-72 rounded-md border border-slate-200 bg-white shadow-lg">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Gõ mã hoặc tên vật tư…"
            className="w-full border-b border-slate-200 px-3 py-2 text-sm outline-none"
          />
          <ul className="max-h-64 overflow-y-auto py-1">
            {data?.items.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(m);
                    setOpen(false);
                    setQ('');
                  }}
                  className="flex w-full flex-col px-3 py-1.5 text-left text-sm hover:bg-teal-50"
                >
                  <span>
                    <span className="font-mono text-xs text-slate-500">{m.code}</span> {m.name}
                  </span>
                  {m.specification && <span className="text-xs text-slate-400">{m.specification}</span>}
                </button>
              </li>
            ))}
            {!isFetching && data?.items.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">Không tìm thấy vật tư</li>
            )}
            {isFetching && !data && <li className="px-3 py-2 text-sm text-slate-500">Đang tìm…</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
