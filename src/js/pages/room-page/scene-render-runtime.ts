import type { InstalledRoomFeatureRecord } from "@shared/index.js";
import {
  getRoomRuntimeAssetSource,
  resolveRoomRuntimeAssetSource,
} from "../../modules/rooms/room-runtime-url.js";
import {
  getCoverSceneProjectionFromElement,
  type SceneProjection,
} from "../../scene/projection.js";
import { DEFAULT_SCENE_TRANSPARENT_WINDOW } from "./scene-helpers.js";

export function applyRoomSceneRuntimeFrame(
  runtimeSlot: HTMLElement,
  feature: InstalledRoomFeatureRecord
): void {
  const frame = feature.scene?.view.transparentWindow ?? DEFAULT_SCENE_TRANSPARENT_WINDOW;
  runtimeSlot.style.left = `${frame.leftPct}%`;
  runtimeSlot.style.top = `${frame.topPct}%`;
  runtimeSlot.style.width = `${frame.widthPct}%`;
  runtimeSlot.style.height = `${frame.heightPct}%`;
}

export function applyRoomSceneImageSource(options: {
  image: HTMLImageElement;
  sourcePath: string;
  refreshEditor?: boolean;
  onRefreshEditor?: () => void;
}): void {
  const { image, onRefreshEditor, refreshEditor = false, sourcePath } = options;
  const source = sourcePath.trim();
  image.dataset["roomAssetSourcePath"] = source;

  const immediateSource = getRoomRuntimeAssetSource(source);
  if (immediateSource !== "") {
    image.src = immediateSource;
  } else {
    image.removeAttribute("src");
  }

  if (source === "") {
    return;
  }

  void resolveRoomRuntimeAssetSource(source).then((resolvedSource) => {
    if (!image.isConnected) {
      return;
    }
    if ((image.dataset["roomAssetSourcePath"] ?? "") !== source) {
      return;
    }
    if (resolvedSource === "") {
      image.removeAttribute("src");
      return;
    }

    image.src = resolvedSource;
    if (refreshEditor === true && immediateSource === "") {
      onRefreshEditor?.();
    }
  });
}

export function getRoomSceneProjection(
  host: HTMLElement | null,
  referenceSize: { width: number; height: number }
): SceneProjection {
  return getCoverSceneProjectionFromElement(host, referenceSize);
}

export function getRoomSceneDepthScale(depth: number): number {
  const safeDepth = Number.isFinite(depth) ? depth : 1;
  const normalizedDepth = Math.max(1, safeDepth);
  const scaled = 1 - (normalizedDepth - 1) * 0.02;
  return Number(Math.max(0.75, scaled).toFixed(3));
}
