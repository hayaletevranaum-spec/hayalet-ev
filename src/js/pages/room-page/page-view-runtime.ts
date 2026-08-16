import type { InstalledRoomFeatureRecord, InstalledRoomRecord } from "@shared/index.js";
import { shellT } from "../../app/shell-i18n.js";
import { navigateToScenePage } from "../../scene/navigation.js";
import type { SceneClickableThemeDefinition } from "../../scene/schema.js";
import { roomPageT } from "./page-text-runtime.js";
import {
  getRoomPageClassicShell,
  getRoomPageSceneRoot,
  getRoomPageSceneRoom,
  getRoomPageSceneRuntimeSlot,
  getRoomPageSceneView,
} from "./page-dom.js";
import {
  ensureRoomPageFeatureShell,
  renderRoomPageFeatureStrip,
  shouldShowRoomPageFeatureStripForRoom,
} from "./page-shell-runtime.js";
import {
  ensureRoomSceneStandardBackHost,
  getRoomSceneStandardBackHost,
} from "./scene-window-controls.js";
import { resolveRoomSceneViewBackButtonVariant } from "./scene-chrome-runtime.js";
import { syncRoomPageScene } from "./scene-sync-runtime.js";

interface SyncRoomPageViewParams {
  activeFeatureId: string | null;
  immersive: boolean;
  onActivateSceneFeature: (featureId: string) => void;
  onCloseFeatureView: () => void;
  onSelectFeature: (featureId: string) => void;
  page: HTMLElement;
  referenceSize: { width: number; height: number };
  refreshEditor: () => void;
  renderSceneCharacters: (page: HTMLElement) => Promise<void>;
  room: InstalledRoomRecord;
  sceneClickableTheme: SceneClickableThemeDefinition;
  sceneDebugEnabled: boolean;
  sceneFeature: InstalledRoomFeatureRecord | null;
  sceneEnabled: boolean;
}

export function syncRoomPageView({
  activeFeatureId,
  immersive,
  onActivateSceneFeature,
  onCloseFeatureView,
  onSelectFeature,
  page,
  referenceSize,
  refreshEditor,
  renderSceneCharacters,
  room,
  sceneClickableTheme,
  sceneDebugEnabled,
  sceneFeature,
  sceneEnabled,
}: SyncRoomPageViewParams): void {
  ensureRoomPageFeatureShell({
    immersive,
    onSelectFeature,
    page,
    room,
  });

  renderRoomPageFeatureStrip({
    activeFeatureId,
    page,
    room,
    showFeatureStrip: shouldShowRoomPageFeatureStripForRoom(immersive, room),
  });

  syncRoomPageScene({
    backButtonVariant: resolveRoomSceneViewBackButtonVariant(room),
    backToRoomsLabel: roomPageT("page.backToRooms"),
    closeLabel: shellT("settingsHub.scene.returnRoom"),
    ensureSceneStandardBackHost: (currentPage, view) =>
      ensureRoomSceneStandardBackHost(currentPage, view, document),
    getClassicShell: getRoomPageClassicShell,
    getSceneRoot: getRoomPageSceneRoot,
    getSceneRoom: getRoomPageSceneRoom,
    getSceneRuntimeSlot: getRoomPageSceneRuntimeSlot,
    getSceneStandardBackHost: getRoomSceneStandardBackHost,
    getSceneView: getRoomPageSceneView,
    onActivateFeature: onActivateSceneFeature,
    onBackToRooms: () => {
      navigateToScenePage("rooms");
    },
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
  });
}
