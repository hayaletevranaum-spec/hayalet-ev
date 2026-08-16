import type { LocalizedSelectorEntry } from "../src/types/provider.ts";

function splitSelectorList(selectorList: string): string[] {
  const candidates: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let bracketDepth = 0;
  let parenDepth = 0;

  const flush = (): void => {
    const trimmed = current.trim();
    if (trimmed) {
      candidates.push(trimmed);
    }
    current = "";
  };

  for (const char of selectorList) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }

    if (quote !== null) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      current += char;
      quote = char;
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
      current += char;
      continue;
    }

    if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      current += char;
      continue;
    }

    if (char === "(") {
      parenDepth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      current += char;
      continue;
    }

    if (char === "," && bracketDepth === 0 && parenDepth === 0) {
      flush();
      continue;
    }

    current += char;
  }

  flush();
  return candidates;
}

function pushUnique(candidates: string[], selector: string | undefined): void {
  if (selector && !candidates.includes(selector)) {
    candidates.push(selector);
  }
}

function pushSelectorEntry(candidates: string[], selector: string | undefined): void {
  if (!selector) {
    return;
  }

  for (const item of splitSelectorList(selector)) {
    pushUnique(candidates, item);
  }
}

function pushSelectorEntries(candidates: string[], entry: string | string[] | undefined): void {
  if (typeof entry === "string") {
    pushSelectorEntry(candidates, entry);
    return;
  }

  if (Array.isArray(entry)) {
    for (const item of entry) {
      if (typeof item === "string") {
        pushSelectorEntry(candidates, item);
      }
    }
  }
}

function normalizeLocale(locale: string): string {
  const trimmed = locale.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  return trimmed.split(/[-_]/, 1)[0] ?? "";
}

export function resolveSelectorCandidates(
  entry: LocalizedSelectorEntry | Record<string, unknown> | string | string[] | null | undefined,
  locale: string
): string[] {
  if (typeof entry === "string" || Array.isArray(entry)) {
    const candidates: string[] = [];
    pushSelectorEntries(candidates, entry);
    return candidates;
  }

  if (!entry || typeof entry !== "object") {
    return [];
  }

  const candidates: string[] = [];
  const localeKey = normalizeLocale(locale);

  if (localeKey) {
    const localized = entry[localeKey];
    if (typeof localized === "string" || Array.isArray(localized)) {
      pushSelectorEntries(candidates, localized);
    }
  }

  for (const [key, value] of Object.entries(entry)) {
    if (key === "fallbacks" || key === localeKey || typeof value !== "string") {
      continue;
    }

    pushSelectorEntry(candidates, value);
  }

  if (Array.isArray(entry.fallbacks)) {
    for (const fallback of entry.fallbacks) {
      pushSelectorEntry(candidates, fallback);
    }
  }

  return candidates;
}
