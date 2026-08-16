import {
  type AppSettings,
  type ThemeAppearanceMode,
  type ThemeAppearanceSettings,
  type ThemeId,
  isThemeId,
} from "@shared/settings.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { SettingsManager } from "../../modules/settings-manager.js";
import {
  areThemeAppearanceSettingsEqual,
  cloneThemeAppearanceDefaults,
  normalizeThemeAppearance,
  resolveThemeFromAppearance,
} from "./appearance-normalizer.js";
import { THEME_CONFIG as CONFIG, THEMES, THEME_ORDER } from "./theme-constants.js";
import {
  clearStoredLegacyTheme,
  createThemeChannel,
  getStoredLegacyTheme,
  getStoredThemeAppearance,
  postThemeSyncPayload,
  storeThemeAppearance,
} from "./theme-persistence.js";
import {
  renderThemeSettingsPanel,
  updateThemeDropdownUI as updateThemeDropdownUiElements,
  updateThemePanelUI,
  type ThemeSettingsUiOptions,
} from "./theme-settings-ui.js";
import {
  setupThemeDropdownListeners,
  setupThemeSettingsPanelListeners,
} from "./theme-settings-bindings.js";
import { applyAppUiScale } from "./ui-scale-state.js";
import type {
  ApplyAppearanceOptions,
  ThemeChangeCallback,
  ThemeInfo,
  ThemeSyncPayload,
} from "./theme-contract.js";

let currentAppearance: Required<ThemeAppearanceSettings> = cloneThemeAppearanceDefaults();
let currentTheme: ThemeId = currentAppearance.manualTheme;
const listeners: Set<ThemeChangeCallback> = new Set();
let isInitialized = false;
let themeChannel: BroadcastChannel | null = null;
let i18nUnsubscribe: (() => void) | null = null;
let settingsUnsubscribe: (() => void) | null = null;
let scheduleTimer: ReturnType<typeof setInterval> | null = null;
let colorSchemeQuery: MediaQueryList | null = null;
let themeTransitionTimer: ReturnType<typeof setTimeout> | null = null;

function themeT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.logs.themeManager.${key}`, params);
}

function getThemeName(theme: ThemeId): string {
  return AppI18n.t(`shell.themes.${theme}.name`);
}

function isValidTheme(theme: string): theme is ThemeId {
  return isThemeId(theme);
}

function getThemeChannel(): BroadcastChannel | null {
  if (themeChannel != null) {
    return themeChannel;
  }

  themeChannel = createThemeChannel(CONFIG.channelName);
  return themeChannel;
}

function broadcastThemeState(): void {
  postThemeSyncPayload(getThemeChannel(), {
    theme: currentTheme,
    appearance: currentAppearance,
  } satisfies ThemeSyncPayload);
}

function prefersDarkMode(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  colorSchemeQuery ??= window.matchMedia("(prefers-color-scheme: dark)");
  return colorSchemeQuery.matches;
}

function applyAppearanceAttributes(appearance: Required<ThemeAppearanceSettings>): void {
  const root = document.documentElement;

  root.setAttribute("data-theme-mode", appearance.mode);
  root.setAttribute("data-theme-motion", appearance.motion);
  root.setAttribute("data-theme-scale", appearance.textScale);
  root.setAttribute("data-theme-surface", appearance.surface);
  root.setAttribute("data-theme-contrast", appearance.contrast);
  applyAppUiScale(appearance.uiScale);
}

function parseDurationMs(value: string): number | null {
  const normalized = value.trim();
  if (normalized === "") {
    return null;
  }

  if (normalized.endsWith("ms")) {
    const numeric = Number.parseFloat(normalized.slice(0, -2));
    return Number.isFinite(numeric) ? numeric : null;
  }

  if (normalized.endsWith("s")) {
    const numeric = Number.parseFloat(normalized.slice(0, -1));
    return Number.isFinite(numeric) ? numeric * 1000 : null;
  }

  return null;
}

function getThemeTransitionDuration(): number {
  const root = document.documentElement;
  const motionMode = root.getAttribute("data-theme-motion");
  if (motionMode === "off") {
    return 0;
  }

  const duration = parseDurationMs(
    getComputedStyle(root).getPropertyValue("--duration-theme-transition")
  );
  return duration ?? CONFIG.transitionDuration;
}

function getModeLabel(mode: ThemeAppearanceMode): string {
  return AppI18n.t(`shell.theme.mode.options.${mode}`);
}

function getModeHint(mode: ThemeAppearanceMode): string {
  return AppI18n.t(`shell.theme.mode.hints.${mode}`);
}

function getThemeDescription(theme: ThemeId): string {
  return AppI18n.t(`shell.themes.${theme}.description`);
}

function getThemeUiOptions(): ThemeSettingsUiOptions {
  return {
    themeOrder: THEME_ORDER,
    themes: THEMES,
    getThemeName,
    getThemeDescription,
    getModeLabel,
    getModeHint,
  };
}

function renderThemeSettingsUi(): void {
  renderThemeSettingsPanel(getThemeUiOptions());
}

function updateThemeDropdownUI(theme: ThemeId): void {
  updateThemeDropdownUiElements(theme, currentAppearance, getThemeUiOptions());
}

function applyTheme(theme: ThemeId, animate: boolean = true): void {
  const root = document.documentElement;

  if (animate) {
    root.classList.add("theme-transition");
    if (themeTransitionTimer != null) {
      clearTimeout(themeTransitionTimer);
      themeTransitionTimer = null;
    }
    const transitionDuration = getThemeTransitionDuration();
    if (transitionDuration <= 0) {
      root.classList.remove("theme-transition");
    } else {
      themeTransitionTimer = setTimeout(() => {
        root.classList.remove("theme-transition");
        themeTransitionTimer = null;
      }, transitionDuration);
    }
  }

  root.setAttribute(CONFIG.attribute, theme);
  updateThemeDropdownUI(theme);
}

function notifyListeners(theme: ThemeId): void {
  listeners.forEach((callback) => {
    try {
      callback(theme);
    } catch (err) {
      console.error(
        themeT("listenerError", { message: err instanceof Error ? err.message : String(err) }),
        err
      );
    }
  });
}

function persistAppearanceSettings(appearance: Required<ThemeAppearanceSettings>): void {
  void SettingsManager.patch((settings) => {
    const typedSettings = settings;
    const generalCandidate = typedSettings["general"];
    if (
      generalCandidate === null ||
      generalCandidate === undefined ||
      typeof generalCandidate !== "object" ||
      Array.isArray(generalCandidate)
    ) {
      typedSettings["general"] = {};
    }

    const general = typedSettings["general"] as Record<string, unknown>;
    general["appearance"] = { ...appearance };
    delete general["theme"];
  });
}

function applyManagedAppearance(
  appearance: ThemeAppearanceSettings,
  options: ApplyAppearanceOptions = {}
): void {
  const nextAppearance = normalizeThemeAppearance(appearance);
  const nextTheme = resolveThemeFromAppearance(nextAppearance, {
    prefersDarkMode: prefersDarkMode(),
  });
  const themeChanged = nextTheme !== currentTheme;
  const appearanceChanged = !areThemeAppearanceSettingsEqual(nextAppearance, currentAppearance);

  currentAppearance = nextAppearance;
  currentTheme = nextTheme;

  applyAppearanceAttributes(currentAppearance);
  applyTheme(currentTheme, (options.animate ?? true) && themeChanged);

  if (options.persistLocal !== false) {
    storeThemeAppearance(CONFIG, currentAppearance);
  }

  if (options.broadcast !== false) {
    broadcastThemeState();
  }

  if (options.persistSettings === true && appearanceChanged) {
    persistAppearanceSettings(currentAppearance);
  }

  if (themeChanged || !isInitialized) {
    notifyListeners(currentTheme);
  }
}

function applyExactTheme(
  theme: ThemeId,
  options: { animate?: boolean; persistLocal?: boolean; broadcast?: boolean } = {}
): void {
  currentAppearance = normalizeThemeAppearance({
    ...currentAppearance,
    mode: "manual",
    manualTheme: theme,
  });
  const themeChanged = theme !== currentTheme;
  currentTheme = theme;

  applyAppearanceAttributes(currentAppearance);
  applyTheme(currentTheme, options.animate ?? true);

  if (options.persistLocal === true) {
    storeThemeAppearance(CONFIG, currentAppearance);
  }

  if (options.broadcast === true) {
    broadcastThemeState();
  }

  if (themeChanged || !isInitialized) {
    notifyListeners(currentTheme);
  }
}

function syncManagedTheme(animate: boolean = true): void {
  applyManagedAppearance(currentAppearance, {
    animate,
    persistLocal: true,
    persistSettings: false,
    broadcast: true,
  });
}

function setupSyncListeners(): void {
  window.addEventListener("storage", (event) => {
    if (event.key === CONFIG.appearanceStorageKey) {
      let nextAppearance = cloneThemeAppearanceDefaults();
      if (event.newValue != null && event.newValue !== "") {
        try {
          nextAppearance = normalizeThemeAppearance(JSON.parse(event.newValue));
        } catch {
          nextAppearance = cloneThemeAppearanceDefaults();
        }
      }
      applyManagedAppearance(nextAppearance, {
        animate: true,
        persistLocal: false,
        persistSettings: false,
        broadcast: false,
      });
      return;
    }
  });

  const channel = getThemeChannel();
  if (channel != null) {
    channel.onmessage = (event: MessageEvent<ThemeSyncPayload>): void => {
      const payload = event.data;
      if (payload.appearance != null) {
        applyManagedAppearance(payload.appearance, {
          animate: true,
          persistLocal: false,
          persistSettings: false,
          broadcast: false,
        });
        return;
      }

      if (payload.theme != null && isValidTheme(payload.theme)) {
        applyExactTheme(payload.theme, {
          animate: true,
          persistLocal: false,
          broadcast: false,
        });
      }
    };
  }
}

function setupAppearanceWatchers(): void {
  if (typeof window.matchMedia === "function") {
    colorSchemeQuery ??= window.matchMedia("(prefers-color-scheme: dark)");
    const handleColorSchemeChange = (): void => {
      if (currentAppearance.mode === "system") {
        syncManagedTheme(true);
      }
    };

    if (typeof colorSchemeQuery.addEventListener === "function") {
      colorSchemeQuery.addEventListener("change", handleColorSchemeChange);
    } else if (typeof colorSchemeQuery.addListener === "function") {
      colorSchemeQuery.addListener(handleColorSchemeChange);
    }
  }

  scheduleTimer ??= setInterval(() => {
    if (currentAppearance.mode === "schedule") {
      syncManagedTheme(true);
    }
  }, 30000);
}

function setupSettingsSync(): void {
  settingsUnsubscribe ??= SettingsManager.subscribe(
    ({ settings, changedPaths }: { settings: unknown; changedPaths: string[] }) => {
      const shouldSync =
        changedPaths.includes("*") ||
        changedPaths.includes("general") ||
        changedPaths.some((path) => path.startsWith("general.appearance"));

      if (!shouldSync) {
        return;
      }

      const typedSettings = settings as AppSettings | null;
      const nextAppearance = normalizeThemeAppearance(typedSettings?.general?.appearance);

      applyManagedAppearance(nextAppearance, {
        animate: true,
        persistLocal: true,
        persistSettings: false,
        broadcast: false,
      });
    }
  );
}

function bindThemeSettingsUi(): void {
  const bindings = {
    isValidTheme,
    onSelectTheme(theme: ThemeId): void {
      themeManager.set(theme);
    },
    onUpdateAppearance(patch: Partial<Required<ThemeAppearanceSettings>>): void {
      themeManager.updateAppearance(patch);
    },
  };

  setupThemeDropdownListeners(bindings);
  setupThemeSettingsPanelListeners(bindings);
}

function syncThemeSettingsUi(): void {
  const hasThemePanel =
    document.getElementById("settings-panel-theme") != null ||
    document.getElementById("theme-settings-list") != null;
  if (!hasThemePanel) {
    return;
  }

  renderThemeSettingsUi();
  bindThemeSettingsUi();
  updateThemePanelUI(currentTheme, currentAppearance, getThemeUiOptions());
}

const themeManager = {
  get current(): ThemeId {
    return currentTheme;
  },

  get currentInfo(): ThemeInfo {
    return THEMES[currentTheme];
  },

  get isDark(): boolean {
    return THEMES[currentTheme].isDark;
  },

  get isLight(): boolean {
    return !THEMES[currentTheme].isDark;
  },

  init(): void {
    if (isInitialized) {
      syncThemeSettingsUi();
      return;
    }

    const storedAppearance = getStoredThemeAppearance(CONFIG);
    const legacyTheme = getStoredLegacyTheme(CONFIG);
    currentAppearance =
      storedAppearance ??
      normalizeThemeAppearance(
        legacyTheme != null ? { mode: "manual", manualTheme: legacyTheme } : undefined
      );
    if (legacyTheme != null) {
      if (storedAppearance == null) {
        storeThemeAppearance(CONFIG, currentAppearance);
      }
      clearStoredLegacyTheme(CONFIG);
    }
    currentTheme = resolveThemeFromAppearance(currentAppearance, {
      prefersDarkMode: prefersDarkMode(),
    });

    applyAppearanceAttributes(currentAppearance);
    applyTheme(currentTheme, false);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        syncThemeSettingsUi();
      });
    } else {
      syncThemeSettingsUi();
    }

    setupSyncListeners();
    setupAppearanceWatchers();
    setupSettingsSync();
    i18nUnsubscribe ??= AppI18n.subscribe(() => {
      syncThemeSettingsUi();
      updateThemeDropdownUI(currentTheme);
    });
    isInitialized = true;
  },

  set(theme: ThemeId, persist: boolean = true): void {
    if (!isValidTheme(theme)) {
      console.warn(themeT("invalidTheme", { theme }));
      return;
    }

    if (persist === false) {
      applyExactTheme(theme, { animate: true, persistLocal: false, broadcast: false });
      return;
    }

    themeManager.updateAppearance({
      mode: "manual",
      manualTheme: theme,
    });
  },

  updateAppearance(patch: Partial<Required<ThemeAppearanceSettings>>): void {
    const nextAppearance = normalizeThemeAppearance({
      ...currentAppearance,
      ...patch,
    });

    applyManagedAppearance(nextAppearance, {
      animate: true,
      persistLocal: true,
      persistSettings: true,
      broadcast: true,
    });
  },

  next(): void {
    const currentIndex = THEME_ORDER.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % THEME_ORDER.length;
    const nextTheme = THEME_ORDER[nextIndex];
    if (nextTheme !== undefined) {
      themeManager.set(nextTheme);
    }
  },

  prev(): void {
    const currentIndex = THEME_ORDER.indexOf(currentTheme);
    const prevIndex = (currentIndex - 1 + THEME_ORDER.length) % THEME_ORDER.length;
    const prevTheme = THEME_ORDER[prevIndex];
    if (prevTheme !== undefined) {
      themeManager.set(prevTheme);
    }
  },

  toggle(): void {
    themeManager.next();
  },

  getAvailableThemes(): ThemeInfo[] {
    return THEME_ORDER.map((id) => THEMES[id]);
  },

  getTheme(id: ThemeId): ThemeInfo {
    return THEMES[id];
  },

  getAppearance(): Required<ThemeAppearanceSettings> {
    return { ...currentAppearance };
  },

  onChange(callback: ThemeChangeCallback): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },

  getIcon(): string {
    return THEMES[currentTheme].icon;
  },

  getName(): string {
    return getThemeName(currentTheme);
  },
};

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      themeManager.init();
    });
  } else {
    themeManager.init();
  }

  window.__ThemeManager = themeManager;
}

export { THEMES };
export type { ThemeId } from "@shared/settings.js";
export { themeManager as ThemeManager };
