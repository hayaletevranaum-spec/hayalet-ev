import { labI18nEn } from "./lab-i18n-en.js";
import { labI18nTr } from "./lab-i18n-tr.js";

export type LabI18nKey = keyof typeof labI18nEn;
export type LabI18nLocale = "en" | "tr";

type LabI18nDictionary = Partial<Record<LabI18nKey, string>>;
type LabI18nDictionaryBundle = Partial<Record<LabI18nLocale, LabI18nDictionary>>;
type LabI18nParams = Record<string, string | number>;

const LAB_I18N_DICTIONARIES: Record<LabI18nLocale, Record<LabI18nKey, string>> = {
  en: labI18nEn,
  tr: labI18nTr,
};

function hasPhrase(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

export function __testOnlyResolveLabI18nFromDictionaries(
  key: LabI18nKey,
  locale: LabI18nLocale,
  dictionaries: LabI18nDictionaryBundle
): string {
  const localized = dictionaries[locale]?.[key];
  if (hasPhrase(localized)) {
    return localized;
  }
  const fallback = dictionaries.en?.[key];
  if (hasPhrase(fallback)) {
    return fallback;
  }
  return labI18nEn[key];
}

export function resolveLabI18n(key: LabI18nKey, locale: LabI18nLocale): string {
  return __testOnlyResolveLabI18nFromDictionaries(key, locale, LAB_I18N_DICTIONARIES);
}

export function formatLabI18n(
  key: LabI18nKey,
  locale: LabI18nLocale,
  params: LabI18nParams = {}
): string {
  const template = resolveLabI18n(key, locale);
  return Object.entries(params).reduce(function (copy, [name, value]) {
    return copy.replaceAll(`{${name}}`, String(value));
  }, template);
}
