import type { SceneLoadingThemeDefinition } from "../scene/schema.js";

import { getActiveSceneTheme } from "./scene-theme-registry.js";

export function getSceneLoadingTheme(): SceneLoadingThemeDefinition {
  return getActiveSceneTheme().loading;
}
