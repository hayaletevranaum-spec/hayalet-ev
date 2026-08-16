import { isSceneUiMode } from "../../ui/ui-mode.js";
import type { InstalledRoomFeatureRecord, InstalledRoomRecord } from "@shared/index.js";
import type {
  SceneDebugRuntimeSession,
  SceneLayoutEditor,
  SceneLayoutEditorSelection,
} from "../../scene-editor/index.js";
import type { SceneClickableThemeDefinition } from "../../scene/schema.js";
import type { SceneLayoutConfig } from "../../scene/layout/index.js";
import type { SceneEditorAssetTargetDescriptor } from "../../scene-editor/scene-theme-asset-state.js";
import type { SceneAlphaWindowBounds } from "../../scene/alpha-window.js";
import { setupRoomPageSceneDebug } from "./scene-debug-composition.js";
import { syncRoomPageView } from "./page-view-runtime.js";

interface RoomPageSceneRuntimeDeps {
  buildSceneAssetTargets: () => SceneEditorAssetTargetDescriptor[];
  clearSceneAssetTransparentWindow: (targetId: string) => void;
  detectSceneAssetTransparentWindow: (targetId: string) => Promise<void>;
  getActiveFeature: () => InstalledRoomFeatureRecord | null;
  getEditor: () => SceneLayoutEditor | null;
  getEditorSelection: () => SceneLayoutEditorSelection;
  getRoom: () => InstalledRoomRecord;
  getSceneClickableTheme: () => SceneClickableThemeDefinition;
  getSceneFeature: () => InstalledRoomFeatureRecord | null;
  getSceneReferenceSize: () => { width: number; height: number };
  getSuggestedSceneAssetTargetId: () => string | null;
  isSceneDebugActive: () => boolean;
  isSceneFeatureOpen: () => boolean;
  renderSceneRoomCharacters: (page: HTMLElement) => Promise<void>;
  setActiveFeature: (featureId: string, reason: string) => void;
  closeSceneFeatureView: () => void;
  refreshEditor: () => void;
  refreshSceneCharacters: () => void;
  refreshSceneShell: () => void;
  sceneDebugEnabled: boolean;
  sceneDebugSession: SceneDebugRuntimeSession;
  sceneLayout: SceneLayoutConfig;
  setEditor: (editor: SceneLayoutEditor | null) => void;
  setEditorSelection: (selection: SceneLayoutEditorSelection) => void;
  setSceneClickableTheme: (sceneClickableTheme: SceneClickableThemeDefinition) => void;
  setSceneLayout: (sceneLayout: SceneLayoutConfig) => void;
  updateSceneAssetTransparentWindow: (
    targetId: string,
    nextBounds: SceneAlphaWindowBounds | null
  ) => void;
  usesImmersivePageShell: () => boolean;
}

interface RoomPageSceneRuntime {
  refreshSceneCharacters: () => void;
  setupSceneDebug: (page: HTMLElement) => SceneLayoutEditor | null;
  syncPageView: (page: HTMLElement) => void;
}

export function createRoomPageSceneRuntime(deps: RoomPageSceneRuntimeDeps): RoomPageSceneRuntime {
  function syncPageView(page: HTMLElement): void {
    syncRoomPageView({
      activeFeatureId: deps.getActiveFeature()?.id ?? null,
      immersive: deps.usesImmersivePageShell(),
      onActivateSceneFeature: (featureId) => {
        deps.setActiveFeature(featureId, "scene-hotspot");
      },
      onCloseFeatureView: () => {
        deps.closeSceneFeatureView();
      },
      onSelectFeature: (featureId) => {
        deps.setActiveFeature(featureId, "feature-button");
      },
      page,
      referenceSize: deps.getSceneReferenceSize(),
      refreshEditor: () => {
        deps.refreshEditor();
      },
      renderSceneCharacters: async (currentPage) => {
        await deps.renderSceneRoomCharacters(currentPage);
      },
      room: deps.getRoom(),
      sceneClickableTheme: deps.getSceneClickableTheme(),
      sceneDebugEnabled: deps.sceneDebugEnabled,
      sceneEnabled: isSceneUiMode() && deps.getRoom().scene !== undefined,
      sceneFeature: deps.getSceneFeature(),
    });
  }

  function setupSceneDebug(page: HTMLElement): SceneLayoutEditor | null {
    return setupRoomPageSceneDebug({
      activeRoomId: deps.getRoom().id,
      buildSceneAssetTargets: (): SceneEditorAssetTargetDescriptor[] =>
        deps.buildSceneAssetTargets(),
      clearSceneAssetTransparentWindow: (targetId): void => {
        deps.clearSceneAssetTransparentWindow(targetId);
      },
      detectSceneAssetTransparentWindow: async (targetId): Promise<void> => {
        await deps.detectSceneAssetTransparentWindow(targetId);
      },
      editor: deps.getEditor(),
      editorSelection: deps.getEditorSelection(),
      getSuggestedSceneAssetTargetId: (): string | null => deps.getSuggestedSceneAssetTargetId(),
      isSceneDebugActive: (): boolean => deps.isSceneDebugActive(),
      page,
      refreshSceneShell: (): void => {
        deps.refreshSceneShell();
      },
      roomHasScene: deps.getRoom().scene !== undefined,
      sceneClickableTheme: deps.getSceneClickableTheme(),
      sceneDebugEnabled: deps.sceneDebugEnabled,
      sceneDebugSession: deps.sceneDebugSession,
      sceneLayout: deps.sceneLayout,
      setEditor: (editor): void => {
        deps.setEditor(editor);
      },
      setEditorSelection: (selection): void => {
        deps.setEditorSelection(selection);
      },
      setSceneClickableTheme: (sceneClickableTheme): void => {
        deps.setSceneClickableTheme(sceneClickableTheme);
      },
      setSceneLayout: (sceneLayout): void => {
        deps.setSceneLayout(sceneLayout);
      },
      updateSceneAssetTransparentWindow: (
        targetId: string,
        nextBounds: SceneAlphaWindowBounds | null
      ): void => {
        deps.updateSceneAssetTransparentWindow(targetId, nextBounds);
      },
    });
  }

  function refreshSceneCharacters(): void {
    deps.refreshSceneCharacters();
  }

  return {
    refreshSceneCharacters,
    setupSceneDebug,
    syncPageView,
  };
}
