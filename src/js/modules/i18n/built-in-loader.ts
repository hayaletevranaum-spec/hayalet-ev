import type { BuiltInAppLanguage, LoadedLanguagePack, TranslationCatalog } from "@shared/i18n.js";
import { isBuiltInAppLanguage, normalizeAppLanguage } from "../../../../shared/i18n/locale.js";
import { normalizeLogNamespaceCatalog } from "../../../../shared/i18n/catalog.js";
import { getBuiltInLanguageDescriptor } from "../../../../shared/i18n/built-in-descriptors.js";

type TranslationCatalogModule = { default: TranslationCatalog };

const BUILT_IN_CATALOG_IMPORTERS: Record<
  BuiltInAppLanguage,
  () => Promise<TranslationCatalogModule>
> = {
  tr: async () => await import("../../../../shared/languages/tr/index.json"),
  en: async () => await import("../../../../shared/languages/en/index.json"),
};

const builtInCatalogCache = new Map<BuiltInAppLanguage, TranslationCatalog>();
const builtInCatalogLoaders = new Map<BuiltInAppLanguage, Promise<TranslationCatalog>>();

async function loadBuiltInLanguageCatalog(locale: BuiltInAppLanguage): Promise<TranslationCatalog> {
  const cached = builtInCatalogCache.get(locale);
  if (cached !== undefined) {
    return cached;
  }

  const pending = builtInCatalogLoaders.get(locale);
  if (pending !== undefined) {
    return await pending;
  }

  const nextLoad = (async (): Promise<TranslationCatalog> => {
    try {
      const module = await BUILT_IN_CATALOG_IMPORTERS[locale]();
      const catalog = normalizeLogNamespaceCatalog(module.default);
      builtInCatalogCache.set(locale, catalog);
      return catalog;
    } finally {
      builtInCatalogLoaders.delete(locale);
    }
  })();

  builtInCatalogLoaders.set(locale, nextLoad);
  return await nextLoad;
}

export async function loadBuiltInLanguagePack(locale: unknown): Promise<LoadedLanguagePack | null> {
  const normalized = normalizeAppLanguage(locale);
  if (isBuiltInAppLanguage(normalized) === false) {
    return null;
  }

  const descriptor = getBuiltInLanguageDescriptor(normalized);
  if (descriptor === null) {
    return null;
  }

  return {
    ...descriptor,
    catalog: await loadBuiltInLanguageCatalog(normalized),
  };
}
