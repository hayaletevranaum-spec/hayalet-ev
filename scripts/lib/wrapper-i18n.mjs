import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_LOCALE = "tr";
const TRANSLATION_MISSING_KEYS = ["shell.common.translationMissing", "app.common.translationMissing"];

function isRecord(value) {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

export function normalizeWrapperLocale(locale) {
  if (typeof locale !== "string") {
    return DEFAULT_LOCALE;
  }

  const trimmed = locale.trim().toLowerCase();
  if (trimmed === "") {
    return DEFAULT_LOCALE;
  }

  if (trimmed === "tr" || trimmed.startsWith("tr-")) {
    return "tr";
  }

  if (trimmed === "en" || trimmed.startsWith("en-")) {
    return "en";
  }

  return trimmed;
}

function readJsonIfPresent(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function mergeCatalogs(base, extra) {
  if (!isRecord(base)) {
    return isRecord(extra) ? { ...extra } : {};
  }

  if (!isRecord(extra)) {
    return { ...base };
  }

  const merged = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = merged[key];
    if (isRecord(current) && isRecord(value)) {
      merged[key] = mergeCatalogs(current, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

function getTranslationValue(catalog, key) {
  if (!isRecord(catalog) || typeof key !== "string" || key.trim() === "") {
    return undefined;
  }

  let current = catalog;
  for (const segment of key.split(".").filter(Boolean)) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
    if (current === undefined) {
      return undefined;
    }
  }

  return typeof current === "string" ? current : undefined;
}

function interpolate(template, params) {
  if (typeof template !== "string") {
    return "";
  }

  if (!isRecord(params)) {
    return template;
  }

  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, token) => {
    const value = params[token];
    return value === null || value === undefined ? "" : String(value);
  });
}

function readWrapperLocale(root) {
  const settings = readJsonIfPresent(join(root, "config", "settings.json"));
  if (!isRecord(settings)) {
    return DEFAULT_LOCALE;
  }

  const general = isRecord(settings.general) ? settings.general : null;
  return normalizeWrapperLocale(general?.language);
}

function loadBuiltInCatalog(root, locale) {
  const catalog = readJsonIfPresent(join(root, "shared", "languages", locale, "index.json"));
  return isRecord(catalog) ? catalog : {};
}

function loadExternalCatalog(root, locale) {
  const catalog = readJsonIfPresent(join(root, "data", "shared", "languages", locale, "index.json"));
  return isRecord(catalog) ? catalog : null;
}

export function createWrapperTranslatorSync({ root, locale } = {}) {
  const resolvedRoot = typeof root === "string" && root.trim() !== "" ? root : process.cwd();
  const resolvedLocale = normalizeWrapperLocale(locale ?? readWrapperLocale(resolvedRoot));
  const fallbackCatalog = loadBuiltInCatalog(resolvedRoot, DEFAULT_LOCALE);
  const activeCatalog = mergeCatalogs(
    loadBuiltInCatalog(resolvedRoot, resolvedLocale),
    loadExternalCatalog(resolvedRoot, resolvedLocale)
  );

  return {
    locale: resolvedLocale,
    t(key, params) {
      const missingTemplate =
        TRANSLATION_MISSING_KEYS.map((missingKey) => {
          return getTranslationValue(activeCatalog, missingKey) ?? getTranslationValue(fallbackCatalog, missingKey);
        }).find((value) => typeof value === "string") ?? "Translation unavailable";

      const template =
        getTranslationValue(activeCatalog, key) ??
        getTranslationValue(fallbackCatalog, key) ??
        missingTemplate;

      return interpolate(template, params);
    },
  };
}
