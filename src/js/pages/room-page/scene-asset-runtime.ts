import type {
  InstalledRoomFeatureRecord,
  InstalledRoomRecord,
  RoomSceneTransparentWindowConfig,
} from "@shared/index.js";
import type { SceneAlphaWindowBounds } from "../../scene/alpha-window.js";
import type { SceneEditorAssetTargetDescriptor } from "../../scene-editor/scene-theme-asset-state.js";
import { detectSceneAlphaWindowBounds } from "../../scene/alpha-window.js";
import { isSceneUiMode } from "../../ui/ui-mode.js";
import { resolveRoomRuntimeAssetSource } from "../../modules/rooms/room-runtime-url.js";
import {
  getRoomSceneTransparentWindowBounds,
  toRoomPageTransparentWindowConfig,
} from "./scene-alpha-window.js";
import {
  buildRoomSceneAssetTargets,
  getFeatureIdFromSceneAssetTarget,
  getSuggestedSceneAssetTargetId,
  updateRoomFeatureTransparentWindow,
} from "./scene-assets.js";

interface CreateRoomPageSceneAssetRuntimeParams {
  getPageName: () => string;
  getPage: () => HTMLElement | null;
  getRoom: () => InstalledRoomRecord;
  setRoom: (room: InstalledRoomRecord) => void;
  getActiveFeature: () => InstalledRoomFeatureRecord | null;
  refreshSceneShell: () => void;
  refreshEditor: () => void;
  renderSceneRoomCharacters: (page: HTMLElement) => Promise<void>;
}

interface RoomPageSceneAssetRuntime {
  buildSceneAssetTargets: () => SceneEditorAssetTargetDescriptor[];
  clearSceneAssetTransparentWindow: (targetId: string) => void;
  detectSceneAssetTransparentWindow: (targetId: string) => Promise<void>;
  getSuggestedSceneAssetTargetId: () => string | null;
  refreshSceneCharacters: () => void;
  updateSceneAssetTransparentWindow: (
    targetId: string,
    nextBounds: SceneAlphaWindowBounds | null
  ) => void;
}

export function createRoomPageSceneAssetRuntime({
  getActiveFeature,
  getPage,
  getPageName,
  getRoom,
  refreshEditor,
  refreshSceneShell,
  renderSceneRoomCharacters,
  setRoom,
}: CreateRoomPageSceneAssetRuntimeParams): RoomPageSceneAssetRuntime {
  function getActiveSceneAssetTransparentWindowBounds(
    feature: InstalledRoomFeatureRecord
  ): SceneAlphaWindowBounds | null {
    return getRoomSceneTransparentWindowBounds(getPage(), feature);
  }

  function buildSceneAssetTargets(): SceneEditorAssetTargetDescriptor[] {
    return buildRoomSceneAssetTargets({
      activeFeature: getActiveFeature(),
      getTransparentWindowBounds: (feature) => getActiveSceneAssetTransparentWindowBounds(feature),
      pageName: getPageName(),
    });
  }

  function getSuggestedSceneAssetTargetIdForPage(): string | null {
    return getSuggestedSceneAssetTargetId(getActiveFeature());
  }

  function toTransparentWindowConfig(
    bounds: SceneAlphaWindowBounds
  ): RoomSceneTransparentWindowConfig {
    return toRoomPageTransparentWindowConfig(bounds);
  }

  function updateSceneAssetTransparentWindow(
    targetId: string,
    nextBounds: SceneAlphaWindowBounds | null
  ): void {
    const featureId = getFeatureIdFromSceneAssetTarget(targetId);
    if (featureId === null) {
      return;
    }

    const room = getRoom();
    setRoom(
      updateRoomFeatureTransparentWindow(
        room,
        featureId,
        nextBounds !== null ? toTransparentWindowConfig(nextBounds) : null
      )
    );

    refreshSceneShell();
    refreshEditor();
  }

  async function detectSceneAssetTransparentWindow(targetId: string): Promise<void> {
    const featureId = getFeatureIdFromSceneAssetTarget(targetId);
    const room = getRoom();
    const feature =
      featureId === null ? null : (room.features.find((item) => item.id === featureId) ?? null);
    if (feature?.scene === undefined) {
      return;
    }

    const runtimeSrc = await resolveRoomRuntimeAssetSource(feature.scene.view.backgroundPath);
    if (runtimeSrc === "") {
      return;
    }

    const bounds = await detectSceneAlphaWindowBounds(runtimeSrc, 24);
    updateSceneAssetTransparentWindow(targetId, bounds);
  }

  function clearSceneAssetTransparentWindow(targetId: string): void {
    updateSceneAssetTransparentWindow(targetId, null);
  }

  function refreshSceneCharacters(): void {
    const page = getPage();
    const room = getRoom();
    if (page === null || !isSceneUiMode() || room.scene === undefined) {
      return;
    }

    void renderSceneRoomCharacters(page);
  }

  return {
    buildSceneAssetTargets,
    clearSceneAssetTransparentWindow,
    detectSceneAssetTransparentWindow,
    getSuggestedSceneAssetTargetId: getSuggestedSceneAssetTargetIdForPage,
    refreshSceneCharacters,
    updateSceneAssetTransparentWindow,
  };
}
