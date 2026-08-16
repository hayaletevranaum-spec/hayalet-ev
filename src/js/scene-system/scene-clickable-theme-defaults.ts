import type { SceneClickableThemeDefinition } from "../scene/schema.js";

import { cloneSceneClickableTheme } from "./scene-clickable-theme-core.js";
import { SceneThemeManager } from "./scene-theme-manager.js";

export function getSceneDefaultClickableTheme(): SceneClickableThemeDefinition {
  return cloneSceneClickableTheme(SceneThemeManager.getThemeRegistration().clickableDefaults);
}
