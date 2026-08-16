import type { SceneLayoutConfig, SceneDebugNodeSelection } from "../scene/layout/index.js";
import type { SceneRoomId } from "../scene/schema.js";
import type { SceneAlphaWindowBounds } from "../scene/alpha-window.js";

import {
  clearSceneEditorAssetTargetSource,
  clearSceneEditorTransparentWindow,
  detectSceneEditorTransparentWindow,
  listSceneEditorAssetTargets,
  pickSceneEditorAssetTarget,
  resetSceneThemeAssetDraft,
  resolveSuggestedSceneEditorAssetTargetId,
  saveSceneThemeAssetDraftToSource,
  updateSceneEditorTransparentWindow,
  type SceneEditorAssetTargetDescriptor,
} from "./scene-theme-asset-state.js";

export interface SceneLayoutEditorAssetBindingCallbacks {
  getSceneAssetTargets(): SceneEditorAssetTargetDescriptor[];
  getSuggestedSceneAssetTargetId(): string | null;
  pickSceneAsset(targetId: string): Promise<void>;
  clearSceneAsset(targetId: string): void;
  resetSceneAssetDraft(): void;
  saveSceneAssetDraftToSource(): Promise<void>;
  detectSceneAssetTransparentWindow(targetId: string): Promise<void>;
  clearSceneAssetTransparentWindow(targetId: string): void;
  updateSceneAssetTransparentWindow(
    targetId: string,
    nextBounds: SceneAlphaWindowBounds | null
  ): void;
}

export function createSceneLayoutEditorAssetBindings(options: {
  roomId: SceneRoomId;
  getSceneLayout: () => SceneLayoutConfig;
  getSelection: () => SceneDebugNodeSelection;
  onAfterChange: () => void;
}): SceneLayoutEditorAssetBindingCallbacks {
  const { roomId, getSceneLayout, getSelection, onAfterChange } = options;

  return {
    getSceneAssetTargets(): SceneEditorAssetTargetDescriptor[] {
      return listSceneEditorAssetTargets(roomId);
    },
    getSuggestedSceneAssetTargetId(): string | null {
      return resolveSuggestedSceneEditorAssetTargetId(roomId, getSceneLayout(), getSelection());
    },
    async pickSceneAsset(targetId: string): Promise<void> {
      const changed = await pickSceneEditorAssetTarget(targetId);
      if (changed) {
        onAfterChange();
      }
    },
    clearSceneAsset(targetId: string): void {
      clearSceneEditorAssetTargetSource(targetId);
      onAfterChange();
    },
    resetSceneAssetDraft(): void {
      resetSceneThemeAssetDraft();
      onAfterChange();
    },
    async saveSceneAssetDraftToSource(): Promise<void> {
      const saved = await saveSceneThemeAssetDraftToSource();
      if (saved) {
        onAfterChange();
      }
    },
    async detectSceneAssetTransparentWindow(targetId: string): Promise<void> {
      const changed = await detectSceneEditorTransparentWindow(targetId);
      if (changed) {
        onAfterChange();
      }
    },
    clearSceneAssetTransparentWindow(targetId: string): void {
      clearSceneEditorTransparentWindow(targetId);
      onAfterChange();
    },
    updateSceneAssetTransparentWindow(
      targetId: string,
      nextBounds: SceneAlphaWindowBounds | null
    ): void {
      updateSceneEditorTransparentWindow(targetId, nextBounds);
      onAfterChange();
    },
  };
}
