import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { t } from '../i18n';

/**
 * Gói miễn phí của nền tảng deploy cho máy chủ "ngủ" khi không ai dùng; lần truy cập đầu mất ~30–60 giây.
 * Thành phần này gọi /api/health và chỉ hiện thông báo nếu máy chủ phản hồi chậm hơn 1,5 giây.
 */
export function ServerWake() {
  const [state, setState] = useState<'checking' | 'slow' | 'ready'>('checking');

  useEffect(() => {
    let stop = false;
    const slowTimer = setTimeout(() => !stop && setState((s) => (s === 'checking' ? 'slow' : s)), 1500);
    (async () => {
      for (let i = 0; i < 40 && !stop; i++) {
        try {
          const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/health`);
          if (res.ok) {
            setState('ready');
            return;
          }
        } catch {
          /* máy chủ chưa dậy */
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    })();
    return () => {
      stop = true;
      clearTimeout(slowTimer);
    };
  }, []);

  if (state !== 'slow') return null;
  return (
    <p role="status" className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
      {t('Máy chủ demo đang khởi động sau thời gian nghỉ, có thể mất khoảng một phút. Bạn cứ chờ, trang sẽ dùng được ngay khi xong.')}
    </p>
  );
}
