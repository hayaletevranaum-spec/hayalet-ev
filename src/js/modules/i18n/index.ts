import type {
  AppLanguage,
  LanguageDescriptor,
  LoadedLanguagePack,
  TranslationCatalog,
  TranslationParams,
} from "@shared/i18n.js";
import { DEFAULT_APP_LANGUAGE } from "@shared/i18n.js";
import { translateCatalog } from "../../../../shared/i18n/catalog.js";
import { getBuiltInLanguageDescriptors } from "../../../../shared/i18n/built-in-descriptors.js";
import { getBuiltInLanguagePack } from "../../../../shared/i18n/bundled-languages.js";
import { normalizeAppLanguage, resolveSelectorLanguage } from "../../../../shared/i18n/locale.js";
import { loadBuiltInLanguagePack } from "./built-in-loader.js";

interface I18nSettingsSnapshot {
  general?: {
    language?: unknown;
  };
}

interface I18nSettingsEvent {
  settings: unknown;
  changedPaths: string[];
}

interface I18nSettingsManager {
  getSnapshot(): I18nSettingsSnapshot | null;
  subscribe(listener: (event: I18nSettingsEvent) => void): () => void;
}

function formatLanguageLabel(language: LanguageDescriptor): string {
  const englishName = language.englishName?.trim();
  if (englishName === undefined || englishName === "" || englishName === language.nativeName) {
    return language.nativeName;
  }

  return `${language.nativeName} (${englishName})`;
}

class AppI18nManager {
  private currentLocale: AppLanguage = DEFAULT_APP_LANGUAGE;
  private activePack: LoadedLanguagePack = getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE) ?? {
    locale: DEFAULT_APP_LANGUAGE,
    nativeName: DEFAULT_APP_LANGUAGE,
    source: "builtin",
    catalog: {},
  };
  private activeCatalog: TranslationCatalog = this.activePack.catalog;
  private fallbackCatalog: TranslationCatalog = this.activePack.catalog;
  private availableLanguages: LanguageDescriptor[] = getBuiltInLanguageDescriptors();
  private listeners = new Set<(pack: LoadedLanguagePack) => void>();
  private settingsUnsubscribe: (() => void) | null = null;
  private defaultPackPromise: Promise<LoadedLanguagePack | null> | null = null;

  constructor() {
    void this.ensureDefaultPack();
  }

  private async ensureDefaultPack(): Promise<LoadedLanguagePack | null> {
    if (this.defaultPackPromise !== null) {
      return await this.defaultPackPromise;
    }

    this.defaultPackPromise = (async (): Promise<LoadedLanguagePack | null> => {
      const defaultPack = await loadBuiltInLanguagePack(DEFAULT_APP_LANGUAGE);
      if (defaultPack === null) {
        return null;
      }

      this.fallbackCatalog = defaultPack.catalog;
      if (
        this.currentLocale === DEFAULT_APP_LANGUAGE &&
        Object.keys(this.activeCatalog).length === 0
      ) {
        this.activePack = defaultPack;
        this.activeCatalog = defaultPack.catalog;
        this.applyDocumentLocale(defaultPack);
      }

      return defaultPack;
    })();

    return await this.defaultPackPromise;
  }

  private applyDocumentLocale(pack: LoadedLanguagePack): void {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.lang = pack.locale;
    document.documentElement.dir = pack.direction ?? "ltr";
    document.body.setAttribute("data-app-language", pack.locale);
  }

  private emitChange(pack: LoadedLanguagePack): void {
    for (const listener of this.listeners) {
      listener(pack);
    }
  }

  async bootstrap(settingsManager: I18nSettingsManager): Promise<void> {
    await this.setLocale(settingsManager.getSnapshot()?.general?.language);

    if (this.settingsUnsubscribe !== null) {
      return;
    }

    this.settingsUnsubscribe = settingsManager.subscribe((event) => {
      if (
        event.changedPaths.includes("*") === false &&
        event.changedPaths.some((path) => path.startsWith("general")) === false
      ) {
        return;
      }

      const settings = event.settings as I18nSettingsSnapshot | null;
      void this.setLocale(settings?.general?.language);
    });
  }

  async listLanguages(): Promise<LanguageDescriptor[]> {
    const api = window.electronAPI;
    const i18nListLanguages = api?.["i18nListLanguages"] as
      (() => Promise<LanguageDescriptor[]>) | undefined;
    if (typeof i18nListLanguages !== "function") {
      return this.availableLanguages;
    }

    try {
      const languages = await i18nListLanguages();
      if (Array.isArray(languages) && languages.length > 0) {
        this.availableLanguages = languages;
      }
    } catch {
      this.availableLanguages = getBuiltInLanguageDescriptors();
    }

    return this.availableLanguages;
  }

  async setLocale(locale: unknown, options: { forceEmit?: boolean } = {}): Promise<void> {
    const normalized = normalizeAppLanguage(locale);
    const api = window.electronAPI;
    const i18nLoadLanguage = api?.["i18nLoadLanguage"] as
      ((locale: string) => Promise<LoadedLanguagePack | null>) | undefined;
    const previousLocale = this.currentLocale;
    const defaultPackPromise = this.ensureDefaultPack();
    const fallbackLocale = resolveSelectorLanguage(normalized);
    const [nextPack, builtInPack, fallbackPack, defaultPack] = await Promise.all([
      (async (): Promise<LoadedLanguagePack | null> => {
        try {
          return typeof i18nLoadLanguage === "function" ? await i18nLoadLanguage(normalized) : null;
        } catch {
          return null;
        }
      })(),
      loadBuiltInLanguagePack(normalized),
      fallbackLocale !== normalized
        ? loadBuiltInLanguagePack(fallbackLocale)
        : Promise.resolve(null),
      defaultPackPromise,
    ]);

    this.currentLocale = normalized;
    this.activePack = nextPack ?? builtInPack ?? fallbackPack ?? defaultPack ?? this.activePack;
    this.activeCatalog = this.activePack.catalog;
    this.applyDocumentLocale(this.activePack);

    if (options.forceEmit === true || previousLocale !== this.currentLocale) {
      this.emitChange(this.activePack);
    }
  }

  async reload(): Promise<void> {
    await this.setLocale(this.currentLocale, { forceEmit: true });
  }

  getLocale(): AppLanguage {
    return this.currentLocale;
  }

  subscribe(listener: (pack: LoadedLanguagePack) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  t(key: string, params?: TranslationParams): string {
    return translateCatalog(this.activeCatalog, key, params, this.fallbackCatalog);
  }

  getNamespaceCatalog(path: string[]): TranslationCatalog {
    let current: string | TranslationCatalog = this.activeCatalog;

    for (const segment of path) {
      if (typeof current === "string") {
        return {};
      }

      current = current[segment] ?? {};
    }

    return typeof current === "string" ? {} : structuredClone(current);
  }
}

export { formatLanguageLabel };
// eslint-disable-next-line @typescript-eslint/naming-convention
export const AppI18n = new AppI18nManager();
