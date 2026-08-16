import type {
  SceneRoomId,
  SceneRoomThemeDefinition,
  SceneThemeViewDefinition,
} from "../scene/schema.js";

import {
  getSceneThemeAssetEntryRuntimeSource,
  getSceneThemeRuntimeSource,
  getSceneThemeAssetTransparentWindow,
} from "../scene-editor/scene-theme-asset-state.js";
import { getActiveSceneTheme } from "./scene-theme-registry.js";

export function getSceneRoomTheme(roomId: SceneRoomId): SceneRoomThemeDefinition {
  return getActiveSceneTheme().rooms[roomId];
}

export function getSceneRoomBackgroundSrc(roomId: SceneRoomId): string {
  return (
    getSceneThemeAssetEntryRuntimeSource(roomId, "background") ??
    getSceneThemeRuntimeSource(getSceneRoomTheme(roomId).backgroundSrc)
  );
}

export function getSceneRoomViewDefinition(
  roomId: SceneRoomId,
  viewId: string
): SceneThemeViewDefinition | null {
  return getSceneRoomTheme(roomId).views?.[viewId] ?? null;
}

export function getSceneRoomViewBackgroundSrc(
  roomId: SceneRoomId,
  viewId: string,
  fallbackToRoomBackground = true
): string | null {
  const overrideBackgroundSrc = getSceneThemeAssetEntryRuntimeSource(
    roomId,
    "view-background",
    viewId
  );
  if (overrideBackgroundSrc !== null) {
    return overrideBackgroundSrc;
  }

  const themeBackgroundSrc = getSceneThemeRuntimeSource(
    getSceneRoomViewDefinition(roomId, viewId)?.backgroundSrc ?? ""
  );
  if (themeBackgroundSrc !== "") {
    return themeBackgroundSrc;
  }

  if (fallbackToRoomBackground) {
    return getSceneRoomBackgroundSrc(roomId);
  }

  return null;
}

export function getSceneRoomViewPanelArtSrc(roomId: SceneRoomId, viewId: string): string | null {
  const runtimeSource =
    getSceneThemeAssetEntryRuntimeSource(roomId, "view-panel-art", viewId) ??
    getSceneThemeRuntimeSource(getSceneRoomViewDefinition(roomId, viewId)?.panelArtSrc ?? "");
  return runtimeSource !== "" ? runtimeSource : null;
}

export function getSceneRoomPanelSrc(roomId: SceneRoomId, panelId: string): string | null {
  const runtimeSource =
    getSceneThemeAssetEntryRuntimeSource(roomId, "panel", panelId) ??
    getSceneThemeRuntimeSource(getSceneRoomTheme(roomId).panels?.[panelId] ?? "");
  return runtimeSource !== "" ? runtimeSource : null;
}

export function getSceneRoomViewPanelTransparentWindow(
  roomId: SceneRoomId,
  viewId: string
): ReturnType<typeof getSceneThemeAssetTransparentWindow> {
  return getSceneThemeAssetTransparentWindow(roomId, "view-panel-art", viewId);
}

export function getSceneRoomPanelTransparentWindow(
  roomId: SceneRoomId,
  panelId: string
): ReturnType<typeof getSceneThemeAssetTransparentWindow> {
  return getSceneThemeAssetTransparentWindow(roomId, "panel", panelId);
}
