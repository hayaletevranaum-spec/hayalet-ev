import { shellT } from "../../app/shell-i18n.js";
import type { SceneAlphaWindowBounds } from "../../scene/alpha-window.js";
import type { SceneLayoutConfig } from "../../scene/layout/index.js";
import type { SceneClickableThemeDefinition } from "../../scene/schema.js";
import {
  getSceneDebugRoomOptions,
  openSceneDebugRoom,
  type SceneDebugRuntimeSession,
  type SceneLayoutEditor,
  type SceneLayoutEditorSelection,
} from "../../scene-editor/index.js";
import type { SceneEditorAssetTargetDescriptor } from "../../scene-editor/scene-theme-asset-state.js";
import { setupRoomSceneDebugEditor } from "./scene-debug-runtime.js";

interface SetupRoomPageSceneDebugParams {
  activeRoomId: string;
  buildSceneAssetTargets: () => SceneEditorAssetTargetDescriptor[];
  clearSceneAssetTransparentWindow: (targetId: string) => void;
  detectSceneAssetTransparentWindow: (targetId: string) => Promise<void>;
  editor: SceneLayoutEditor | null;
  editorSelection: SceneLayoutEditorSelection;
  getSuggestedSceneAssetTargetId: () => string | null;
  isSceneDebugActive: () => boolean;
  page: HTMLElement;
  refreshSceneShell: () => void;
  roomHasScene: boolean;
  sceneClickableTheme: SceneClickableThemeDefinition;
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
}

export function setupRoomPageSceneDebug({
  activeRoomId,
  buildSceneAssetTargets,
  clearSceneAssetTransparentWindow,
  detectSceneAssetTransparentWindow,
  editor,
  editorSelection,
  getSuggestedSceneAssetTargetId,
  isSceneDebugActive,
  page,
  refreshSceneShell,
  roomHasScene,
  sceneClickableTheme,
  sceneDebugEnabled,
  sceneDebugSession,
  sceneLayout,
  setEditor,
  setEditorSelection,
  setSceneClickableTheme,
  setSceneLayout,
  updateSceneAssetTransparentWindow,
}: SetupRoomPageSceneDebugParams): SceneLayoutEditor | null {
  return setupRoomSceneDebugEditor({
    activeRoomId,
    clearSceneAssetTransparentWindow,
    copySceneClickableTheme: async (): Promise<void> => {
      await sceneDebugSession.copySceneClickableTheme();
    },
    copySceneLayout: async (): Promise<void> => {
      await sceneDebugSession.copySceneLayout();
    },
    detectSceneAssetTransparentWindow,
    editor,
    getRoomOptions: () => getSceneDebugRoomOptions(shellT),
    getSceneAssetTargets: (): SceneEditorAssetTargetDescriptor[] => buildSceneAssetTargets(),
    getSceneClickableTheme: (): SceneClickableThemeDefinition => sceneClickableTheme,
    getSceneLayout: (): SceneLayoutConfig => sceneLayout,
    getSelection: (): SceneLayoutEditorSelection => editorSelection,
    getSuggestedSceneAssetTargetId,
    isActive: isSceneDebugActive,
    navigateToRoom: (roomId): void => {
      openSceneDebugRoom(roomId);
    },
    page,
    refreshSceneShell,
    resetDraft: (): void => {
      setSceneLayout(sceneDebugSession.resetSceneLayoutDraft());
      setEditorSelection(null);
    },
    resetSceneClickableThemeDraft: (): void => {
      setSceneClickableTheme(sceneDebugSession.resetSceneClickableThemeDraft());
    },
    roomHasScene,
    saveSceneAssetDraftToSource: async (): Promise<void> => {
      await sceneDebugSession.saveSceneLayoutToSource();
    },
    saveSceneClickableThemeToSource: async (): Promise<void> => {
      await sceneDebugSession.saveSceneClickableThemeToSource();
    },
    saveSceneLayoutToSource: async (): Promise<void> => {
      await sceneDebugSession.saveSceneLayoutToSource();
    },
    sceneDebugEnabled,
    setEditor,
    setSelection: setEditorSelection,
    updateBack: (id, updater): void => {
      setSceneLayout(sceneDebugSession.updateBack(id, updater));
    },
    updateObject: (id, updater): void => {
      setSceneLayout(sceneDebugSession.updateObject(id, updater));
    },
    updateSceneAssetTransparentWindow,
    updateSceneClickableTheme: (updater): void => {
      setSceneClickableTheme(sceneDebugSession.updateSceneClickableTheme(updater));
    },
  });
}
