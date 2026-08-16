import type { SceneRoomId } from "../scene/schema.js";
import type { SceneLayoutConfig } from "../scene/layout/index.js";

import { SceneThemeManager } from "./scene-theme-manager.js";

export function getSceneThemeId(): string {
  return SceneThemeManager.getCurrentThemeId();
}

export function getSceneThemeSourceRoot(themeId = getSceneThemeId()): string {
  return SceneThemeManager.getThemeRegistration(themeId).sourceRoot;
}

export function getSceneRoomLayout(roomId: SceneRoomId): SceneLayoutConfig {
  return SceneThemeManager.getThemeRegistration().maps[roomId];
}

export function getSceneRoomSourcePath(roomId: SceneRoomId): string {
  return `${getSceneThemeSourceRoot()}/maps/${roomId}.scene.json`;
}

export function getSceneClickableDefaultsSourcePath(): string {
  return `${getSceneThemeSourceRoot()}/scene-clickable-defaults.ts`;
}
