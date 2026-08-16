import { readFile, writeFile } from "node:fs/promises";
import { Script } from "node:vm";

import type { TranslationParams } from "../../src/types/i18n.ts";
import type { LocalizedSelectorEntry } from "../../src/types/provider.ts";
import { resolveSelectorCandidates } from "../../shared/provider-selector-resolution.ts";
import { translateElectronMessage } from "../i18n/language-service.ts";

interface PromotionTarget {
  group: string;
  key: string;
  selector: string;
}

interface PromoteProviderConfigFileOptions {
  configPath: string;
  locale: string;
  promotions: PromotionTarget[];
}

interface PromoteProviderConfigFileResult {
  updated: boolean;
}

async function selectorPromotionT(
  locale: unknown,
  key: string,
  params?: TranslationParams
): Promise<string> {
  return await translateElectronMessage(
    `electron.providerTester.selectorPromotion.${key}`,
    params,
    locale
  );
}

function normalizeLocale(locale: string): string {
  const trimmed = locale.trim().toLowerCase();
  if (trimmed === "") {
    return "";
  }

  return trimmed.split(/[-_]/, 1)[0] ?? "";
}

function quoteString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function isPackagedPath(configPath: string): boolean {
  return configPath.toLowerCase().includes("app.asar");
}

function findMatchingBracket(
  source: string,
  openIndex: number,
  openChar: string,
  closeChar: string
): number {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (quote !== null) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === quote) {
        quote = null;
      }

      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function findPropertyStart(source: string, property: string, fromIndex = 0): number {
  return source.indexOf(`${property}:`, fromIndex);
}

function findPropertyValueStart(source: string, propertyStart: number): number {
  const colonIndex = source.indexOf(":", propertyStart);
  let valueStart = colonIndex + 1;

  while (valueStart < source.length && /\s/.test(source[valueStart] ?? "")) {
    valueStart += 1;
  }

  return valueStart;
}

function replaceSlice(source: string, start: number, end: number, replacement: string): string {
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

function getLineIndent(source: string, index: number): string {
  const lineStart = source.lastIndexOf("\n", index) + 1;
  const line = source.slice(lineStart, index);
  const match = line.match(/^\s*/);
  return match?.[0] ?? "";
}

function findNestedObject(
  source: string,
  property: string,
  fromIndex = 0
): { start: number; end: number } | null {
  const propertyStart = findPropertyStart(source, property, fromIndex);
  if (propertyStart === -1) {
    return null;
  }

  const valueStart = findPropertyValueStart(source, propertyStart);
  if (source[valueStart] !== "{") {
    return null;
  }

  const valueEnd = findMatchingBracket(source, valueStart, "{", "}");
  if (valueEnd === -1) {
    return null;
  }

  return { start: valueStart, end: valueEnd + 1 };
}

function findNestedString(
  source: string,
  property: string,
  fromIndex = 0
): { start: number; end: number } | null {
  const propertyStart = findPropertyStart(source, property, fromIndex);
  if (propertyStart === -1) {
    return null;
  }

  const valueStart = findPropertyValueStart(source, propertyStart);
  const quote = source[valueStart];
  if (quote !== '"' && quote !== "'") {
    return null;
  }

  let escaped = false;
  for (let index = valueStart + 1; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === quote) {
      return { start: valueStart, end: index + 1 };
    }
  }

  return null;
}

function parseSelectorEntry(entrySource: string): LocalizedSelectorEntry {
  const script = new Script(`(${entrySource})`);
  return script.runInNewContext({}) as LocalizedSelectorEntry;
}

function serializeSelectorEntry(entry: LocalizedSelectorEntry, baseIndent: string): string {
  const propertyIndent = `${baseIndent}  `;
  const lines = ["{"];

  for (const [key, value] of Object.entries(entry)) {
    if (key === "fallbacks") {
      continue;
    }

    if (typeof value === "string") {
      lines.push(`${propertyIndent}${key}: ${quoteString(value)},`);
    }
  }

  const fallbacks = Array.isArray(entry.fallbacks) ? entry.fallbacks : [];
  lines.push(
    `${propertyIndent}fallbacks: [${fallbacks.map((selector) => quoteString(selector)).join(", ")}],`
  );
  lines.push(`${baseIndent}}`);
  return lines.join("\n");
}

function promoteEntry(
  entry: LocalizedSelectorEntry,
  locale: string,
  selector: string
): LocalizedSelectorEntry | null {
  const candidates = resolveSelectorCandidates(entry, locale);
  if (!candidates.includes(selector)) {
    return null;
  }

  const localeKey = normalizeLocale(locale);
  if (localeKey === "") {
    return null;
  }

  const remainingCandidates = candidates.filter((candidate) => candidate !== selector);
  return {
    ...entry,
    [localeKey]: selector,
    fallbacks: remainingCandidates,
  };
}

function applyPromotion(
  source: string,
  locale: string,
  promotion: PromotionTarget
): { source: string; updated: boolean } {
  if (promotion.group !== "selectors") {
    return { source, updated: false };
  }

  const selectorMatrixObject = findNestedObject(source, "selectorMatrix");
  if (!selectorMatrixObject) {
    return { source, updated: false };
  }

  const selectorMatrixSource = source.slice(selectorMatrixObject.start, selectorMatrixObject.end);
  const selectorsObject = findNestedObject(selectorMatrixSource, "selectors");
  if (!selectorsObject) {
    return { source, updated: false };
  }

  const selectorsStart = selectorMatrixObject.start + selectorsObject.start;
  const entryObject = findNestedObject(source, promotion.key, selectorsStart);
  if (!entryObject) {
    return { source, updated: false };
  }

  const originalEntrySource = source.slice(entryObject.start, entryObject.end);
  const promotedEntry = promoteEntry(
    parseSelectorEntry(originalEntrySource),
    locale,
    promotion.selector
  );
  if (!promotedEntry) {
    return { source, updated: false };
  }

  const entryIndent = getLineIndent(source, entryObject.start);
  const serializedEntry = serializeSelectorEntry(promotedEntry, entryIndent);
  let updatedSource = replaceSlice(source, entryObject.start, entryObject.end, serializedEntry);

  const rootSelectorsObject = findNestedObject(updatedSource, "selectors");
  if (!rootSelectorsObject) {
    return { source, updated: false };
  }

  const flatSelectorValue = findNestedString(
    updatedSource,
    promotion.key,
    rootSelectorsObject.start
  );
  if (!flatSelectorValue) {
    return { source, updated: false };
  }

  const flatCandidates = resolveSelectorCandidates(promotedEntry, locale);
  const serializedFlatSelector = quoteString(flatCandidates.join(", "));
  updatedSource = replaceSlice(
    updatedSource,
    flatSelectorValue.start,
    flatSelectorValue.end,
    serializedFlatSelector
  );

  return { source: updatedSource, updated: updatedSource !== source };
}

export async function promoteProviderConfigFile({
  configPath,
  locale,
  promotions,
}: PromoteProviderConfigFileOptions): Promise<PromoteProviderConfigFileResult> {
  if (isPackagedPath(configPath)) {
    throw new Error(await selectorPromotionT(locale, "packagedConfigRefused", { configPath }));
  }

  let source = await readFile(configPath, "utf8");
  let updated = false;

  for (const promotion of promotions) {
    const result = applyPromotion(source, locale, promotion);
    source = result.source;
    updated = updated || result.updated;
  }

  if (!updated) {
    return { updated: false };
  }

  await writeFile(configPath, source, "utf8");
  return { updated: true };
}
