import type {
  InstalledRoomFeatureRecord,
  InstalledRoomRecord,
  RoomSceneTransparentWindowConfig,
} from "@shared/index.js";
import { getRoomRuntimeAssetSource } from "../../modules/rooms/room-runtime-url.js";
import type { SceneEditorAssetTargetDescriptor } from "../../scene-editor/scene-theme-asset-state.js";
import type { SceneAlphaWindowBounds } from "../../scene/alpha-window.js";

export function buildRoomSceneAssetTargets(options: {
  activeFeature: InstalledRoomFeatureRecord | null;
  getTransparentWindowBounds: (
    feature: InstalledRoomFeatureRecord
  ) => SceneAlphaWindowBounds | null;
  pageName: string;
}): SceneEditorAssetTargetDescriptor[] {
  const { activeFeature, getTransparentWindowBounds, pageName } = options;
  if (activeFeature?.scene === undefined) {
    return [];
  }

  return [
    {
      id: `feature-view:${activeFeature.id}`,
      roomId: pageName,
      label: `${activeFeature.name} View`,
      sourceHint: activeFeature.scene.view.backgroundPath,
      runtimeSrc: getRoomRuntimeAssetSource(activeFeature.scene.view.backgroundPath),
      hasSourceOverride: false,
      supportsTransparentWindow: true,
      transparentWindow: getTransparentWindowBounds(activeFeature),
    },
  ];
}

export function getFeatureIdFromSceneAssetTarget(targetId: string): string | null {
  const prefix = "feature-view:";
  if (!targetId.startsWith(prefix)) {
    return null;
  }

  const featureId = targetId.slice(prefix.length).trim();
  return featureId === "" ? null : featureId;
}

export function getSuggestedSceneAssetTargetId(
  activeFeature: InstalledRoomFeatureRecord | null
): string | null {
  if (activeFeature?.scene === undefined) {
    return null;
  }

  return `feature-view:${activeFeature.id}`;
}

export function toRoomSceneTransparentWindowConfig(
  bounds: SceneAlphaWindowBounds
): RoomSceneTransparentWindowConfig {
  return {
    leftPct: Number(((bounds.left / bounds.sourceWidth) * 100).toFixed(3)),
    topPct: Number(((bounds.top / bounds.sourceHeight) * 100).toFixed(3)),
    widthPct: Number((((bounds.right - bounds.left) / bounds.sourceWidth) * 100).toFixed(3)),
    heightPct: Number((((bounds.bottom - bounds.top) / bounds.sourceHeight) * 100).toFixed(3)),
  };
}

export function updateRoomFeatureTransparentWindow(
  room: InstalledRoomRecord,
  featureId: string,
  transparentWindow: RoomSceneTransparentWindowConfig | null
): InstalledRoomRecord {
  return {
    ...room,
    features: room.features.map((feature) => {
      if (feature.id !== featureId || feature.scene === undefined) {
        return feature;
      }

      const nextView = {
        id: feature.scene.view.id,
        backgroundPath: feature.scene.view.backgroundPath,
        ...(feature.scene.view.panelArtPath !== undefined
          ? { panelArtPath: feature.scene.view.panelArtPath }
          : {}),
        ...(transparentWindow !== null ? { transparentWindow } : {}),
      };

      return {
        ...feature,
        scene: {
          ...feature.scene,
          view: nextView,
        },
      };
    }),
  };
}
