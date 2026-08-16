import { DEFAULT_SCENE_THEME_ID, type AppSettings } from "@shared/settings.js";

import { getBuiltInSceneThemeRegistrations } from "./scene-theme-builtin-registry.js";
import {
  getInstalledSceneThemeRegistrations,
  subscribeInstalledSceneThemeRegistry,
} from "./scene-theme-installed-registry.js";
import type { SceneThemeRegistration, SceneThemeSummary } from "./scene-theme-registry-contract.js";

type SceneThemeChangeReason = "init" | "manual" | "settings" | "registry";
type SceneThemeChangeListener = (event: SceneThemeChangeEvent) => void;
type SceneThemeRegistryListener = () => void;

interface SceneThemeSettingsManagerLike {
  getSnapshot(): AppSettings;
  set(path: string, value: unknown): Promise<boolean>;
  subscribe(listener: (event: { settings: unknown; changedPaths: string[] }) => void): () => void;
}

export interface SceneThemeChangeEvent {
  reason: SceneThemeChangeReason;
  themeId: string;
  availableThemes: SceneThemeSummary[];
}

export interface SceneThemeManagerDependencies {
  fallbackThemeId?: string;
  getBuiltInThemes?: () => SceneThemeRegistration[];
  getInstalledThemes?: () => SceneThemeRegistration[];
  settingsManager?: SceneThemeSettingsManagerLike;
  subscribeInstalledThemes?: (listener: SceneThemeRegistryListener) => () => void;
}

function trimSceneThemeId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export class SceneThemeManagerClass {
  private readonly fallbackThemeId: string;
  private readonly getBuiltInThemes: () => SceneThemeRegistration[];
  private readonly getInstalledThemes: () => SceneThemeRegistration[];
  private readonly subscribeInstalledThemes: (listener: SceneThemeRegistryListener) => () => void;

  private readonly listeners = new Set<SceneThemeChangeListener>();
  private availableThemes = new Map<string, SceneThemeRegistration>();
  private currentThemeId = DEFAULT_SCENE_THEME_ID;
  private currentThemeRegistration: SceneThemeRegistration | null = null;
  private settingsManager: SceneThemeSettingsManagerLike | null;
  private settingsUnsubscribe: (() => void) | null = null;
  private initialized = false;

  constructor(dependencies: SceneThemeManagerDependencies = {}) {
    const fallbackThemeId = trimSceneThemeId(dependencies.fallbackThemeId);
    this.fallbackThemeId = fallbackThemeId !== "" ? fallbackThemeId : DEFAULT_SCENE_THEME_ID;
    this.getBuiltInThemes = dependencies.getBuiltInThemes ?? getBuiltInSceneThemeRegistrations;
    this.getInstalledThemes =
      dependencies.getInstalledThemes ?? getInstalledSceneThemeRegistrations;
    this.settingsManager = dependencies.settingsManager ?? null;
    this.subscribeInstalledThemes =
      dependencies.subscribeInstalledThemes ?? subscribeInstalledSceneThemeRegistry;
  }

  init(): void {
    this.ensureInitialized();
  }

  connectSettingsManager(settingsManager: SceneThemeSettingsManagerLike): void {
    this.settingsManager = settingsManager;
    this.ensureSettingsSubscription();

    if (this.initialized) {
      this.syncFromSettings(settingsManager.getSnapshot(), "settings");
    }
  }

  getCurrentThemeId(): string {
    this.ensureInitialized();
    return this.currentThemeId;
  }

  getThemeRegistration(themeId?: string): SceneThemeRegistration {
    this.ensureInitialized();

    if (themeId !== undefined) {
      const requestedThemeId = trimSceneThemeId(themeId);
      const registration = this.availableThemes.get(requestedThemeId);
      if (registration !== undefined) {
        return registration;
      }
    }

    return this.getCurrentThemeRegistration();
  }

  getAvailableThemes(): SceneThemeSummary[] {
    this.ensureInitialized();

    return this.getThemeSummaries();
  }

  onChange(listener: SceneThemeChangeListener): () => void {
    this.ensureInitialized();
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async setCurrentTheme(themeId: string): Promise<boolean> {
    this.ensureInitialized();

    const nextThemeId = this.resolveRequestedThemeId(themeId);
    this.applyCurrentTheme(nextThemeId, "manual");

    if (this.settingsManager === null) {
      return true;
    }

    return await this.settingsManager.set("scene.appearance.activeThemeId", nextThemeId);
  }

  reload(): void {
    this.ensureInitialized();
    this.refreshAvailableThemes();

    if (this.settingsManager !== null) {
      this.syncFromSettings(this.settingsManager.getSnapshot(), "registry");
      return;
    }

    this.applyCurrentTheme(this.resolveRequestedThemeId(this.currentThemeId), "registry");
  }

  private ensureInitialized(): void {
    if (this.initialized) {
      return;
    }

    this.refreshAvailableThemes();
    this.initialized = true;

    this.ensureSettingsSubscription();

    if (this.settingsManager !== null) {
      this.syncFromSettings(this.settingsManager.getSnapshot(), "init");
    } else {
      this.applyCurrentTheme(this.resolveRequestedThemeId(this.currentThemeId), "init");
    }

    this.subscribeInstalledThemes(() => {
      this.refreshAvailableThemes();
      if (this.settingsManager !== null) {
        this.syncFromSettings(this.settingsManager.getSnapshot(), "registry");
        return;
      }
      this.applyCurrentTheme(this.resolveRequestedThemeId(this.currentThemeId), "registry");
    });
  }

  private refreshAvailableThemes(): void {
    const nextAvailableThemes = new Map<string, SceneThemeRegistration>();

    this.getBuiltInThemes().forEach((registration) => {
      const themeId = trimSceneThemeId(registration.themeId);
      if (themeId === "") {
        return;
      }

      nextAvailableThemes.set(themeId, {
        ...registration,
        themeId,
      });
    });

    // NOTE: Built-in themes keep precedence so stale installed packs cannot shadow them.
    this.getInstalledThemes().forEach((registration) => {
      const themeId = trimSceneThemeId(registration.themeId);
      if (themeId === "" || nextAvailableThemes.has(themeId)) {
        return;
      }

      nextAvailableThemes.set(themeId, {
        ...registration,
        themeId,
        sourceKind: "installed",
      });
    });

    this.availableThemes = nextAvailableThemes;
  }

  private getCurrentThemeRegistration(): SceneThemeRegistration {
    this.ensureInitialized();

    const currentRegistration = this.currentThemeRegistration;
    if (currentRegistration !== null) {
      return currentRegistration;
    }

    const fallbackRegistration = this.resolveFallbackRegistration();
    this.currentThemeRegistration = fallbackRegistration;
    this.currentThemeId = fallbackRegistration.themeId;
    return fallbackRegistration;
  }

  private resolveRequestedThemeId(value: unknown): string {
    const requestedThemeId = trimSceneThemeId(value);
    if (requestedThemeId !== "" && this.availableThemes.has(requestedThemeId)) {
      return requestedThemeId;
    }

    return this.resolveFallbackRegistration().themeId;
  }

  private resolveFallbackRegistration(): SceneThemeRegistration {
    return (
      this.availableThemes.get(this.fallbackThemeId) ??
      this.availableThemes.values().next().value ??
      this.createMissingFallbackRegistration()
    );
  }

  private createMissingFallbackRegistration(): SceneThemeRegistration {
    throw new Error("Scene theme manager requires at least one registered scene theme.");
  }

  private syncFromSettings(settings: AppSettings, reason: SceneThemeChangeReason): void {
    const nextThemeId = this.resolveRequestedThemeId(settings.scene?.appearance?.activeThemeId);
    this.applyCurrentTheme(nextThemeId, reason);
  }

  private applyCurrentTheme(themeId: string, reason: SceneThemeChangeReason): void {
    const nextRegistration =
      this.availableThemes.get(themeId) ?? this.resolveFallbackRegistration();
    const currentThemeRegistration = this.currentThemeRegistration;
    if (
      currentThemeRegistration?.themeId === nextRegistration.themeId &&
      currentThemeRegistration.source === nextRegistration.source &&
      currentThemeRegistration.sourceRoot === nextRegistration.sourceRoot &&
      currentThemeRegistration.sourceKind === nextRegistration.sourceKind
    ) {
      return;
    }

    this.currentThemeId = nextRegistration.themeId;
    this.currentThemeRegistration = nextRegistration;
    this.notifyListeners({
      reason,
      themeId: nextRegistration.themeId,
      availableThemes: this.getThemeSummaries(),
    });
  }

  private notifyListeners(event: SceneThemeChangeEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // Ignore listener failures so theme changes keep flowing.
      }
    });
  }

  private getThemeSummaries(): SceneThemeSummary[] {
    return [...this.availableThemes.values()].map((registration) => ({
      themeId: registration.themeId,
      label: registration.label,
      sourceKind: registration.sourceKind,
      sourceRoot: registration.sourceRoot,
    }));
  }

  private ensureSettingsSubscription(): void {
    if (this.settingsManager === null || this.settingsUnsubscribe !== null) {
      return;
    }

    this.settingsUnsubscribe = this.settingsManager.subscribe(({ settings, changedPaths }) => {
      if (
        changedPaths.includes("*") ||
        changedPaths.some((path) => path === "scene" || path.startsWith("scene."))
      ) {
        this.syncFromSettings(settings as AppSettings, "settings");
      }
    });
  }
}

const sceneThemeManager = new SceneThemeManagerClass();

export { sceneThemeManager as SceneThemeManager };
