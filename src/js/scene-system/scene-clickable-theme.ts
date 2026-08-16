import type { SceneClickableThemeDefinition } from "../scene/schema.js";
import { getActiveSceneTheme } from "./scene-theme-registry.js";
export * from "./scene-clickable-theme-core.js";

import { cloneSceneClickableTheme } from "./scene-clickable-theme-core.js";

export function getSceneClickableTheme(): SceneClickableThemeDefinition {
  return cloneSceneClickableTheme(getActiveSceneTheme().clickableDefaults);
}
