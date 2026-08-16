import type { InstalledRoomFeatureRecord, InstalledRoomRecord } from "@shared/index.js";
import { syncSceneViewRuntime } from "../../scene/runtime.js";
import type { SceneClickableThemeDefinition } from "../../scene/schema.js";
import { applyRoomSceneImageSource } from "./scene-render-runtime.js";
import {
  renderRoomSceneBack,
  renderRoomSceneHotspots,
  renderRoomSceneView,
} from "./scene-presentation.js";

interface SyncRoomPageSceneParams {
  backButtonVariant: "scene-back-layer" | "standard-button";
  backToRoomsLabel: string;
  closeLabel: string;
  getClassicShell: (page: HTMLElement) => HTMLElement | null;
  getSceneRoot: (page: HTMLElement) => HTMLElement | null;
  getSceneRoom: (page: HTMLElement) => HTMLElement | null;
  getSceneRuntimeSlot: (page: HTMLElement) => HTMLElement | null;
  getSceneStandardBackHost: (page: HTMLElement) => HTMLElement | null;
  getSceneView: (page: HTMLElement) => HTMLElement | null;
  ensureSceneStandardBackHost: (page: HTMLElement, view: HTMLElement) => HTMLElement;
  onActivateFeature: (featureId: string) => void;
  onBackToRooms: () => void;
  onCloseFeatureView: () => void;
  page: HTMLElement;
  referenceSize: { width: number; height: number };
  refreshEditor: () => void;
  renderSceneCharacters: (page: HTMLElement) => Promise<void>;
  room: InstalledRoomRecord;
  sceneClickableTheme: SceneClickableThemeDefinition;
  sceneDebugEnabled: boolean;
  sceneEnabled: boolean;
  sceneFeature: InstalledRoomFeatureRecord | null;
}

export function syncRoomPageScene({
  backButtonVariant,
  backToRoomsLabel,
  closeLabel,
  ensureSceneStandardBackHost,
  getClassicShell,
  getSceneRoot,
  getSceneRoom,
  getSceneRuntimeSlot,
  getSceneStandardBackHost,
  getSceneView,
  onActivateFeature,
  onBackToRooms,
  onCloseFeatureView,
  page,
  referenceSize,
  refreshEditor,
  renderSceneCharacters,
  room,
  sceneClickableTheme,
  sceneDebugEnabled,
  sceneEnabled,
  sceneFeature,
}: SyncRoomPageSceneParams): void {
  const sceneRoot = getSceneRoot(page);
  const sceneRoom = getSceneRoom(page);
  const sceneView = getSceneView(page);
  const classicShell = getClassicShell(page);
  const viewOpen = sceneEnabled && sceneFeature?.scene !== undefined;

  syncSceneViewRuntime({
    elements: {
      root: sceneRoot,
      view: sceneView,
      room: sceneRoom,
      classicLayout: classicShell,
      viewSlot: getSceneRuntimeSlot(page),
    },
    state: {
      sceneActive: sceneEnabled,
      viewOpen,
      roomOpenClass: "is-scene-feature-open",
    },
  });

  if (!sceneEnabled || room.scene === undefined) {
    return;
  }

  const roomBackground = page.querySelector<HTMLImageElement>(
    "[data-room-role='scene-room-background']"
  );
  if (roomBackground !== null) {
    applyRoomSceneImageSource({
      image: roomBackground,
      sourcePath: room.scene.roomBackgroundPath,
    });
    roomBackground.alt = "";
  }

  renderRoomSceneHotspots({
    page,
    referenceSize,
    room,
    sceneClickableTheme,
    onActivateFeature,
  });
  void renderSceneCharacters(page);
  renderRoomSceneBack({
    backToRoomsLabel,
    onBackToRooms,
    page,
    referenceSize,
    room,
    sceneClickableTheme,
  });

  if (sceneFeature === null) {
    return;
  }

  renderRoomSceneView({
    backButtonVariant,
    closeLabel,
    ensureStandardBackHost: ensureSceneStandardBackHost,
    feature: sceneFeature,
    getStandardBackHost: getSceneStandardBackHost,
    onCloseFeatureView,
    page,
    referenceSize,
    room,
    sceneClickableTheme,
    sceneDebugEnabled,
    refreshEditor,
  });
}
