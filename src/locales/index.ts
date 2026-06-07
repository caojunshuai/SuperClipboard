import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './zh-CN.json';
import enUS from './en-US.json';

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const FALLBACK_LOCALE: Locale = 'en-US';

export function detectSystemLocale(): Locale {
  const lang = navigator.language || '';
  if (lang.startsWith('zh')) return 'zh-CN';
  return 'en-US';
}

export function isValidLocale(v: string): v is Locale {
  return SUPPORTED_LOCALES.includes(v as Locale);
}

const resources = {
  'zh-CN': { translation: zhCN },
  'en-US': { translation: enUS },
};

i18n.use(initReactI18next).init({
  resources,
  lng: detectSystemLocale(),
  fallbackLng: FALLBACK_LOCALE,
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

export default i18n;
