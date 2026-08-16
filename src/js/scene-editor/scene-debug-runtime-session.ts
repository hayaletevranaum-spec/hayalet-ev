import type {
  SceneBackConfig,
  SceneCharacterPlacementConfig,
  SceneLayoutConfig,
  SceneObjectConfig,
} from "../scene/layout/index.js";
import type { SceneClickableThemeDefinition, SceneDebugEditableRoomId } from "../scene/schema.js";

import {
  createSceneDebugStore,
  createSceneDebugThemeStore,
  type SceneDebugStore,
  type SceneDebugThemeStore,
} from "./scene-editor-store.js";

export interface SceneDebugRuntimeSession {
  roomId: SceneDebugEditableRoomId;
  load(debugEnabled: boolean): void;
  reloadFromActiveTheme(debugEnabled: boolean): void;
  getSceneLayout(): SceneLayoutConfig;
  setSceneLayout(sceneLayout: SceneLayoutConfig): void;
  updateObject(
    id: string,
    updater: (node: SceneObjectConfig) => SceneObjectConfig
  ): SceneLayoutConfig;
  updateBack(id: string, updater: (node: SceneBackConfig) => SceneBackConfig): SceneLayoutConfig;
  updateCharacter(
    id: string,
    updater: (node: SceneCharacterPlacementConfig) => SceneCharacterPlacementConfig
  ): SceneLayoutConfig;
  saveSceneLayoutDraft(): void;
  resetSceneLayoutDraft(): SceneLayoutConfig;
  copySceneLayout(): Promise<void>;
  saveSceneLayoutToSource(): Promise<boolean>;
  getSceneClickableTheme(): SceneClickableThemeDefinition;
  setSceneClickableTheme(sceneClickableTheme: SceneClickableThemeDefinition): void;
  updateSceneClickableTheme(
    updater: (theme: SceneClickableThemeDefinition) => SceneClickableThemeDefinition
  ): SceneClickableThemeDefinition;
  saveSceneClickableThemeDraft(): void;
  resetSceneClickableThemeDraft(): SceneClickableThemeDefinition;
  copySceneClickableTheme(): Promise<void>;
  saveSceneClickableThemeToSource(): Promise<boolean>;
}

export type SceneEditorRuntimeSession = SceneDebugRuntimeSession;

export interface SceneDebugRuntimeSessionDependencies {
  createLayoutStore?: (roomId: SceneDebugEditableRoomId) => SceneDebugStore;
  createThemeStore?: () => SceneDebugThemeStore;
}

export type SceneEditorRuntimeSessionDependencies = SceneDebugRuntimeSessionDependencies;

function loadSceneLayout(
  sceneDebugStore: SceneDebugStore,
  debugEnabled: boolean
): SceneLayoutConfig {
  return (debugEnabled ? sceneDebugStore.loadDraft() : null) ?? sceneDebugStore.cloneDefault();
}

function loadSceneClickableTheme(
  sceneDebugThemeStore: SceneDebugThemeStore,
  debugEnabled: boolean
): SceneClickableThemeDefinition {
  return (
    (debugEnabled ? sceneDebugThemeStore.loadDraft() : null) ?? sceneDebugThemeStore.cloneDefault()
  );
}

export function createSceneDebugRuntimeSession(
  roomId: SceneDebugEditableRoomId,
  dependencies: SceneDebugRuntimeSessionDependencies = {}
): SceneDebugRuntimeSession {
  const sceneDebugStore = dependencies.createLayoutStore?.(roomId) ?? createSceneDebugStore(roomId);
  const sceneDebugThemeStore = dependencies.createThemeStore?.() ?? createSceneDebugThemeStore();
  let sceneLayout = sceneDebugStore.cloneDefault();
  let sceneClickableTheme = sceneDebugThemeStore.cloneDefault();

  return {
    roomId,
    load(debugEnabled: boolean): void {
      sceneLayout = loadSceneLayout(sceneDebugStore, debugEnabled);
      sceneClickableTheme = loadSceneClickableTheme(sceneDebugThemeStore, debugEnabled);
    },
    reloadFromActiveTheme(debugEnabled: boolean): void {
      sceneLayout = loadSceneLayout(sceneDebugStore, debugEnabled);
      sceneClickableTheme = loadSceneClickableTheme(sceneDebugThemeStore, debugEnabled);
    },
    getSceneLayout(): SceneLayoutConfig {
      return sceneLayout;
    },
    setSceneLayout(nextSceneLayout: SceneLayoutConfig): void {
      sceneLayout = nextSceneLayout;
    },
    updateObject(id, updater): SceneLayoutConfig {
      sceneLayout = {
        ...sceneLayout,
        objects: sceneLayout.objects.map((sceneObject) =>
          sceneObject.id === id ? updater(sceneObject) : sceneObject
        ),
      };
      sceneDebugStore.saveDraft(sceneLayout);
      return sceneLayout;
    },
    updateBack(id, updater): SceneLayoutConfig {
      sceneLayout = {
        ...sceneLayout,
        backs: sceneLayout.backs.map((back) => (back.id === id ? updater(back) : back)),
      };
      sceneDebugStore.saveDraft(sceneLayout);
      return sceneLayout;
    },
    updateCharacter(id, updater): SceneLayoutConfig {
      sceneLayout = {
        ...sceneLayout,
        characters: sceneLayout.characters.map((character) =>
          character.id === id ? updater(character) : character
        ),
      };
      sceneDebugStore.saveDraft(sceneLayout);
      return sceneLayout;
    },
    saveSceneLayoutDraft(): void {
      sceneDebugStore.saveDraft(sceneLayout);
    },
    resetSceneLayoutDraft(): SceneLayoutConfig {
      sceneLayout = sceneDebugStore.cloneDefault();
      sceneDebugStore.clearDraft();
      return sceneLayout;
    },
    async copySceneLayout(): Promise<void> {
      await sceneDebugStore.copyToClipboard(sceneLayout);
    },
    async saveSceneLayoutToSource(): Promise<boolean> {
      return await sceneDebugStore.saveSource(sceneLayout);
    },
    getSceneClickableTheme(): SceneClickableThemeDefinition {
      return sceneClickableTheme;
    },
    setSceneClickableTheme(nextSceneClickableTheme: SceneClickableThemeDefinition): void {
      sceneClickableTheme = nextSceneClickableTheme;
    },
    updateSceneClickableTheme(updater): SceneClickableThemeDefinition {
      sceneClickableTheme = updater(sceneClickableTheme);
      sceneDebugThemeStore.saveDraft(sceneClickableTheme);
      return sceneClickableTheme;
    },
    saveSceneClickableThemeDraft(): void {
      sceneDebugThemeStore.saveDraft(sceneClickableTheme);
    },
    resetSceneClickableThemeDraft(): SceneClickableThemeDefinition {
      sceneClickableTheme = sceneDebugThemeStore.cloneDefault();
      sceneDebugThemeStore.clearDraft();
      return sceneClickableTheme;
    },
    async copySceneClickableTheme(): Promise<void> {
      await sceneDebugThemeStore.copyToClipboard(sceneClickableTheme);
    },
    async saveSceneClickableThemeToSource(): Promise<boolean> {
      return await sceneDebugThemeStore.saveSource(sceneClickableTheme);
    },
  };
}

export function createSceneEditorRuntimeSession(
  roomId: SceneDebugEditableRoomId,
  dependencies: SceneEditorRuntimeSessionDependencies = {}
): SceneEditorRuntimeSession {
  return createSceneDebugRuntimeSession(roomId, dependencies);
}
