import type {
  BuiltInAppLanguage,
  LoadedLanguagePack,
  TranslationCatalog,
} from "../../src/types/i18n.js";
import { isBuiltInAppLanguage, normalizeAppLanguage } from "./locale.js";
import { normalizeLogNamespaceCatalog } from "./catalog.js";
import { getBuiltInLanguageDescriptor } from "./built-in-descriptors.js";

import trCatalogJson from "../languages/tr/index.json" with { type: "json" };
import enCatalogJson from "../languages/en/index.json" with { type: "json" };

const BUILT_IN_CATALOGS: Record<BuiltInAppLanguage, TranslationCatalog> = {
  tr: normalizeLogNamespaceCatalog(trCatalogJson as TranslationCatalog),
  en: normalizeLogNamespaceCatalog(enCatalogJson as TranslationCatalog),
};
export { getBuiltInLanguageDescriptor, getBuiltInLanguageDescriptors } from "./built-in-descriptors.js";

export function getBuiltInLanguagePack(locale: unknown): LoadedLanguagePack | null {
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
    catalog: BUILT_IN_CATALOGS[normalized],
  };
}
