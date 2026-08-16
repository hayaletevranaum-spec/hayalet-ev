type ForgeUnknownRecord = Record<string, unknown>;
const FORGE_DEFAULT_PROMPT_LOCALE = "tr";

export function createForgeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function toRecord(value: unknown): ForgeUnknownRecord {
  return value !== null && typeof value === "object" && Array.isArray(value) === false
    ? (value as ForgeUnknownRecord)
    : {};
}

export function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : [];
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim();
    if (normalized === "" || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeValue(entry));
  }

  if (value !== null && typeof value === "object") {
    return Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        const nextValue = canonicalizeValue((value as Record<string, unknown>)[key]);
        if (nextValue !== undefined) {
          acc[key] = nextValue;
        }
        return acc;
      }, {});
  }

  if (typeof value === "string") {
    return value;
  }

  return value;
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

export function hashStableValue(value: unknown): string {
  const text = stableSerialize(value);
  let hash = 2166136261;

  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return value;
}

export function createImmutableSnapshot<T>(value: T): T {
  return deepFreeze(deepClone(value));
}

export function extractJsonValue(rawText: string): unknown | null {
  const trimmed = rawText.trim();
  if (trimmed === "") {
    return null;
  }

  const attempts = new Set<string>([trimmed]);
  const fenceMatches = trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fenceMatches) {
    if (typeof match[1] === "string" && match[1].trim() !== "") {
      attempts.add(match[1].trim());
    }
  }

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    attempts.add(trimmed.slice(objectStart, objectEnd + 1).trim());
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    attempts.add(trimmed.slice(arrayStart, arrayEnd + 1).trim());
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as unknown;
    } catch {
      continue;
    }
  }

  return null;
}

export function toJsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function normalizeTextForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[`*_>#-]/g, "")
    .trim();
}

export function slugifyFilePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function canonicalizeForgeLocaleTag(value: string): string {
  const trimmed = value.trim().replace(/_/g, "-");
  if (trimmed === "") {
    return FORGE_DEFAULT_PROMPT_LOCALE;
  }

  try {
    return new Intl.Locale(trimmed).toString();
  } catch {
    return trimmed;
  }
}

export function resolveForgePromptLocale(value: unknown): string {
  if (typeof value !== "string") {
    return FORGE_DEFAULT_PROMPT_LOCALE;
  }
  const normalized = canonicalizeForgeLocaleTag(value);
  return normalized === "" ? FORGE_DEFAULT_PROMPT_LOCALE : normalized;
}

export function buildForgeOutputLanguageRule(locale: unknown): string {
  const normalizedLocale = resolveForgePromptLocale(locale);
  const languageLabel =
    normalizedLocale === "tr"
      ? "Turkish"
      : normalizedLocale === "en"
        ? "English"
        : `the application language for locale "${normalizedLocale}"`;
  return [
    `Use ${languageLabel} for every human-readable JSON string value.`,
    `Match the active application locale (${normalizedLocale}).`,
    "Keep JSON keys, enum values, ids, and file paths unchanged.",
  ].join(" ");
}
