import { Construction } from 'lucide-react';
import { t } from '../i18n';

export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-6 text-xl font-semibold">{t(title)}</h1>
      <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-slate-500">
        <Construction className="mb-2 size-8" />
        <p className="text-sm">{t('Chức năng đang được phát triển.')}</p>
      </div>
    </div>
  );
}
