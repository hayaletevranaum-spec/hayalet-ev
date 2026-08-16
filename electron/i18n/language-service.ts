import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  AppLanguage,
  LanguageDescriptor,
  LoadedLanguagePack,
  TranslationCatalog,
  TranslationParams,
} from "../../src/types/i18n.js";
import { DEFAULT_APP_LANGUAGE } from "../../src/types/i18n.js";
import {
  mergeTranslationCatalogs,
  normalizeLogNamespaceCatalog,
  translateCatalog,
} from "../../shared/i18n/catalog.js";
import { getBuiltInLanguagePack } from "../../shared/i18n/bundled-languages.js";
import { normalizeAppLanguage } from "../../shared/i18n/locale.js";
import {
  listInstalledLanguages,
  loadInstalledLanguage,
  loadRoomScopedCatalogs,
  type RoomLanguageSource,
} from "../../shared/i18n/node-loader.js";
import { resolveConfigDir, resolveDataDir } from "../path-roots.ts";
import type { RoomRegistryState } from "@shared/index.js";

function getLanguageRootDir(): string {
  return join(resolveDataDir(), "shared", "languages");
}

function getSettingsPath(): string {
  return join(resolveConfigDir(), "settings.json");
}

function getRoomsRegistryPath(): string {
  return join(resolveConfigDir(), "rooms.json");
}

async function listInstalledRoomI18nSources(): Promise<RoomLanguageSource[]> {
  try {
    const raw = await readFile(getRoomsRegistryPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<RoomRegistryState>;
    if (parsed.version !== 2 || Array.isArray(parsed.rooms) === false) {
      return [];
    }

    return parsed.rooms
      .map((room) => ({
        roomId: room.id,
        baseDir: room.i18nBaseDir ?? "",
      }))
      .filter(
        (room): room is RoomLanguageSource =>
          room.roomId.trim() !== "" && room.baseDir.trim() !== ""
      );
  } catch {
    return [];
  }
}

function mergeLanguageCatalogs(
  activePack: LoadedLanguagePack | null,
  roomCatalog: TranslationCatalog,
  locale: AppLanguage
): LoadedLanguagePack | null {
  if (Object.keys(roomCatalog).length === 0) {
    return activePack;
  }

  if (activePack === null) {
    return {
      locale,
      nativeName: locale,
      source: "external",
      catalog: normalizeLogNamespaceCatalog(roomCatalog),
    };
  }

  return {
    ...activePack,
    catalog: normalizeLogNamespaceCatalog(
      mergeTranslationCatalogs([activePack.catalog, roomCatalog])
    ),
  };
}

type SettingsSnapshot = {
  general?: {
    language?: unknown;
  };
};

export async function listAvailableLanguages(): Promise<LanguageDescriptor[]> {
  return await listInstalledLanguages(getLanguageRootDir());
}

export async function loadAvailableLanguage(locale: unknown): Promise<LoadedLanguagePack | null> {
  const normalized = normalizeAppLanguage(locale);
  const [activePack, roomSources] = await Promise.all([
    loadInstalledLanguage(getLanguageRootDir(), normalized),
    listInstalledRoomI18nSources(),
  ]);

  if (roomSources.length === 0) {
    return activePack;
  }

  const roomCatalog = await loadRoomScopedCatalogs(roomSources, normalized);
  return mergeLanguageCatalogs(activePack, roomCatalog, normalized);
}

export async function readElectronAppLanguage(): Promise<AppLanguage> {
  try {
    const raw = await readFile(getSettingsPath(), "utf8");
    const parsed = JSON.parse(raw) as SettingsSnapshot;
    return normalizeAppLanguage(parsed.general?.language);
  } catch {
    return DEFAULT_APP_LANGUAGE;
  }
}

export function readElectronAppLanguageSync(): AppLanguage {
  try {
    const raw = readFileSync(getSettingsPath(), "utf8");
    const parsed = JSON.parse(raw) as SettingsSnapshot;
    return normalizeAppLanguage(parsed.general?.language);
  } catch {
    return DEFAULT_APP_LANGUAGE;
  }
}

export async function loadResolvedLanguage(locale?: unknown): Promise<LoadedLanguagePack> {
  const resolvedLocale = normalizeAppLanguage(locale ?? (await readElectronAppLanguage()));
  const fallbackPack = getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE);
  const resolvedPack =
    (await loadAvailableLanguage(resolvedLocale)) ??
    getBuiltInLanguagePack(resolvedLocale) ??
    fallbackPack;
  return (
    resolvedPack ?? {
      locale: DEFAULT_APP_LANGUAGE,
      nativeName: DEFAULT_APP_LANGUAGE,
      source: "builtin",
      catalog: {},
    }
  );
}

export async function createElectronTranslator(locale?: unknown): Promise<{
  locale: AppLanguage;
  t: (key: string, params?: TranslationParams) => string;
}> {
  const activePack = await loadResolvedLanguage(locale);
  const fallbackCatalog = getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE)?.catalog;

  return {
    locale: activePack.locale,
    t: (key: string, params?: TranslationParams) =>
      translateCatalog(activePack.catalog, key, params, fallbackCatalog),
  };
}

export async function translateElectronMessage(
  key: string,
  params?: TranslationParams,
  locale?: unknown
): Promise<string> {
  const translator = await createElectronTranslator(locale);
  return translator.t(key, params);
}
