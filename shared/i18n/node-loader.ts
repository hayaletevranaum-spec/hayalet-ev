import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import type {
  ExternalLanguageManifest,
  LanguageDescriptor,
  LoadedLanguagePack,
  TranslationCatalog,
} from "../../src/types/i18n.js";
import {
  mergeTranslationCatalogs,
  isTranslationCatalog,
  normalizeLogNamespaceCatalog,
} from "./catalog.js";
import {
  getBuiltInLanguageDescriptor,
  getBuiltInLanguageDescriptors,
  getBuiltInLanguagePack,
} from "./bundled-languages.js";
import { normalizeAppLanguage, resolveSelectorLanguage } from "./locale.js";

export interface RoomLanguageSource {
  roomId: string;
  baseDir: string;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as unknown;
}

function buildExternalDescriptor(
  manifest: ExternalLanguageManifest,
  localeHint: string
): LanguageDescriptor | null {
  const locale = normalizeAppLanguage(manifest.locale ?? localeHint);
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
}

async function loadExternalDescriptor(
  baseDir: string,
  localeFolder: string
): Promise<LanguageDescriptor | null> {
  const manifestPath = join(baseDir, localeFolder, "manifest.json");
  if ((await pathExists(manifestPath)) === false) {
    return null;
  }

  const rawManifest = await readJsonFile(manifestPath);
  if (rawManifest === null || typeof rawManifest !== "object" || Array.isArray(rawManifest)) {
    return null;
  }

  return buildExternalDescriptor(rawManifest as ExternalLanguageManifest, localeFolder);
}

async function loadExternalCatalog(baseDir: string, localeFolder: string): Promise<TranslationCatalog> {
  const languageDir = join(baseDir, localeFolder);
  const indexPath = join(languageDir, "index.json");

  if (await pathExists(indexPath)) {
    const raw = await readJsonFile(indexPath);
    return normalizeLogNamespaceCatalog(isTranslationCatalog(raw) ? raw : {});
  }

  const entries = await readdir(languageDir, { withFileTypes: true });
  const catalogs: TranslationCatalog[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isFile() === false || entry.name === "manifest.json" || entry.name.endsWith(".json") === false) {
      continue;
    }

    const raw = await readJsonFile(join(languageDir, entry.name));
    if (isTranslationCatalog(raw)) {
      catalogs.push(raw);
    }
  }

  return normalizeLogNamespaceCatalog(mergeTranslationCatalogs(catalogs));
}

async function loadLooseCatalog(baseDir: string, localeFolder: string): Promise<TranslationCatalog | null> {
  const filePath = join(baseDir, `${localeFolder}.json`);
  if (await pathExists(filePath)) {
    const raw = await readJsonFile(filePath);
    return normalizeLogNamespaceCatalog(isTranslationCatalog(raw) ? raw : {});
  }

  const localeDir = join(baseDir, localeFolder);
  if (await pathExists(localeDir)) {
    return await loadExternalCatalog(baseDir, localeFolder);
  }

  return null;
}

async function listExternalLanguages(baseDir: string): Promise<LanguageDescriptor[]> {
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    const descriptors = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => await loadExternalDescriptor(baseDir, entry.name))
    );

    return descriptors
      .filter((descriptor): descriptor is LanguageDescriptor => descriptor !== null)
      .sort((left, right) => left.nativeName.localeCompare(right.nativeName));
  } catch {
    return [];
  }
}

export async function listInstalledLanguages(baseDir: string): Promise<LanguageDescriptor[]> {
  const merged = new Map<string, LanguageDescriptor>();

  for (const descriptor of getBuiltInLanguageDescriptors()) {
    merged.set(descriptor.locale, descriptor);
  }

  for (const descriptor of await listExternalLanguages(baseDir)) {
    const builtIn = getBuiltInLanguageDescriptor(descriptor.locale);
    merged.set(
      descriptor.locale,
      builtIn === null
        ? descriptor
        : {
            ...builtIn,
            ...descriptor,
            source: "external",
          }
    );
  }

  return Array.from(merged.values()).sort((left, right) => {
    if (left.locale === "tr") return -1;
    if (right.locale === "tr") return 1;
    if (left.locale === "en") return -1;
    if (right.locale === "en") return 1;
    return left.nativeName.localeCompare(right.nativeName);
  });
}

export async function loadInstalledLanguage(
  baseDir: string,
  locale: unknown
): Promise<LoadedLanguagePack | null> {
  const normalized = normalizeAppLanguage(locale);
  const builtIn = getBuiltInLanguagePack(normalized);

  try {
    const externalDescriptor = await loadExternalDescriptor(baseDir, normalized);
    if (externalDescriptor === null) {
      return builtIn;
    }

    const externalCatalog = await loadExternalCatalog(baseDir, normalized);
    if (builtIn === null) {
      return {
        ...externalDescriptor,
        catalog: normalizeLogNamespaceCatalog(externalCatalog),
      };
    }

    return {
      ...builtIn,
      ...externalDescriptor,
      source: "external",
      catalog: normalizeLogNamespaceCatalog(
        mergeTranslationCatalogs([builtIn.catalog, externalCatalog])
      ),
    };
  } catch {
    return builtIn;
  }
}

export async function loadRoomScopedCatalogs(
  sources: RoomLanguageSource[],
  locale: unknown
): Promise<TranslationCatalog> {
  const normalized = normalizeAppLanguage(locale);
  const fallbackLocale = resolveSelectorLanguage(normalized);
  const localeCandidates = [normalized, fallbackLocale, "en"].filter(
    (value, index, array) => array.indexOf(value) === index && value.trim() !== ""
  );

  const catalogs = await Promise.all(
    sources.map(async (source) => {
      for (const candidate of localeCandidates) {
        const catalog = await loadLooseCatalog(source.baseDir, candidate);
        if (catalog !== null) {
          return {
            rooms: {
              [source.roomId]: catalog,
            },
          } as TranslationCatalog;
        }
      }

      return null;
    })
  );

  const mergedCatalogs: TranslationCatalog[] = catalogs.filter(
    (catalog): catalog is TranslationCatalog => catalog !== null
  );
  return normalizeLogNamespaceCatalog(
    mergeTranslationCatalogs(mergedCatalogs)
  );
}
