import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createTranslator,
  LOCALE_STORAGE_KEY,
  normalizeLocaleMode,
  readSystemLanguages,
  resolveLocale,
  type Locale,
  type LocaleMode,
  type TFunction,
} from './core';

interface I18nContextValue {
  locale: Locale;
  localeMode: LocaleMode;
  setLocaleMode: (mode: LocaleMode) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readInitialLocaleMode(): LocaleMode {
  if (typeof localStorage === 'undefined') return 'system';
  return normalizeLocaleMode(localStorage.getItem(LOCALE_STORAGE_KEY));
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [localeMode, setLocaleModeState] = useState<LocaleMode>(readInitialLocaleMode);
  const [systemLanguages, setSystemLanguages] = useState<string[]>(readSystemLanguages);

  useEffect(() => {
    const handleLanguageChange = () => setSystemLanguages(readSystemLanguages());
    window.addEventListener('languagechange', handleLanguageChange);
    return () => window.removeEventListener('languagechange', handleLanguageChange);
  }, []);

  const setLocaleMode = useCallback((mode: LocaleMode) => {
    setLocaleModeState(mode);
    localStorage.setItem(LOCALE_STORAGE_KEY, mode);
  }, []);

  const locale = useMemo(() => resolveLocale(localeMode, systemLanguages), [localeMode, systemLanguages]);
  const t = useMemo(() => createTranslator(locale), [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, localeMode, setLocaleMode, t }),
    [locale, localeMode, setLocaleMode, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
