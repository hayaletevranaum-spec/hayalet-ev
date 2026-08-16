import {
  BUILT_IN_APP_LANGUAGES,
  DEFAULT_APP_LANGUAGE,
  type AppLanguage,
  type BuiltInAppLanguage,
  type SelectorLanguage,
} from "../../src/types/i18n.js";

export function canonicalizeLocaleTag(input: string): string {
  const trimmed = input.trim().replace(/_/g, "-");
  if (trimmed === "") {
    return DEFAULT_APP_LANGUAGE;
  }

  try {
    return new Intl.Locale(trimmed).toString();
  } catch {
    return trimmed;
  }
}

export function normalizeAppLanguage(value: unknown): AppLanguage {
  if (typeof value !== "string") {
    return DEFAULT_APP_LANGUAGE;
  }

  const normalized = canonicalizeLocaleTag(value);
  return normalized === "" ? DEFAULT_APP_LANGUAGE : (normalized as AppLanguage);
}

export function isBuiltInAppLanguage(value: unknown): value is BuiltInAppLanguage {
  return typeof value === "string" && BUILT_IN_APP_LANGUAGES.includes(value as BuiltInAppLanguage);
}

export function resolveSelectorLanguage(value: unknown): SelectorLanguage {
  const normalized = normalizeAppLanguage(value).toLowerCase();
  if (normalized === "tr" || normalized.startsWith("tr-")) {
    return "tr";
  }
  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }
  return DEFAULT_APP_LANGUAGE === "tr" ? "tr" : "en";
}

export function resolveIntlLocale(value: unknown): string {
  const normalized = normalizeAppLanguage(value);
  if (normalized === "en") {
    return "en-US";
  }
  if (normalized === "tr") {
    return "tr-TR";
  }
  return canonicalizeLocaleTag(normalized);
}

export function resolveAcceptLanguage(value: unknown): string {
  const normalized = normalizeAppLanguage(value);
  const intlLocale = resolveIntlLocale(normalized);
  const language = intlLocale.split("-")[0] ?? DEFAULT_APP_LANGUAGE;

  if (intlLocale.toLowerCase() === "tr-tr") {
    return "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7";
  }

  if (intlLocale.toLowerCase() === "en-us") {
    return "en-US,en;q=0.9,tr-TR;q=0.8,tr;q=0.7";
  }

  return `${intlLocale},${language};q=0.9,en-US;q=0.8,en;q=0.7`;
}
