import type { InstalledRoomRecord } from "@shared/index.js";
import { syncRoomPageSceneWindowControls } from "./scene-window-controls.js";

export function resolveRoomSceneWindowControlsVisibility(
  room: InstalledRoomRecord
): "scene-only" | "all-pages" | "hidden" {
  return room.scene?.chrome?.windowControlsVisibility ?? "scene-only";
}

export function resolveRoomSceneViewBackButtonVariant(
  room: InstalledRoomRecord
): "scene-back-layer" | "standard-button" {
  return room.scene?.chrome?.viewBackButtonVariant ?? "scene-back-layer";
}

export function syncRoomPageSceneChrome(page: HTMLElement, room: InstalledRoomRecord): void {
  syncRoomPageSceneWindowControls(page, room, resolveRoomSceneWindowControlsVisibility(room));
}
