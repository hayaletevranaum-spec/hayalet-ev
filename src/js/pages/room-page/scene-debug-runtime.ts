import type { SceneAlphaWindowBounds } from "../../scene/alpha-window.js";
import type {
  SceneBackConfig,
  SceneLayoutConfig,
  SceneObjectConfig,
} from "../../scene/layout/index.js";
import type { SceneClickableThemeDefinition } from "../../scene/schema.js";
import {
  SceneLayoutEditor,
  type SceneLayoutEditorRoomOption,
  type SceneLayoutEditorSelection,
} from "../../scene-editor/index.js";
import type { SceneEditorAssetTargetDescriptor } from "../../scene-editor/scene-theme-asset-state.js";

interface CreateRoomSceneEditorCallbacksParams {
  isActive: () => boolean;
  getSceneLayout: () => SceneLayoutConfig;
  getSceneClickableTheme: () => SceneClickableThemeDefinition;
  getSelection: () => SceneLayoutEditorSelection;
  getRoomOptions: () => SceneLayoutEditorRoomOption[];
  getActiveRoomId: () => string;
  setSelection: (selection: SceneLayoutEditorSelection) => void;
  navigateToRoom: (roomId: string) => void;
  updateObject: (id: string, updater: (node: SceneObjectConfig) => SceneObjectConfig) => void;
  updateBack: (id: string, updater: (node: SceneBackConfig) => SceneBackConfig) => void;
  resetDraft: () => void;
  copySceneLayout: () => Promise<void>;
  saveSceneLayoutToSource: () => Promise<void>;
  updateSceneClickableTheme: (
    updater: (theme: SceneClickableThemeDefinition) => SceneClickableThemeDefinition
  ) => void;
  resetSceneClickableThemeDraft: () => void;
  copySceneClickableTheme: () => Promise<void>;
  saveSceneClickableThemeToSource: () => Promise<void>;
  getSceneAssetTargets: () => SceneEditorAssetTargetDescriptor[];
  getSuggestedSceneAssetTargetId: () => string | null;
  saveSceneAssetDraftToSource: () => Promise<void>;
  detectSceneAssetTransparentWindow: (targetId: string) => Promise<void>;
  clearSceneAssetTransparentWindow: (targetId: string) => void;
  updateSceneAssetTransparentWindow: (
    targetId: string,
    nextBounds: SceneAlphaWindowBounds | null
  ) => void;
  refreshEditor: () => void;
  refreshSceneShell: () => void;
}

interface SetupRoomSceneDebugEditorParams extends Omit<
  CreateRoomSceneEditorCallbacksParams,
  "getActiveRoomId" | "refreshEditor"
> {
  activeRoomId: string;
  editor: SceneLayoutEditor | null;
  isActive: () => boolean;
  page: HTMLElement;
  roomHasScene: boolean;
  sceneDebugEnabled: boolean;
  setEditor: (editor: SceneLayoutEditor | null) => void;
}

export function createRoomSceneEditorCallbacks({
  copySceneClickableTheme,
  copySceneLayout,
  detectSceneAssetTransparentWindow,
  getActiveRoomId,
  getRoomOptions,
  getSceneAssetTargets,
  getSceneClickableTheme,
  getSceneLayout,
  getSelection,
  getSuggestedSceneAssetTargetId,
  navigateToRoom,
  refreshEditor,
  refreshSceneShell,
  resetDraft,
  resetSceneClickableThemeDraft,
  saveSceneAssetDraftToSource,
  saveSceneClickableThemeToSource,
  saveSceneLayoutToSource,
  setSelection,
  updateBack,
  updateObject,
  updateSceneAssetTransparentWindow,
  updateSceneClickableTheme,
  clearSceneAssetTransparentWindow,
  isActive,
}: CreateRoomSceneEditorCallbacksParams): ConstructorParameters<typeof SceneLayoutEditor>[1] {
  return {
    isActive,
    getSceneLayout,
    getSceneClickableTheme,
    getSelection,
    getRoomOptions,
    getActiveRoomId,
    setSelection: (selection): void => {
      setSelection(selection);
      refreshEditor();
      refreshSceneShell();
    },
    navigateToRoom,
    updateObject: (id, updater): void => {
      updateObject(id, updater);
      refreshSceneShell();
      refreshEditor();
    },
    updateBack: (id, updater): void => {
      updateBack(id, updater);
      refreshSceneShell();
      refreshEditor();
    },
    updateCharacter: (): void => {
      return;
    },
    resetDraft: (): void => {
      resetDraft();
      refreshSceneShell();
      refreshEditor();
    },
    copySceneLayout,
    saveSceneLayoutToSource,
    updateSceneClickableTheme: (updater): void => {
      updateSceneClickableTheme(updater);
      refreshSceneShell();
      refreshEditor();
    },
    resetSceneClickableThemeDraft: (): void => {
      resetSceneClickableThemeDraft();
      refreshSceneShell();
      refreshEditor();
    },
    copySceneClickableTheme,
    saveSceneClickableThemeToSource,
    getSceneAssetTargets,
    getSuggestedSceneAssetTargetId,
    saveSceneAssetDraftToSource,
    detectSceneAssetTransparentWindow,
    clearSceneAssetTransparentWindow,
    updateSceneAssetTransparentWindow,
  };
}

export function setupRoomSceneDebugEditor({
  activeRoomId,
  clearSceneAssetTransparentWindow,
  copySceneClickableTheme,
  copySceneLayout,
  detectSceneAssetTransparentWindow,
  editor,
  isActive,
  getRoomOptions,
  getSceneAssetTargets,
  getSceneClickableTheme,
  getSceneLayout,
  getSelection,
  getSuggestedSceneAssetTargetId,
  navigateToRoom,
  page,
  refreshSceneShell,
  resetDraft,
  resetSceneClickableThemeDraft,
  roomHasScene,
  saveSceneAssetDraftToSource,
  saveSceneClickableThemeToSource,
  saveSceneLayoutToSource,
  sceneDebugEnabled,
  setEditor,
  setSelection,
  updateBack,
  updateObject,
  updateSceneAssetTransparentWindow,
  updateSceneClickableTheme,
}: SetupRoomSceneDebugEditorParams): SceneLayoutEditor | null {
  const editorHost = page.querySelector<HTMLElement>("[data-room-role='scene-editor-host']");
  if (editorHost === null) {
    setEditor(null);
    return null;
  }

  if (!sceneDebugEnabled || !roomHasScene) {
    editorHost.replaceChildren();
    setEditor(null);
    return null;
  }

  if (editor !== null) {
    editor.refresh();
    return editor;
  }

  let nextEditor: SceneLayoutEditor | null = null;
  nextEditor = new SceneLayoutEditor(
    editorHost,
    createRoomSceneEditorCallbacks({
      isActive,
      getSceneLayout,
      getSceneClickableTheme,
      getSelection,
      getRoomOptions,
      getActiveRoomId: () => activeRoomId,
      setSelection,
      navigateToRoom,
      updateObject,
      updateBack,
      resetDraft,
      copySceneLayout,
      saveSceneLayoutToSource,
      updateSceneClickableTheme,
      resetSceneClickableThemeDraft,
      copySceneClickableTheme,
      saveSceneClickableThemeToSource,
      getSceneAssetTargets,
      getSuggestedSceneAssetTargetId,
      saveSceneAssetDraftToSource,
      detectSceneAssetTransparentWindow,
      clearSceneAssetTransparentWindow,
      updateSceneAssetTransparentWindow,
      refreshEditor: () => {
        nextEditor?.refresh();
      },
      refreshSceneShell,
    })
  );
  setEditor(nextEditor);
  nextEditor.refresh();
  return nextEditor;
}
