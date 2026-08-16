import {
  DEFAULT_SCENE_APPEARANCE_SETTINGS,
  normalizeUiScalePercent,
  type AppSettings,
  type UiScalePercent,
} from "@shared/settings.js";

import { applySceneUiScale } from "../ui/theme/ui-scale-state.js";

type SceneUiScaleListener = (uiScale: UiScalePercent) => void;

interface SceneUiScaleSettingsManagerLike {
  getSnapshot(): AppSettings;
  set(path: string, value: unknown): Promise<boolean>;
  subscribe(listener: (event: { settings: unknown; changedPaths: string[] }) => void): () => void;
}

export class SceneUiScaleManagerClass {
  private currentUiScale: UiScalePercent = DEFAULT_SCENE_APPEARANCE_SETTINGS.uiScale;
  private readonly listeners = new Set<SceneUiScaleListener>();
  private settingsManager: SceneUiScaleSettingsManagerLike | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  private initialized = false;

  init(): void {
    this.ensureInitialized();
  }

  connectSettingsManager(settingsManager: SceneUiScaleSettingsManagerLike): void {
    this.settingsManager = settingsManager;
    this.ensureSettingsSubscription();

    if (this.initialized) {
      this.syncFromSettings(settingsManager.getSnapshot());
    }
  }

  getUiScale(): UiScalePercent {
    this.ensureInitialized();
    return this.currentUiScale;
  }

  onChange(listener: SceneUiScaleListener): () => void {
    this.ensureInitialized();
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async setUiScale(value: unknown): Promise<boolean> {
    this.ensureInitialized();

    const nextUiScale = normalizeUiScalePercent(value, this.currentUiScale);
    this.applyUiScale(nextUiScale);

    if (this.settingsManager === null) {
      return true;
    }

    return await this.settingsManager.set("scene.appearance.uiScale", nextUiScale);
  }

  private ensureInitialized(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.ensureSettingsSubscription();

    if (this.settingsManager !== null) {
      this.syncFromSettings(this.settingsManager.getSnapshot());
      return;
    }

    this.applyUiScale(this.currentUiScale);
  }

  private syncFromSettings(settings: AppSettings): void {
    const nextUiScale = normalizeUiScalePercent(
      settings.scene?.appearance?.uiScale,
      DEFAULT_SCENE_APPEARANCE_SETTINGS.uiScale
    );
    this.applyUiScale(nextUiScale);
  }

  private applyUiScale(nextUiScale: UiScalePercent): void {
    applySceneUiScale(nextUiScale);
    if (nextUiScale === this.currentUiScale) {
      return;
    }

    this.currentUiScale = nextUiScale;
    this.listeners.forEach((listener) => {
      try {
        listener(nextUiScale);
      } catch {
        // Ignore listener failures so other scale updates continue to flow.
      }
    });
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
        this.syncFromSettings(settings as AppSettings);
      }
    });
  }
}

const sceneUiScaleManager = new SceneUiScaleManagerClass();

export { sceneUiScaleManager as SceneUiScaleManager };
