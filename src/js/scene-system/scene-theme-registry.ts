import { CASTLE_THEME_SOURCE } from "@theme-source/castle/manifest.js";

import type { SceneThemeRegistration, SceneThemeSummary } from "./scene-theme-registry-contract.js";
import { SceneThemeManager } from "./scene-theme-manager.js";
import type { SceneThemeSourceDefinition } from "./theme-source-contract.js";

export function getActiveSceneTheme(): SceneThemeSourceDefinition {
  const activeRegistration = SceneThemeManager.getThemeRegistration();
  return resolveSceneThemeSource(activeRegistration);
}

export function getActiveSceneThemeId(): string {
  return SceneThemeManager.getCurrentThemeId();
}

export function getAvailableSceneThemes(): SceneThemeSummary[] {
  return SceneThemeManager.getAvailableThemes();
}

export function getSceneThemeRegistration(themeId?: string): SceneThemeRegistration {
  return SceneThemeManager.getThemeRegistration(themeId);
}

function resolveSceneThemeSource(registration: SceneThemeRegistration): SceneThemeSourceDefinition {
  if (registration.source !== undefined) {
    return registration.source;
  }

  switch (registration.themeId) {
    case "castle":
    default:
      return CASTLE_THEME_SOURCE as unknown as SceneThemeSourceDefinition;
  }
}
