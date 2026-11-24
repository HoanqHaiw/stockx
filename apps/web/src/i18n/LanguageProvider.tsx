import { createContext, Fragment, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getLang, setLang as setGlobalLang, t, type Lang } from './index';

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void } | null>(null);

/** Giữ ngôn ngữ hiện tại; đổi ngôn ngữ thì gắn key mới để toàn bộ giao diện bên trong render lại. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getLang());
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t('Justin Stock – Quản lý vật tư & kho');
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setGlobalLang(l);
    setLangState(l);
  }, []);
  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <Fragment key={lang}>{children}</Fragment>
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang phải nằm trong LanguageProvider');
  return ctx;
}

/** Nút chuyển VI / EN. */
export function LanguageSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-xs font-medium ${className}`} role="group" aria-label="Language">
      {(['vi', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded px-2 py-1 transition-colors ${lang === l ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
