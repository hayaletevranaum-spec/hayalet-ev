export const BUILT_IN_APP_LANGUAGES = ["tr", "en"] as const;
export const DEFAULT_APP_LANGUAGE = "tr" as const;

export type BuiltInAppLanguage = (typeof BUILT_IN_APP_LANGUAGES)[number];
export type SelectorLanguage = BuiltInAppLanguage;
export type AppLanguage = BuiltInAppLanguage | (string & {});
export type LanguageSource = "builtin" | "external";
export type LanguageDirection = "ltr" | "rtl";

export type TranslationPrimitive = string | number | boolean | null | undefined;
export type TranslationParams = Record<string, TranslationPrimitive>;

export interface TranslationCatalog {
  [key: string]: string | TranslationCatalog;
}

export interface LanguageDescriptor {
  locale: AppLanguage;
  nativeName: string;
  englishName?: string;
  description?: string;
  direction?: LanguageDirection;
  selectorLanguage?: SelectorLanguage;
  source: LanguageSource;
}

export interface LoadedLanguagePack extends LanguageDescriptor {
  catalog: TranslationCatalog;
}

export interface ExternalLanguageManifest {
  locale?: string;
  nativeName?: string;
  englishName?: string;
  description?: string;
  direction?: LanguageDirection;
  selectorLanguage?: SelectorLanguage;
}
