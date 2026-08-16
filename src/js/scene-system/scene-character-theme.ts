import type {
  SceneCharacterRole,
  SceneCharacterRoleConfig,
  SceneCharacterThemeDefinition,
} from "../scene/schema.js";

import { getActiveSceneTheme } from "./scene-theme-registry.js";

export function getSceneCharacterTheme(): SceneCharacterThemeDefinition {
  return getActiveSceneTheme().characters;
}

export function getSceneCharacterRoleConfig(role: SceneCharacterRole): SceneCharacterRoleConfig {
  const characterTheme = getSceneCharacterTheme();
  const roleConfig = characterTheme.roles[role];
  const fallbackConfig = characterTheme.roles[characterTheme.fallbackRole];

  return (roleConfig ?? fallbackConfig) as SceneCharacterRoleConfig;
}
