import type {
  InstalledRoomFeatureRecord,
  RoomSceneTransparentWindowConfig,
} from "@shared/index.js";
import type { SceneAlphaWindowBounds } from "../../scene/alpha-window.js";
import { toRoomSceneTransparentWindowConfig } from "./scene-assets.js";

export function getRoomSceneViewBackgroundImage(page: HTMLElement | null): HTMLImageElement | null {
  return page?.querySelector<HTMLImageElement>("[data-room-role='scene-view-background']") ?? null;
}

export function getRoomSceneTransparentWindowBounds(
  page: HTMLElement | null,
  feature: InstalledRoomFeatureRecord
): SceneAlphaWindowBounds | null {
  const transparentWindow = feature.scene?.view.transparentWindow;
  if (transparentWindow === undefined) {
    return null;
  }

  const image = getRoomSceneViewBackgroundImage(page);
  const sourceWidth = image?.naturalWidth ?? 0;
  const sourceHeight = image?.naturalHeight ?? 0;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  return {
    sourceWidth,
    sourceHeight,
    left: (transparentWindow.leftPct / 100) * sourceWidth,
    top: (transparentWindow.topPct / 100) * sourceHeight,
    right: ((transparentWindow.leftPct + transparentWindow.widthPct) / 100) * sourceWidth,
    bottom: ((transparentWindow.topPct + transparentWindow.heightPct) / 100) * sourceHeight,
  };
}

export function toRoomPageTransparentWindowConfig(
  bounds: SceneAlphaWindowBounds
): RoomSceneTransparentWindowConfig {
  return toRoomSceneTransparentWindowConfig(bounds);
}
