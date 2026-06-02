import { jaJP } from './locales/ja-JP';
import { zhCN } from './locales/zh-CN';

export const LOCALE_STORAGE_KEY = 'oshikatsu_locale_mode';

export const LOCALES = ['zh-CN', 'ja-JP'] as const;
export type Locale = (typeof LOCALES)[number];
export type LocaleMode = Locale | 'system';
export type Messages = Record<string, string>;
export type MessageCatalog = Record<Locale, Partial<Messages>>;
export type TranslationParams = Record<string, string | number | null | undefined>;
export type TFunction = ReturnType<typeof createTranslator>;

export const messages: MessageCatalog = {
  'zh-CN': zhCN,
  'ja-JP': jaJP,
};

export function normalizeLocaleMode(value: unknown): LocaleMode {
  return value === 'zh-CN' || value === 'ja-JP' || value === 'system' ? value : 'system';
}

export function resolveLocale(mode: LocaleMode, languages: readonly string[] = readSystemLanguages()): Locale {
  if (mode !== 'system') return mode;

  for (const language of languages) {
    const normalized = language.toLowerCase();
    if (normalized.startsWith('zh')) return 'zh-CN';
    if (normalized.startsWith('ja')) return 'ja-JP';
  }

  return 'zh-CN';
}

export function readSystemLanguages(): string[] {
  if (typeof navigator === 'undefined') return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return [...navigator.languages];
  }
  return navigator.language ? [navigator.language] : [];
}

export function interpolate(template: string, params: TranslationParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === null || value === undefined ? match : String(value);
  });
}

export function createTranslator(locale: Locale, catalog: MessageCatalog = messages) {
  return (key: string, params?: TranslationParams): string => {
    const template = catalog[locale]?.[key] ?? catalog['zh-CN']?.[key] ?? key;
    return interpolate(template, params);
  };
}
