import { readFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type {
  AppLanguage,
  ExternalLanguageManifest,
  LanguageDescriptor,
  LoadedLanguagePack,
  TranslationCatalog,
  TranslationParams,
} from "../../../src/types/i18n.js";
import { DEFAULT_APP_LANGUAGE } from "../../../src/types/i18n.js";
import {
  isTranslationCatalog,
  mergeTranslationCatalogs,
  translateCatalog,
} from "../../../shared/i18n/catalog.js";
import { getBuiltInLanguagePack } from "../../../shared/i18n/bundled-languages.js";
import { normalizeAppLanguage, resolveSelectorLanguage } from "../../../shared/i18n/locale.js";
import {
  listInstalledLanguages,
  loadInstalledLanguage,
} from "../../../shared/i18n/node-loader.js";
import { PROJECT_ROOT } from "../project-root.js";

const SETTINGS_PATH = join(PROJECT_ROOT, "config", "settings.json");
const LANGUAGE_ROOT = join(PROJECT_ROOT, "data", "shared", "languages");

type SettingsSnapshot = {
  general?: {
    language?: unknown;
  };
};

export async function readMcpAppLanguage(): Promise<AppLanguage> {
  try {
    const raw = await readFile(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as SettingsSnapshot;
    return normalizeAppLanguage(parsed.general?.language);
  } catch {
    return DEFAULT_APP_LANGUAGE;
  }
}

export function readMcpAppLanguageSync(): AppLanguage {
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as SettingsSnapshot;
    return normalizeAppLanguage(parsed.general?.language);
  } catch {
    return DEFAULT_APP_LANGUAGE;
  }
}

function readJsonFileSync(filePath: string): unknown {
  const content = readFileSync(filePath, "utf8");
  return JSON.parse(content) as unknown;
}

function loadExternalDescriptorSync(
  baseDir: string,
  localeFolder: string
): LanguageDescriptor | null {
  try {
    const rawManifest = readJsonFileSync(join(baseDir, localeFolder, "manifest.json"));
    if (rawManifest === null || typeof rawManifest !== "object" || Array.isArray(rawManifest)) {
      return null;
    }

    const manifest = rawManifest as ExternalLanguageManifest;
    const locale = normalizeAppLanguage(manifest.locale ?? localeFolder);
    const nativeName =
      typeof manifest.nativeName === "string" ? manifest.nativeName.trim() : locale.trim();

    if (nativeName === "") {
      return null;
    }

    const englishName =
      typeof manifest.englishName === "string" && manifest.englishName.trim() !== ""
        ? manifest.englishName.trim()
        : null;
    const description =
      typeof manifest.description === "string" && manifest.description.trim() !== ""
        ? manifest.description.trim()
        : null;

    return {
      locale,
      nativeName,
      direction: manifest.direction ?? "ltr",
      selectorLanguage: manifest.selectorLanguage ?? resolveSelectorLanguage(locale),
      source: "external",
      ...(englishName !== null ? { englishName } : {}),
      ...(description !== null ? { description } : {}),
    };
  } catch {
    return null;
  }
}

function loadExternalCatalogSync(baseDir: string, localeFolder: string): TranslationCatalog | null {
  try {
    const languageDir = join(baseDir, localeFolder);
    const indexPath = join(languageDir, "index.json");

    try {
      const raw = readJsonFileSync(indexPath);
      return isTranslationCatalog(raw) ? raw : {};
    } catch {
      const catalogs: TranslationCatalog[] = [];
      const entries = readdirSync(languageDir, { withFileTypes: true });

      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (
          entry.isFile() === false ||
          entry.name === "manifest.json" ||
          entry.name.endsWith(".json") === false
        ) {
          continue;
        }

        const raw = readJsonFileSync(join(languageDir, entry.name));
        if (isTranslationCatalog(raw)) {
          catalogs.push(raw);
        }
      }

      return mergeTranslationCatalogs(catalogs);
    }
  } catch {
    return null;
  }
}

export async function listMcpLanguages(): Promise<LanguageDescriptor[]> {
  return await listInstalledLanguages(LANGUAGE_ROOT);
}

export async function loadMcpLanguage(locale?: unknown): Promise<LoadedLanguagePack> {
  const requestedLocale = locale ?? (await readMcpAppLanguage());
  const fallbackPack = getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE);
  const resolvedPack =
    (await loadInstalledLanguage(LANGUAGE_ROOT, requestedLocale)) ?? fallbackPack;
  return (
    resolvedPack ?? {
      locale: DEFAULT_APP_LANGUAGE,
      nativeName: DEFAULT_APP_LANGUAGE,
      source: "builtin",
      catalog: {},
    }
  );
}
export function loadMcpLanguageSync(locale?: unknown): LoadedLanguagePack {
  const requestedLocale = locale ?? readMcpAppLanguageSync();
  const normalized = normalizeAppLanguage(requestedLocale);
  const builtIn = getBuiltInLanguagePack(normalized);

  const fallbackPack = getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE) ?? {
    locale: DEFAULT_APP_LANGUAGE,
    nativeName: DEFAULT_APP_LANGUAGE,
    source: "builtin",
    catalog: {},
  };
  const externalDescriptor = loadExternalDescriptorSync(LANGUAGE_ROOT, normalized);
  const externalCatalog = loadExternalCatalogSync(LANGUAGE_ROOT, normalized);

  if (externalDescriptor === null || externalCatalog === null) {
    return builtIn ?? fallbackPack;
  }

  if (builtIn === null) {
    return {
      ...externalDescriptor,
      catalog: externalCatalog,
    };
  }

  return {
    ...builtIn,
    ...externalDescriptor,
    source: "external",
    catalog: mergeTranslationCatalogs([builtIn.catalog, externalCatalog]),
  };
}

export async function translateMcpMessage(
  key: string,
  params?: TranslationParams,
  locale?: unknown
): Promise<string> {
  const activePack = await loadMcpLanguage(locale);
  const fallbackPack = getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE);

  return translateCatalog(activePack.catalog, key, params, fallbackPack?.catalog);
}

export async function createMcpTranslator(
  locale?: unknown
): Promise<(key: string, params?: TranslationParams) => string> {
  const activePack = await loadMcpLanguage(locale);
  const fallbackCatalog = getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE)?.catalog;

  return (key: string, params?: TranslationParams) =>
    translateCatalog(activePack.catalog, key, params, fallbackCatalog);
}

export function createMcpTranslatorSync(
  locale?: unknown
): (key: string, params?: TranslationParams) => string {
  const activePack = loadMcpLanguageSync(locale);
  const fallbackCatalog = getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE)?.catalog;

  return (key: string, params?: TranslationParams) =>
    translateCatalog(activePack.catalog, key, params, fallbackCatalog);
}
