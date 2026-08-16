import { FileManager } from "../modules/file-manager.js";
import {
  cloneSceneLayout,
  parseSceneLayoutDraft,
  serializeSceneLayout,
  type SceneLayoutConfig,
} from "../scene/layout/index.js";
import {
  isSceneRoomId,
  type SceneClickableThemeDefinition,
  type SceneDebugEditableRoomId,
} from "../scene/schema.js";
import {
  parseSceneClickableThemeDraft,
  serializeSceneClickableThemeDraft,
  serializeSceneClickableThemeSource,
} from "../scene-system/scene-clickable-theme-core.js";
import { getSceneDefaultClickableTheme } from "../scene-system/scene-clickable-theme-defaults.js";
import {
  getSceneClickableDefaultsSourcePath,
  getSceneRoomLayout,
  getSceneRoomSourcePath,
  getSceneThemeId,
} from "../scene-system/scene-layout-registry.js";

interface SceneDebugStoreConfig {
  storageKey: string;
  sourcePath: string;
}

interface SceneDebugThemeStoreConfig {
  storageKey: string;
  sourcePath: string;
}

type SceneDebugLocalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type SceneDebugClipboard = Pick<Clipboard, "writeText">;
type SceneDebugWriteFileAtomic = typeof FileManager.writeFileAtomic;

export interface SceneDebugStoreDependencies {
  localStorage?: SceneDebugLocalStorage;
  clipboard?: SceneDebugClipboard;
  writeFileAtomic?: SceneDebugWriteFileAtomic;
  getThemeId?: () => string;
  getRoomSourcePath?: (roomId: SceneDebugEditableRoomId) => string;
  getRoomLayout?: (roomId: SceneDebugEditableRoomId) => SceneLayoutConfig;
}

export interface SceneDebugThemeStoreDependencies {
  localStorage?: SceneDebugLocalStorage;
  clipboard?: SceneDebugClipboard;
  writeFileAtomic?: SceneDebugWriteFileAtomic;
  getThemeId?: () => string;
  getClickableDefaultsSourcePath?: () => string;
  cloneDefaultTheme?: () => SceneClickableThemeDefinition;
}

export interface SceneDebugStore {
  roomId: SceneDebugEditableRoomId;
  getSourcePath(): string;
  cloneDefault(): SceneLayoutConfig;
  loadDraft(): SceneLayoutConfig | null;
  saveDraft(sceneLayout: SceneLayoutConfig): void;
  clearDraft(): void;
  serialize(sceneLayout: SceneLayoutConfig): string;
  copyToClipboard(sceneLayout: SceneLayoutConfig): Promise<void>;
  saveSource(sceneLayout: SceneLayoutConfig): Promise<boolean>;
}

export interface SceneDebugThemeStore {
  getSourcePath(): string;
  cloneDefault(): SceneClickableThemeDefinition;
  loadDraft(): SceneClickableThemeDefinition | null;
  saveDraft(sceneClickableTheme: SceneClickableThemeDefinition): void;
  clearDraft(): void;
  serialize(sceneClickableTheme: SceneClickableThemeDefinition): string;
  copyToClipboard(sceneClickableTheme: SceneClickableThemeDefinition): Promise<void>;
  saveSource(sceneClickableTheme: SceneClickableThemeDefinition): Promise<boolean>;
}

const SCENE_EDITOR_DRAFT_VERSION = "v2";
const SCENE_CLICKABLE_THEME_DRAFT_VERSION = "v1";

function resolveBuiltInRoomSourcePath(roomId: SceneDebugEditableRoomId): string {
  return isSceneRoomId(roomId) ? getSceneRoomSourcePath(roomId) : "";
}

function resolveBuiltInRoomLayout(roomId: SceneDebugEditableRoomId): SceneLayoutConfig {
  return cloneSceneLayout(getSceneRoomLayout(isSceneRoomId(roomId) ? roomId : "rooms"));
}

function getSceneDebugStoreConfig(
  roomId: SceneDebugEditableRoomId,
  dependencies: SceneDebugStoreDependencies = {}
): SceneDebugStoreConfig {
  const resolveThemeId = dependencies.getThemeId ?? getSceneThemeId;
  const resolveRoomSourcePath = dependencies.getRoomSourcePath ?? resolveBuiltInRoomSourcePath;
  return {
    storageKey: `scene-editor:${resolveThemeId()}:${roomId}:draft:${SCENE_EDITOR_DRAFT_VERSION}`,
    sourcePath: resolveRoomSourcePath(roomId),
  };
}

function getSceneDebugThemeStoreConfig(
  dependencies: SceneDebugThemeStoreDependencies = {}
): SceneDebugThemeStoreConfig {
  const resolveThemeId = dependencies.getThemeId ?? getSceneThemeId;
  const resolveClickableDefaultsSourcePath =
    dependencies.getClickableDefaultsSourcePath ?? getSceneClickableDefaultsSourcePath;
  return {
    storageKey: `scene-editor:${resolveThemeId()}:clickable-defaults:draft:${SCENE_CLICKABLE_THEME_DRAFT_VERSION}`,
    sourcePath: resolveClickableDefaultsSourcePath(),
  };
}

function resolveSceneDebugLocalStorage(
  localStorageOverride?: SceneDebugLocalStorage
): SceneDebugLocalStorage {
  return localStorageOverride ?? window.localStorage;
}

function resolveSceneDebugClipboard(clipboardOverride?: SceneDebugClipboard): SceneDebugClipboard {
  return clipboardOverride ?? navigator.clipboard;
}

function resolveSceneDebugWriteFileAtomic(
  writeFileAtomicOverride?: SceneDebugWriteFileAtomic
): SceneDebugWriteFileAtomic {
  return writeFileAtomicOverride ?? FileManager.writeFileAtomic.bind(FileManager);
}

function loadSceneDebugDraft(
  config: SceneDebugStoreConfig,
  localStorageOverride?: SceneDebugLocalStorage
): SceneLayoutConfig | null {
  try {
    const raw = resolveSceneDebugLocalStorage(localStorageOverride).getItem(config.storageKey);
    if (raw === null || raw.trim() === "") {
      return null;
    }

    return parseSceneLayoutDraft(raw);
  } catch {
    return null;
  }
}

function saveSceneDebugDraft(
  config: SceneDebugStoreConfig,
  sceneLayout: SceneLayoutConfig,
  localStorageOverride?: SceneDebugLocalStorage
): void {
  try {
    resolveSceneDebugLocalStorage(localStorageOverride).setItem(
      config.storageKey,
      serializeSceneLayout(sceneLayout)
    );
  } catch {
    // Ignore draft persistence failures in constrained environments.
  }
}

function clearSceneDebugDraft(
  config: SceneDebugStoreConfig,
  localStorageOverride?: SceneDebugLocalStorage
): void {
  try {
    resolveSceneDebugLocalStorage(localStorageOverride).removeItem(config.storageKey);
  } catch {
    // Ignore draft persistence failures in constrained environments.
  }
}

function loadSceneDebugThemeDraft(
  config: SceneDebugThemeStoreConfig,
  localStorageOverride?: SceneDebugLocalStorage
): SceneClickableThemeDefinition | null {
  try {
    const raw = resolveSceneDebugLocalStorage(localStorageOverride).getItem(config.storageKey);
    if (raw === null || raw.trim() === "") {
      return null;
    }

    return parseSceneClickableThemeDraft(raw);
  } catch {
    return null;
  }
}

function saveSceneDebugThemeDraft(
  config: SceneDebugThemeStoreConfig,
  sceneClickableTheme: SceneClickableThemeDefinition,
  localStorageOverride?: SceneDebugLocalStorage
): void {
  try {
    resolveSceneDebugLocalStorage(localStorageOverride).setItem(
      config.storageKey,
      serializeSceneClickableThemeDraft(sceneClickableTheme)
    );
  } catch {
    // Ignore draft persistence failures in constrained environments.
  }
}

function clearSceneDebugThemeDraft(
  config: SceneDebugThemeStoreConfig,
  localStorageOverride?: SceneDebugLocalStorage
): void {
  try {
    resolveSceneDebugLocalStorage(localStorageOverride).removeItem(config.storageKey);
  } catch {
    // Ignore draft persistence failures in constrained environments.
  }
}

export function createSceneDebugStore(
  roomId: SceneDebugEditableRoomId,
  dependencies: SceneDebugStoreDependencies = {}
): SceneDebugStore {
  const getConfig = (): SceneDebugStoreConfig => getSceneDebugStoreConfig(roomId, dependencies);
  const resolveRoomLayout = dependencies.getRoomLayout ?? resolveBuiltInRoomLayout;
  const clipboard = resolveSceneDebugClipboard(dependencies.clipboard);
  const writeFileAtomic = resolveSceneDebugWriteFileAtomic(dependencies.writeFileAtomic);

  return {
    roomId,
    getSourcePath(): string {
      return getConfig().sourcePath;
    },
    cloneDefault(): SceneLayoutConfig {
      return cloneSceneLayout(resolveRoomLayout(roomId));
    },
    loadDraft(): SceneLayoutConfig | null {
      return loadSceneDebugDraft(getConfig(), dependencies.localStorage);
    },
    saveDraft(sceneLayout: SceneLayoutConfig): void {
      saveSceneDebugDraft(getConfig(), sceneLayout, dependencies.localStorage);
    },
    clearDraft(): void {
      clearSceneDebugDraft(getConfig(), dependencies.localStorage);
    },
    serialize(sceneLayout: SceneLayoutConfig): string {
      return serializeSceneLayout(sceneLayout);
    },
    async copyToClipboard(sceneLayout: SceneLayoutConfig): Promise<void> {
      await clipboard.writeText(serializeSceneLayout(sceneLayout));
    },
    async saveSource(sceneLayout: SceneLayoutConfig): Promise<boolean> {
      const config = getConfig();
      const savedPath = await writeFileAtomic(
        config.sourcePath,
        `${serializeSceneLayout(sceneLayout)}\n`,
        "utf-8"
      );
      return savedPath !== "";
    },
  };
}

export function createSceneDebugThemeStore(
  dependencies: SceneDebugThemeStoreDependencies = {}
): SceneDebugThemeStore {
  const getConfig = (): SceneDebugThemeStoreConfig => getSceneDebugThemeStoreConfig(dependencies);
  const cloneDefaultTheme = dependencies.cloneDefaultTheme ?? getSceneDefaultClickableTheme;
  const clipboard = resolveSceneDebugClipboard(dependencies.clipboard);
  const writeFileAtomic = resolveSceneDebugWriteFileAtomic(dependencies.writeFileAtomic);

  return {
    getSourcePath(): string {
      return getConfig().sourcePath;
    },
    cloneDefault(): SceneClickableThemeDefinition {
      return cloneDefaultTheme();
    },
    loadDraft(): SceneClickableThemeDefinition | null {
      return loadSceneDebugThemeDraft(getConfig(), dependencies.localStorage);
    },
    saveDraft(sceneClickableTheme: SceneClickableThemeDefinition): void {
      saveSceneDebugThemeDraft(getConfig(), sceneClickableTheme, dependencies.localStorage);
    },
    clearDraft(): void {
      clearSceneDebugThemeDraft(getConfig(), dependencies.localStorage);
    },
    serialize(sceneClickableTheme: SceneClickableThemeDefinition): string {
      return serializeSceneClickableThemeDraft(sceneClickableTheme);
    },
    async copyToClipboard(sceneClickableTheme: SceneClickableThemeDefinition): Promise<void> {
      await clipboard.writeText(serializeSceneClickableThemeDraft(sceneClickableTheme));
    },
    async saveSource(sceneClickableTheme: SceneClickableThemeDefinition): Promise<boolean> {
      const config = getConfig();
      const savedPath = await writeFileAtomic(
        config.sourcePath,
        serializeSceneClickableThemeSource(sceneClickableTheme),
        "utf-8"
      );
      return savedPath !== "";
    },
  };
}
