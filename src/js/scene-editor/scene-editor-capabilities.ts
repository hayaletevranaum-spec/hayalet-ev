import type { SceneEditorAssetTargetDescriptor } from "./scene-theme-asset-state.js";
import type { SceneAlphaWindowBounds } from "../scene/alpha-window.js";

import { sceneTransparentWindowCapability } from "./capabilities/scene-transparent-window-capability.js";

export interface SceneLayoutEditorCapabilityContext {
  assetTargets: SceneEditorAssetTargetDescriptor[];
  activeAssetTarget: SceneEditorAssetTargetDescriptor | null;
  callbacks: {
    detectSceneAssetTransparentWindow?(targetId: string): Promise<void>;
    clearSceneAssetTransparentWindow?(targetId: string): void;
    updateSceneAssetTransparentWindow?(
      targetId: string,
      nextBounds: SceneAlphaWindowBounds | null
    ): void;
  };
}

export interface SceneLayoutEditorCapability {
  id: string;
  render(context: SceneLayoutEditorCapabilityContext): string | null;
  handleAction?(context: SceneLayoutEditorCapabilityContext, target: HTMLElement): boolean;
  handleChange?(context: SceneLayoutEditorCapabilityContext, target: HTMLInputElement): boolean;
}

export const SCENE_LAYOUT_EDITOR_CAPABILITIES: readonly SceneLayoutEditorCapability[] = [
  sceneTransparentWindowCapability,
];
