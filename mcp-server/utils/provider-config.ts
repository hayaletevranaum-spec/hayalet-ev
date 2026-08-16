import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createMcpTranslatorSync } from "./i18n/index.js";

const mcpT = createMcpTranslatorSync();

export interface ProviderSelectors {
  sendButton?: string;
  stopButton?: string;
  voiceButton?: string;
  microphoneButton?: string;
  generatedImage?: string;
  inputField?: string;
  messageContainer?: string;
  attachButton?: string;
  filePreview?: string[];
}

export interface LocalizedSelectorEntry {
  tr?: string;
  en?: string;
  fallbacks?: string[];
}

export interface ProviderSelectorMatrix {
  selectors?: Record<string, LocalizedSelectorEntry>;
}

export interface ScrapeSelectors {
  preferred?: string;
  fallback?: string;
  messageWrapper?: string;
  userWrapper?: string;
  assistantWrapper?: string;
  messageId?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  loginUrl?: string;
  lastVerified?: string;
  selectors: ProviderSelectors;
  selectorMatrix?: ProviderSelectorMatrix;
  scrapeSelectors?: ScrapeSelectors;
  criticalSelectors?: string[];
  fileInputSelectors?: string[];
  uploadTargetSelectors?: string[];
  dragDropCriticalSelectors?: string[];
  scrollerSelectors?: string[];
  inputType?: string;
  messageIdStrategy?: string;
  excludedUrls?: string[];
}

export interface FlatSelector {
  category: string;
  key: string;
  selector: string;
  isArray?: boolean;
  arrayIndex?: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  configPath: string;
  exists: boolean;
}

const PROVIDERS = ["chatgpt", "gemini", "grok", "opencode"] as const;

export type ProviderId = (typeof PROVIDERS)[number];

export function getConfigPath(projectRoot: string, provider: string): string {
  return join(projectRoot, "src/js/modules/webview/providers", provider, "config.ts");
}

export function listProviders(projectRoot: string): ProviderInfo[] {
  return PROVIDERS.map((id) => {
    const configPath = getConfigPath(projectRoot, id);
    return {
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      configPath,
      exists: existsSync(configPath),
    };
  }).filter((p) => p.exists);
}

export function parseProviderConfig(projectRoot: string, provider: string): ProviderConfig | null {
  const configPath = getConfigPath(projectRoot, provider);

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    return extractConfigFromSource(content, provider);
  } catch (error) {
    process.stderr.write(
      `${mcpT("mcpServer.providerConfig.parseError", {
        provider,
        message: String(error),
      })}\n`
    );
    return null;
  }
}

function extractConfigFromSource(source: string, providerId: string): ProviderConfig {
  const config: ProviderConfig = {
    id: providerId,
    name: providerId.charAt(0).toUpperCase() + providerId.slice(1),
    baseUrl: "",
    selectors: {},
  };

  const baseUrlMatch = source.match(/baseUrl:\s*["']([^"']+)["']/);
  if (baseUrlMatch?.[1] !== undefined) config.baseUrl = baseUrlMatch[1];

  const loginUrlMatch = source.match(/loginUrl:\s*["']([^"']+)["']/);
  if (loginUrlMatch?.[1] !== undefined) config.loginUrl = loginUrlMatch[1];

  const lastVerifiedMatch = source.match(/lastVerified:\s*["']([^"']+)["']/);
  if (lastVerifiedMatch?.[1] !== undefined) config.lastVerified = lastVerifiedMatch[1];

  const inputTypeMatch = source.match(/inputType:\s*["']([^"']+)["']/);
  if (inputTypeMatch?.[1] !== undefined) config.inputType = inputTypeMatch[1];

  const strategyMatch = source.match(/messageIdStrategy:\s*["']([^"']+)["']/);
  if (strategyMatch?.[1] !== undefined) config.messageIdStrategy = strategyMatch[1];

  config.selectors = extractSelectorsObject(source, "selectors:");
  const selectorMatrix = extractSelectorMatrix(source);
  if (selectorMatrix !== undefined) {
    config.selectorMatrix = selectorMatrix;
  }

  const scrapeSelectors = extractSelectorsObject(source, "scrapeSelectors:");
  if (Object.keys(scrapeSelectors).length > 0) {
    config.scrapeSelectors = scrapeSelectors;
  }

  config.criticalSelectors = extractStringArray(source, "criticalSelectors:");
  config.fileInputSelectors = extractStringArray(source, "fileInputSelectors:");
  config.uploadTargetSelectors = extractStringArray(source, "uploadTargetSelectors:");
  config.dragDropCriticalSelectors = extractStringArray(source, "dragDropCriticalSelectors:");
  config.scrollerSelectors = extractStringArray(source, "scrollerSelectors:");
  config.excludedUrls = extractStringArray(source, "excludedUrls:");

  return config;
}

function findMatchingIndex(
  source: string,
  start: number,
  openChar: string,
  closeChar: string
): number {
  let depth = 1;
  let quote: '"' | "'" | "`" | null = null;
  let escaped = false;

  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === undefined) {
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote !== null) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === openChar) depth += 1;
    if (char === closeChar) depth -= 1;
    if (depth === 0) return index;
  }

  return -1;
}

function extractObjectContent(source: string, objectKey: string): string | null {
  const objectStart = source.indexOf(objectKey);
  if (objectStart === -1) return null;

  const braceStart = source.indexOf("{", objectStart);
  if (braceStart === -1) return null;

  const braceEnd = findMatchingIndex(source, braceStart, "{", "}");
  if (braceEnd === -1) return null;

  return source.slice(braceStart + 1, braceEnd);
}

function extractStringArrayFromContent(source: string, arrayKey: string): string[] {
  const result: string[] = [];
  const arrayStart = source.indexOf(arrayKey);
  if (arrayStart === -1) return result;

  const bracketStart = source.indexOf("[", arrayStart);
  if (bracketStart === -1) return result;

  const bracketEnd = findMatchingIndex(source, bracketStart, "[", "]");
  if (bracketEnd === -1) return result;

  const arrayContent = source.slice(bracketStart + 1, bracketEnd);
  const stringPattern = /["'`]([^"'`]+)["'`]/g;
  let match;

  while ((match = stringPattern.exec(arrayContent)) !== null) {
    if (match[1] === undefined) continue;
    const value = match[1].replace(/\s+/g, " ").trim();
    if (value !== "" && !value.startsWith("//")) {
      result.push(value);
    }
  }

  return result;
}

function extractSelectorMatrix(source: string): ProviderSelectorMatrix | undefined {
  const selectorMatrixContent = extractObjectContent(source, "selectorMatrix:");
  if (selectorMatrixContent === null) {
    return undefined;
  }

  const selectorsContent = extractObjectContent(selectorMatrixContent, "selectors:");
  if (selectorsContent === null) {
    return undefined;
  }

  const selectors: Record<string, LocalizedSelectorEntry> = {};
  const entryPattern = /(\w+)\s*:\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = entryPattern.exec(selectorsContent)) !== null) {
    const key = match[1];
    if (key === undefined || key === "") continue;
    const keyOffset = match.index + match[0].lastIndexOf("{");
    const braceStart = keyOffset;
    const braceEnd = findMatchingIndex(selectorsContent, braceStart, "{", "}");
    if (braceEnd === -1) continue;

    const entryContent = selectorsContent.slice(braceStart + 1, braceEnd);
    const entry: LocalizedSelectorEntry = {};
    const assignEntryValue = (locale: string | undefined, value: string | undefined): void => {
      if (
        locale !== undefined &&
        locale !== "" &&
        value !== undefined &&
        value !== "" &&
        locale !== "fallbacks"
      ) {
        (entry as Record<string, string | string[] | undefined>)[locale] = value
          .replace(/\s+/g, " ")
          .trim();
      }
    };
    const patterns = [/(\w+)\s*:\s*`([^`]*)`/g, /(\w+)\s*:\s*"([^"]*)"/g, /(\w+)\s*:\s*'([^']*)'/g];

    for (const pattern of patterns) {
      let stringMatch: RegExpExecArray | null;
      while ((stringMatch = pattern.exec(entryContent)) !== null) {
        assignEntryValue(stringMatch[1], stringMatch[2]);
      }
    }

    const fallbacks = extractStringArrayFromContent(entryContent, "fallbacks:");
    if (fallbacks.length > 0) {
      entry.fallbacks = fallbacks;
    }

    selectors[key] = entry;
    entryPattern.lastIndex = braceEnd + 1;
  }

  return Object.keys(selectors).length > 0 ? { selectors } : undefined;
}

function extractSelectorsObject(source: string, objectKey: string): Record<string, string> {
  const result: Record<string, string> = {};
  const objectContent = extractObjectContent(source, objectKey);
  if (objectContent === null) return result;

  const backtickPattern = /(\w+):\s*`([^`]*)`/g;
  let match;

  while ((match = backtickPattern.exec(objectContent)) !== null) {
    const key = match[1];
    const value = match[2];
    if (key !== undefined && value !== undefined && !value.includes("${")) {
      result[key] = value.replace(/\s+/g, " ").trim();
    }
  }

  const doubleQuotePattern = /(\w+):\s*"([^"]*)"/g;
  while ((match = doubleQuotePattern.exec(objectContent)) !== null) {
    const key = match[1];
    const value = match[2];
    if (key !== undefined && key !== "" && value !== undefined && !(key in result)) {
      result[key] = value.replace(/\s+/g, " ").trim();
    }
  }

  const singleQuotePattern = /(\w+):\s*'([^']*)'/g;
  while ((match = singleQuotePattern.exec(objectContent)) !== null) {
    const key = match[1];
    const value = match[2];
    if (key !== undefined && key !== "" && value !== undefined && !(key in result)) {
      result[key] = value.replace(/\s+/g, " ").trim();
    }
  }

  return result;
}

function extractStringArray(source: string, arrayKey: string): string[] {
  return extractStringArrayFromContent(source, arrayKey);
}

export function flattenSelectors(config: ProviderConfig): FlatSelector[] {
  const result: FlatSelector[] = [];

  if (Object.keys(config.selectors).length > 0) {
    for (const [key, value] of Object.entries(config.selectors)) {
      if (typeof value === "string" && value.trim() !== "") {
        result.push({ category: "selectors", key, selector: value });
      } else if (Array.isArray(value)) {
        value.forEach((sel, i) => {
          if (typeof sel === "string" && sel.trim() !== "") {
            result.push({
              category: "selectors",
              key,
              selector: sel,
              isArray: true,
              arrayIndex: i,
            });
          }
        });
      }
    }
  }

  if (config.scrapeSelectors) {
    for (const [key, value] of Object.entries(config.scrapeSelectors)) {
      if (typeof value === "string" && value.trim() !== "") {
        result.push({ category: "scrapeSelectors", key, selector: value });
      }
    }
  }

  if (config.selectorMatrix?.selectors) {
    for (const [key, entry] of Object.entries(config.selectorMatrix.selectors)) {
      for (const [locale, value] of Object.entries(entry)) {
        if (locale === "fallbacks") continue;
        if (typeof value === "string" && value.trim() !== "") {
          result.push({ category: "selectorMatrix", key: `${key}.${locale}`, selector: value });
        }
      }

      if (Array.isArray(entry.fallbacks)) {
        entry.fallbacks.forEach((selector, index) => {
          if (selector.trim() !== "") {
            result.push({
              category: "selectorMatrix",
              key: `${key}.fallbacks[${index}]`,
              selector,
              isArray: true,
              arrayIndex: index,
            });
          }
        });
      }
    }
  }

  const arrayCategories = [
    "criticalSelectors",
    "fileInputSelectors",
    "uploadTargetSelectors",
    "dragDropCriticalSelectors",
    "scrollerSelectors",
  ] as const;

  for (const category of arrayCategories) {
    const arr = config[category];
    if (Array.isArray(arr)) {
      arr.forEach((selector, index) => {
        if (typeof selector === "string" && selector.trim() !== "") {
          result.push({
            category,
            key: `[${index}]`,
            selector,
            isArray: true,
            arrayIndex: index,
          });
        }
      });
    }
  }

  return result;
}

export function groupSelectorsByCategory(
  selectors: FlatSelector[]
): Record<string, FlatSelector[]> {
  const grouped: Record<string, FlatSelector[]> = {};

  for (const sel of selectors) {
    grouped[sel.category] ??= [];
    const cat = grouped[sel.category];
    if (cat) cat.push(sel);
  }

  return grouped;
}
