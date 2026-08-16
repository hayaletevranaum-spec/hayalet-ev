import { DEFAULT_APP_LANGUAGE } from "../src/types/i18n.ts";
import { normalizeAppLanguage } from "./i18n/locale.js";
import { PROTOCOL_KEY as ASSISTANT_PROTOCOL_KEY } from "./slots.ts";

export type ProtocolLocaleMap = {
  default?: string;
  locales?: Record<string, string>;
};

export type StoredProtocolEntry = string | ProtocolLocaleMap;
export type StoredProtocolMap = Record<string, StoredProtocolEntry>;

const LEGACY_PROTOCOL_KEY_ALIASES = new Map<string, string>([
  ["ai-asistan", ASSISTANT_PROTOCOL_KEY],
]);

export const DEFAULT_PROTOCOL_KEYS = [
  ASSISTANT_PROTOCOL_KEY,
  "analyze-AI1-AI2",
  "analyze-AI2-AI1",
  "analyze-user-AI-AI",
] as const;

export function canonicalizeProtocolKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed === "") {
    return "";
  }

  const alias = LEGACY_PROTOCOL_KEY_ALIASES.get(trimmed.toLowerCase());
  return alias ?? trimmed;
}

function normalizeLocaleKey(locale: unknown): string {
  return normalizeAppLanguage(locale);
}

function isProtocolLocaleMap(value: unknown): value is ProtocolLocaleMap {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function compactProtocolEntry(entry: ProtocolLocaleMap): StoredProtocolEntry {
  const defaultValue = typeof entry.default === "string" ? entry.default : "";
  const localeEntries = Object.entries(entry.locales ?? {}).filter(
    ([locale, value]) => locale.trim() !== "" && typeof value === "string"
  );

  if (localeEntries.length === 0) {
    return defaultValue;
  }

  return {
    default: defaultValue,
    locales: Object.fromEntries(localeEntries),
  };
}

function toProtocolLocaleMap(entry: StoredProtocolEntry): ProtocolLocaleMap {
  if (typeof entry === "string") {
    return { default: entry };
  }

  return {
    default: typeof entry.default === "string" ? entry.default : "",
    locales: { ...(entry.locales ?? {}) },
  };
}

function normalizeProtocolEntry(value: unknown): StoredProtocolEntry {
  if (typeof value === "string") {
    return value;
  }

  if (isProtocolLocaleMap(value) !== true) {
    return "";
  }

  const defaultValue = typeof value.default === "string" ? value.default : "";
  const locales: Record<string, string> = {};
  const rawLocales = value.locales;
  if (rawLocales !== null && typeof rawLocales === "object" && Array.isArray(rawLocales) === false) {
    Object.entries(rawLocales).forEach(([locale, localeValue]) => {
      if (typeof localeValue !== "string") {
        return;
      }
      const normalizedLocale = normalizeLocaleKey(locale);
      if (normalizedLocale === DEFAULT_APP_LANGUAGE) {
        return;
      }
      locales[normalizedLocale] = localeValue;
    });
  }

  return compactProtocolEntry({
    default: defaultValue,
    locales,
  });
}

export function normalizeStoredProtocols(candidate: unknown): {
  protocols: StoredProtocolMap;
  changed: boolean;
} {
  const protocols: StoredProtocolMap = {};
  let changed = false;

  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    changed = true;
  } else {
    Object.entries(candidate).forEach(([rawKey, rawValue]) => {
      const canonicalKey = canonicalizeProtocolKey(rawKey);
      if (canonicalKey === "") {
        changed = true;
        return;
      }

      if (canonicalKey !== rawKey) {
        changed = true;
      }

      const normalizedValue = normalizeProtocolEntry(rawValue);
      const existingValue = protocols[canonicalKey];
      if (existingValue !== undefined) {
        changed = true;
        const merged = toProtocolLocaleMap(existingValue);
        const incoming = toProtocolLocaleMap(normalizedValue);
        const nextDefault =
          typeof incoming.default === "string" &&
          (incoming.default !== "" || (merged.default ?? "") === "")
            ? incoming.default
            : (merged.default ?? "");
        protocols[canonicalKey] = compactProtocolEntry({
          default: nextDefault,
          locales: {
            ...(merged.locales ?? {}),
            ...(incoming.locales ?? {}),
          },
        });
        return;
      }

      protocols[canonicalKey] = normalizedValue;
    });
  }

  DEFAULT_PROTOCOL_KEYS.forEach((key) => {
    if (protocols[key] !== undefined) {
      return;
    }
    protocols[key] = "";
    changed = true;
  });

  return { protocols, changed };
}

function buildProtocolLocaleCandidates(locale: unknown): string[] {
  const normalizedLocale = normalizeLocaleKey(locale);
  const lowerLocale = normalizedLocale.toLowerCase();
  const candidates: string[] = [];
  const push = (value: string): void => {
    if (value.trim() === "" || candidates.includes(value)) {
      return;
    }
    candidates.push(value);
  };

  push(normalizedLocale);
  if (lowerLocale !== DEFAULT_APP_LANGUAGE) {
    push(DEFAULT_APP_LANGUAGE);
  }

  return candidates;
}

export function resolveStoredProtocolEntryForLocale(
  entry: StoredProtocolEntry | undefined,
  locale: unknown
): string {
  if (typeof entry === "string") {
    return entry;
  }

  const localeMap = entry?.locales ?? {};
  const candidates = buildProtocolLocaleCandidates(locale);
  for (const candidate of candidates) {
    const resolved = localeMap[candidate];
    if (typeof resolved === "string") {
      return resolved;
    }
  }

  return typeof entry?.default === "string" ? entry.default : "";
}

export function upsertStoredProtocolEntry(
  protocols: StoredProtocolMap,
  key: string,
  content: string,
  locale: unknown
): StoredProtocolMap {
  const canonicalKey = canonicalizeProtocolKey(key);
  const normalizedLocale = normalizeLocaleKey(locale);
  const existingEntry = protocols[canonicalKey];

  if (normalizedLocale === DEFAULT_APP_LANGUAGE) {
    return {
      ...protocols,
      [canonicalKey]:
        typeof existingEntry === "string" || existingEntry === undefined
          ? content
          : compactProtocolEntry({
              default: content,
              locales: { ...(existingEntry.locales ?? {}) },
            }),
    };
  }

  const nextEntry =
    typeof existingEntry === "string"
      ? { default: existingEntry, locales: {} as Record<string, string> }
      : {
          default: existingEntry?.default ?? "",
          locales: { ...(existingEntry?.locales ?? {}) },
        };

  nextEntry.locales[normalizedLocale] = content;

  return {
    ...protocols,
    [canonicalKey]: compactProtocolEntry(nextEntry),
  };
}
