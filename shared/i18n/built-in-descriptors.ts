import type { BuiltInAppLanguage, LanguageDescriptor } from "../../src/types/i18n.js";
import { BUILT_IN_APP_LANGUAGES } from "../../src/types/i18n.js";
import { isBuiltInAppLanguage, normalizeAppLanguage, resolveSelectorLanguage } from "./locale.js";

const BUILT_IN_LANGUAGE_METADATA = {
  tr: {
    nativeName: "Türkçe",
    englishName: "Turkish",
    direction: "ltr",
    selectorLanguage: "tr",
  },
  en: {
    nativeName: "English",
    englishName: "English",
    direction: "ltr",
    selectorLanguage: "en",
  },
} satisfies Record<
  BuiltInAppLanguage,
  {
    nativeName: string;
    englishName?: string;
    direction?: "ltr" | "rtl";
    selectorLanguage?: BuiltInAppLanguage;
  }
>;

function createBuiltInDescriptor(locale: BuiltInAppLanguage): LanguageDescriptor {
  const metadata = BUILT_IN_LANGUAGE_METADATA[locale];

  return {
    locale,
    nativeName: metadata.nativeName,
    ...(metadata.englishName !== undefined ? { englishName: metadata.englishName } : {}),
    selectorLanguage: metadata.selectorLanguage ?? resolveSelectorLanguage(locale),
    direction: metadata.direction ?? "ltr",
    source: "builtin",
  };
}

const BUILT_IN_DESCRIPTORS = Object.fromEntries(
  BUILT_IN_APP_LANGUAGES.map((locale) => [locale, createBuiltInDescriptor(locale)])
) as Record<BuiltInAppLanguage, LanguageDescriptor>;

export function getBuiltInLanguageDescriptors(): LanguageDescriptor[] {
  return BUILT_IN_APP_LANGUAGES.map((locale) => BUILT_IN_DESCRIPTORS[locale]);
}

export function getBuiltInLanguageDescriptor(locale: unknown): LanguageDescriptor | null {
  const normalized = normalizeAppLanguage(locale);
  if (isBuiltInAppLanguage(normalized) === false) {
    return null;
  }

  return BUILT_IN_DESCRIPTORS[normalized];
}
