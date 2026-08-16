import type {
  TranslationCatalog,
  TranslationParams,
  TranslationPrimitive,
} from "../../src/types/i18n.js";

function isTranslationPrimitive(value: unknown): value is TranslationPrimitive {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  );
}

export function isTranslationCatalog(value: unknown): value is TranslationCatalog {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function mergeTwoCatalogs(base: TranslationCatalog, extra: TranslationCatalog): TranslationCatalog {
  const merged: TranslationCatalog = { ...base };

  for (const [key, value] of Object.entries(extra)) {
    const current = merged[key];
    if (isTranslationCatalog(current) && isTranslationCatalog(value)) {
      merged[key] = mergeTwoCatalogs(current, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

export function mergeTranslationCatalogs(catalogs: TranslationCatalog[]): TranslationCatalog {
  return catalogs.reduce<TranslationCatalog>((accumulator, catalog) => {
    return mergeTwoCatalogs(accumulator, catalog);
  }, {});
}

export function normalizeLogNamespaceCatalog(catalog: TranslationCatalog): TranslationCatalog {
  const appCatalog = isTranslationCatalog(catalog["app"]) ? catalog["app"] : undefined;
  const shellCatalog = isTranslationCatalog(catalog["shell"]) ? catalog["shell"] : undefined;
  const appLogs = appCatalog && isTranslationCatalog(appCatalog["logs"]) ? appCatalog["logs"] : undefined;
  const shellLogs =
    shellCatalog && isTranslationCatalog(shellCatalog["logs"]) ? shellCatalog["logs"] : undefined;

  if (appLogs === undefined && shellLogs === undefined) {
    return catalog;
  }

  const canonicalLogs = mergeTranslationCatalogs([shellLogs ?? {}, appLogs ?? {}]);

  return {
    ...catalog,
    app: {
      ...(appCatalog ?? {}),
      logs: canonicalLogs,
    },
    shell: {
      ...(shellCatalog ?? {}),
      logs: canonicalLogs,
    },
  };
}

export function getTranslationValue(
  catalog: TranslationCatalog | null | undefined,
  key: string
): string | undefined {
  if (catalog === null || catalog === undefined || key.trim() === "") {
    return undefined;
  }

  const segments = key.split(".").filter(Boolean);
  let current: string | TranslationCatalog | undefined = catalog;

  for (const segment of segments) {
    if (isTranslationCatalog(current) === false) {
      return undefined;
    }

    current = current[segment];
    if (current === undefined) {
      return undefined;
    }
  }

  return typeof current === "string" ? current : undefined;
}

function stringifyTranslationValue(value: TranslationPrimitive): string {
  if (isTranslationPrimitive(value) === false) {
    return "";
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

export function interpolateTranslation(
  template: string,
  params: TranslationParams | undefined
): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, token: string) => {
    return stringifyTranslationValue(params[token]);
  });
}

export function translateCatalog(
  catalog: TranslationCatalog,
  key: string,
  params?: TranslationParams,
  fallbackCatalog?: TranslationCatalog
): string {
  const template = getTranslationValue(catalog, key) ?? getTranslationValue(fallbackCatalog, key);
  if (typeof template !== "string") {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn(`[i18n] Missing translation key: ${key}`);
    }

    return (
      getTranslationValue(catalog, "app.common.translationMissing") ??
      getTranslationValue(fallbackCatalog, "app.common.translationMissing") ??
      "Translation unavailable"
    );
  }

  return interpolateTranslation(template, params);
}
