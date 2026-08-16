import type {
  InstalledRoomRecord,
  RoomManifest,
  RoomSceneCharacterConfig,
  RoomSceneHotspotConfig,
} from "@shared/index.js";
import { validateRoomManifest } from "@shared/index.js";
import { FileManager } from "../file-manager.js";
import type {
  SceneDebugStore,
  SceneDebugThemeStore,
} from "../../scene-editor/scene-editor-store.js";
import {
  cloneSceneLayout,
  parseSceneLayoutDraft,
  serializeSceneLayout,
  type SceneBackConfig,
  type SceneCharacterPlacementConfig,
  type SceneLayoutConfig,
  type SceneObjectConfig,
} from "../../scene/layout/index.js";
import {
  parseSceneClickableThemeDraft,
  serializeSceneClickableThemeDraft,
} from "../../scene-system/scene-clickable-theme-core.js";
import { getSceneDefaultClickableTheme } from "../../scene-system/scene-clickable-theme-defaults.js";
import {
  getSceneRoomLayout,
  getSceneRoomSourcePath,
  getSceneThemeId,
} from "../../scene-system/scene-layout-registry.js";
import type { SceneClickableThemeDefinition } from "../../scene/schema.js";

const DEFAULT_SCENE_REFERENCE_SIZE = {
  width: 1600,
  height: 900,
} as const;

const DEFAULT_NODE_FRAME = {
  variant: "flat" as const,
  rotateDeg: 0,
  perspectiveDeg: 0,
  hueDeg: 34,
  alpha: 0.62,
};

const DEFAULT_BACK_GLOW = {
  hueDeg: 24,
  alpha: 0.54,
};

const ROOM_PAGE_SCENE_DRAFT_VERSION = "v1";
const ROOM_PAGE_SCENE_THEME_DRAFT_VERSION = "v1";
const ROOMS_CORRIDOR_SCENE_DRAFT_VERSION = "v3";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type ClipboardLike = Pick<Clipboard, "writeText">;

function getStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function getClipboard(): ClipboardLike | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  return navigator.clipboard;
}

function getRoomSceneDraftKey(roomId: string): string {
  return `scene-editor:room:${roomId}:draft:${ROOM_PAGE_SCENE_DRAFT_VERSION}`;
}

function getRoomSceneThemeDraftKey(roomId: string): string {
  return `scene-editor:room:${roomId}:clickable-theme:${ROOM_PAGE_SCENE_THEME_DRAFT_VERSION}`;
}

function getRoomsCorridorDraftKey(): string {
  return `scene-editor:${getSceneThemeId()}:rooms:draft:${ROOMS_CORRIDOR_SCENE_DRAFT_VERSION}`;
}

function decodeBase64Text(value: string): string {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function buildRoomManifestPath(sourceDir: string): string {
  const separator = sourceDir.includes("\\") ? "\\" : "/";
  return `${sourceDir.replace(/[\\/]+$/, "")}${separator}manifest.json`;
}

function buildSceneTextHotspotLabel(
  hotspot: RoomSceneHotspotConfig,
  fallback: string
): SceneObjectConfig["label"] {
  const rect = hotspot.rect;
  const labelText = hotspot.label?.text?.trim() ?? hotspot.label?.textKey ?? fallback;

  return {
    visible: true,
    textKey: hotspot.label?.textKey ?? "",
    ...(hotspot.label?.text !== undefined
      ? { customText: hotspot.label.text }
      : { customText: labelText }),
    centerXPx: rect.leftPx + rect.widthPx / 2,
    topPx: rect.topPx + rect.heightPx + 18,
    widthPx: Math.max(rect.widthPx, 220),
    heightPx: 44,
    rotateDeg: 0,
    fontSizePx: 25,
    letterSpacingPx: 1.2,
    fontPreset: "display",
    framePerspectiveDeg: 0,
  };
}

function normalizeInstalledRooms(
  rooms: InstalledRoomRecord[] | null | undefined
): InstalledRoomRecord[] {
  return Array.isArray(rooms) ? rooms : [];
}

function buildBackHotspotLabel(
  hotspot: RoomSceneHotspotConfig,
  fallback: string
): SceneBackConfig["label"] {
  const rect = hotspot.rect;
  const labelText = hotspot.label?.text?.trim() ?? hotspot.label?.textKey ?? fallback;

  return {
    visible: true,
    textKey: hotspot.label?.textKey ?? "",
    ...(hotspot.label?.text !== undefined
      ? { customText: hotspot.label.text }
      : { customText: labelText }),
    centerXPx: rect.leftPx + rect.widthPx / 2,
    topPx: rect.topPx + rect.heightPx + 16,
    widthPx: Math.max(rect.widthPx, 180),
    heightPx: 40,
    rotateDeg: 0,
    fontSizePx: 24,
    letterSpacingPx: 1,
    fontPreset: "display",
    framePerspectiveDeg: 0,
  };
}

export function buildInstalledRoomCorridorNode(
  room: InstalledRoomRecord
): SceneObjectConfig | null {
  if (room.scene === undefined) {
    return null;
  }

  return {
    id: room.scene.roomsHotspot.id,
    kind: "object",
    viewId: null,
    action: {
      type: "screen",
      screen: "primary",
    },
    rect: { ...room.scene.roomsHotspot.rect },
    frame: { ...DEFAULT_NODE_FRAME },
    label: buildSceneTextHotspotLabel(room.scene.roomsHotspot, room.name),
  };
}

function buildRoomInteriorNode(
  room: InstalledRoomRecord,
  featureId: string
): SceneObjectConfig | null {
  const feature = room.features.find((item) => item.id === featureId);
  if (feature?.scene === undefined) {
    return null;
  }

  return {
    id: feature.scene.hotspot.id,
    kind: "object",
    viewId: null,
    action: {
      type: "screen",
      screen: "primary",
    },
    rect: { ...feature.scene.hotspot.rect },
    frame: { ...DEFAULT_NODE_FRAME },
    label: buildSceneTextHotspotLabel(feature.scene.hotspot, feature.name),
  };
}

function buildRoomInteriorBackNode(room: InstalledRoomRecord): SceneBackConfig | null {
  if (room.scene === undefined) {
    return null;
  }

  return {
    id: room.scene.backHotspot.id,
    kind: "back",
    viewId: "feature-view",
    action: {
      type: "back",
      target: "room",
    },
    rect: { ...room.scene.backHotspot.rect },
    glow: { ...DEFAULT_BACK_GLOW },
    label: buildBackHotspotLabel(room.scene.backHotspot, "Back"),
  };
}

function cloneRoomSceneCharacter(character: RoomSceneCharacterConfig): RoomSceneCharacterConfig {
  return { ...character };
}

function toSceneCharacterPlacement(
  character: RoomSceneCharacterConfig
): SceneCharacterPlacementConfig {
  return {
    kind: "character",
    ...cloneRoomSceneCharacter(character),
  };
}

function toRoomSceneCharacterConfig(
  character: SceneCharacterPlacementConfig
): RoomSceneCharacterConfig {
  return {
    id: character.id,
    characterKind: character.characterKind,
    ...(character.preferredSlot !== undefined ? { preferredSlot: character.preferredSlot } : {}),
    leftPx: character.leftPx,
    bottomPx: character.bottomPx,
    scale: character.scale,
    depth: character.depth,
  };
}

function buildRoomInteriorCharacterNodes(
  room: InstalledRoomRecord
): SceneCharacterPlacementConfig[] {
  if (room.scene?.characters !== undefined) {
    return room.scene.characters.map((character) => toSceneCharacterPlacement(character));
  }

  return [];
}

function resolveRoomInteriorCharacterRosterPreset(
  room: InstalledRoomRecord
): SceneLayoutConfig["characterRosterPreset"] {
  return room.scene?.characterRosterPreset ?? "all-characters";
}

export function buildRoomInteriorSceneLayout(room: InstalledRoomRecord): SceneLayoutConfig {
  return {
    characterRosterPreset: resolveRoomInteriorCharacterRosterPreset(room),
    referenceSize: room.scene?.referenceSize ?? DEFAULT_SCENE_REFERENCE_SIZE,
    objects: room.features
      .map((feature) => buildRoomInteriorNode(room, feature.id))
      .filter((node): node is SceneObjectConfig => node !== null),
    backs: [buildRoomInteriorBackNode(room)].filter(
      (node): node is SceneBackConfig => node !== null
    ),
    characters: buildRoomInteriorCharacterNodes(room),
  };
}

function cloneClickableTheme(): SceneClickableThemeDefinition {
  return structuredClone(getSceneDefaultClickableTheme());
}

function loadSceneLayoutDraft(storageKey: string): SceneLayoutConfig | null {
  const storage = getStorage();
  if (storage === null) {
    return null;
  }

  try {
    const raw = storage.getItem(storageKey);
    if (raw === null || raw.trim() === "") {
      return null;
    }
    return parseSceneLayoutDraft(raw);
  } catch {
    return null;
  }
}

function saveSceneLayoutDraft(storageKey: string, sceneLayout: SceneLayoutConfig): void {
  const storage = getStorage();
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(storageKey, serializeSceneLayout(sceneLayout));
  } catch {
    return;
  }
}

function clearDraft(storageKey: string): void {
  const storage = getStorage();
  if (storage === null) {
    return;
  }

  try {
    storage.removeItem(storageKey);
  } catch {
    return;
  }
}

function loadSceneClickableThemeDraft(storageKey: string): SceneClickableThemeDefinition | null {
  const storage = getStorage();
  if (storage === null) {
    return null;
  }

  try {
    const raw = storage.getItem(storageKey);
    if (raw === null || raw.trim() === "") {
      return null;
    }
    return parseSceneClickableThemeDraft(raw);
  } catch {
    return null;
  }
}

function saveSceneClickableThemeDraft(
  storageKey: string,
  sceneClickableTheme: SceneClickableThemeDefinition
): void {
  const storage = getStorage();
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(storageKey, serializeSceneClickableThemeDraft(sceneClickableTheme));
  } catch {
    return;
  }
}

async function copyTextToClipboard(value: string): Promise<void> {
  const clipboard = getClipboard();
  if (clipboard === null) {
    return;
  }

  await clipboard.writeText(value);
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  const readFile = window.electronAPI?.readFile;
  if (typeof readFile !== "function" || filePath.trim() === "") {
    return null;
  }

  try {
    const encoded = await readFile(filePath);
    if (typeof encoded !== "string" || encoded === "") {
      return null;
    }

    return JSON.parse(decodeBase64Text(encoded)) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<boolean> {
  const savedPath = await FileManager.writeFileAtomic(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf-8"
  );
  return savedPath !== "";
}

async function writeRoomManifestCopies(
  room: InstalledRoomRecord,
  manifest: RoomManifest
): Promise<boolean> {
  const paths = new Set<string>([room.manifestPath]);
  if (room.sourceDir.trim() !== "") {
    paths.add(buildRoomManifestPath(room.sourceDir));
  }

  const results = await Promise.all(
    [...paths].map(async (manifestPath) => await writeJsonFile(manifestPath, manifest))
  );
  return results.every(Boolean);
}

function cloneRoomLabelFromNode(
  node: { label?: { customText?: string; textKey?: string } },
  current: RoomSceneHotspotConfig
): RoomSceneHotspotConfig["label"] | undefined {
  const customText = node.label?.customText?.trim();
  const textKey = node.label?.textKey?.trim();

  if (customText === undefined && textKey === undefined) {
    return current.label;
  }

  return {
    ...(textKey !== undefined && textKey !== "" ? { textKey } : {}),
    ...(customText !== undefined && customText !== "" ? { text: customText } : {}),
  };
}

function applyObjectNodeToHotspot(
  node: SceneObjectConfig,
  current: RoomSceneHotspotConfig
): RoomSceneHotspotConfig {
  const label = cloneRoomLabelFromNode(node, current);
  return {
    id: current.id,
    rect: { ...node.rect },
    ...(label !== undefined ? { label } : {}),
  };
}

function applyBackNodeToHotspot(
  node: SceneBackConfig,
  current: RoomSceneHotspotConfig
): RoomSceneHotspotConfig {
  const label = cloneRoomLabelFromNode(node, current);
  return {
    id: current.id,
    rect: { ...node.rect },
    ...(label !== undefined ? { label } : {}),
  };
}

async function saveRoomInteriorSceneLayout(
  room: InstalledRoomRecord,
  sceneLayout: SceneLayoutConfig
): Promise<boolean> {
  const manifest = await readJsonFile<unknown>(room.manifestPath);
  const validation = validateRoomManifest(manifest);
  if (validation.valid !== true || validation.manifest?.scene === undefined) {
    return false;
  }

  const nextManifest = structuredClone(validation.manifest);
  if (nextManifest.scene === undefined) {
    return false;
  }

  nextManifest.scene.referenceSize = { ...sceneLayout.referenceSize };
  nextManifest.scene.characterRosterPreset = sceneLayout.characterRosterPreset;
  nextManifest.scene.characters = sceneLayout.characters.map((character) =>
    toRoomSceneCharacterConfig(character)
  );

  nextManifest.features = nextManifest.features.map((feature) => {
    const featureScene = feature.scene;
    if (featureScene === undefined) {
      return feature;
    }

    const node = sceneLayout.objects.find((item) => item.id === featureScene.hotspot.id);
    if (node === undefined) {
      return feature;
    }

    return {
      ...feature,
      scene: {
        ...featureScene,
        hotspot: applyObjectNodeToHotspot(node, featureScene.hotspot),
      },
    };
  });

  const nextManifestScene = nextManifest.scene;
  const backNode = sceneLayout.backs.find((node) => node.id === nextManifestScene.backHotspot.id);
  if (backNode !== undefined) {
    nextManifestScene.backHotspot = applyBackNodeToHotspot(backNode, nextManifestScene.backHotspot);
  }

  const currentRoomByFeature = new Map(room.features.map((feature) => [feature.id, feature]));
  nextManifest.features = nextManifest.features.map((feature) => {
    const currentFeature = currentRoomByFeature.get(feature.id);
    const currentTransparentWindow = currentFeature?.scene?.view.transparentWindow;
    const currentPanelArtPath = currentFeature?.scene?.view.panelArtPath;
    if (currentTransparentWindow === undefined && currentPanelArtPath === undefined) {
      return feature;
    }

    if (feature.scene === undefined) {
      return feature;
    }

    return {
      ...feature,
      scene: {
        ...feature.scene,
        view: {
          ...feature.scene.view,
          ...(currentTransparentWindow !== undefined
            ? { transparentWindow: { ...currentTransparentWindow } }
            : {}),
        },
      },
    };
  });

  return await writeRoomManifestCopies(room, nextManifest);
}

async function saveRoomsCorridorSceneLayout(
  rooms: InstalledRoomRecord[],
  sceneLayout: SceneLayoutConfig
): Promise<boolean> {
  const safeRooms = normalizeInstalledRooms(rooms);
  const installedHotspotIds = new Map(
    safeRooms
      .filter(
        (
          room
        ): room is InstalledRoomRecord & { scene: NonNullable<InstalledRoomRecord["scene"]> } =>
          room.scene !== undefined
      )
      .map((room) => [room.scene.roomsHotspot.id, room] as const)
  );

  const themeLayout = cloneSceneLayout(sceneLayout);
  themeLayout.objects = sceneLayout.objects.filter(
    (node) => installedHotspotIds.has(node.id) === false
  );
  const themeSavedPath = await FileManager.writeFileAtomic(
    getSceneRoomSourcePath("rooms"),
    `${serializeSceneLayout(themeLayout)}\n`,
    "utf-8"
  );
  if (themeSavedPath === "") {
    return false;
  }

  const results = await Promise.all(
    safeRooms.map(async (room) => {
      const roomScene = room.scene;
      if (roomScene === undefined) {
        return true;
      }

      const manifest = await readJsonFile<unknown>(room.manifestPath);
      const validation = validateRoomManifest(manifest);
      if (validation.valid !== true || validation.manifest?.scene === undefined) {
        return false;
      }

      const node = sceneLayout.objects.find((item) => item.id === roomScene.roomsHotspot.id);
      if (node === undefined) {
        return true;
      }

      const nextManifest = structuredClone(validation.manifest);
      if (nextManifest.scene === undefined) {
        return false;
      }
      nextManifest.scene.roomsHotspot = applyObjectNodeToHotspot(
        node,
        nextManifest.scene.roomsHotspot
      );
      return await writeRoomManifestCopies(room, nextManifest);
    })
  );

  return results.every(Boolean);
}

function mergeRoomsCorridorLayout(
  baseLayout: SceneLayoutConfig,
  rooms: InstalledRoomRecord[]
): SceneLayoutConfig {
  const installedNodes = normalizeInstalledRooms(rooms)
    .map((room) => buildInstalledRoomCorridorNode(room))
    .filter((node): node is SceneObjectConfig => node !== null);
  const installedNodeIds = new Set(installedNodes.map((node) => node.id));

  return {
    ...cloneSceneLayout(baseLayout),
    objects: [
      ...baseLayout.objects.filter((node) => installedNodeIds.has(node.id) === false),
      ...installedNodes,
    ],
  };
}

export function createRoomsCorridorSceneDebugStore(options: {
  getRooms: () => InstalledRoomRecord[];
}): SceneDebugStore {
  const { getRooms } = options;
  const storageKey = (): string => getRoomsCorridorDraftKey();

  return {
    roomId: "rooms",
    getSourcePath(): string {
      return getSceneRoomSourcePath("rooms");
    },
    cloneDefault(): SceneLayoutConfig {
      return mergeRoomsCorridorLayout(getSceneRoomLayout("rooms"), getRooms());
    },
    loadDraft(): SceneLayoutConfig | null {
      const draft = loadSceneLayoutDraft(storageKey());
      if (draft === null) {
        return null;
      }

      return mergeRoomsCorridorLayout(draft, getRooms());
    },
    saveDraft(sceneLayout: SceneLayoutConfig): void {
      saveSceneLayoutDraft(storageKey(), sceneLayout);
    },
    clearDraft(): void {
      clearDraft(storageKey());
    },
    serialize(sceneLayout: SceneLayoutConfig): string {
      return serializeSceneLayout(sceneLayout);
    },
    async copyToClipboard(sceneLayout: SceneLayoutConfig): Promise<void> {
      await copyTextToClipboard(serializeSceneLayout(sceneLayout));
    },
    async saveSource(sceneLayout: SceneLayoutConfig): Promise<boolean> {
      return await saveRoomsCorridorSceneLayout(getRooms(), sceneLayout);
    },
  };
}

export function createInstalledRoomSceneDebugStore(options: {
  roomId: string;
  getRoom: () => InstalledRoomRecord;
}): SceneDebugStore {
  const { roomId, getRoom } = options;
  const storageKey = (): string => getRoomSceneDraftKey(roomId);

  return {
    roomId,
    getSourcePath(): string {
      return getRoom().manifestPath;
    },
    cloneDefault(): SceneLayoutConfig {
      return buildRoomInteriorSceneLayout(getRoom());
    },
    loadDraft(): SceneLayoutConfig | null {
      return loadSceneLayoutDraft(storageKey());
    },
    saveDraft(sceneLayout: SceneLayoutConfig): void {
      saveSceneLayoutDraft(storageKey(), sceneLayout);
    },
    clearDraft(): void {
      clearDraft(storageKey());
    },
    serialize(sceneLayout: SceneLayoutConfig): string {
      return serializeSceneLayout(sceneLayout);
    },
    async copyToClipboard(sceneLayout: SceneLayoutConfig): Promise<void> {
      await copyTextToClipboard(serializeSceneLayout(sceneLayout));
    },
    async saveSource(sceneLayout: SceneLayoutConfig): Promise<boolean> {
      return await saveRoomInteriorSceneLayout(getRoom(), sceneLayout);
    },
  };
}

export function createRoomScopedSceneThemeStore(roomId: string): SceneDebugThemeStore {
  const storageKey = (): string => getRoomSceneThemeDraftKey(roomId);

  return {
    getSourcePath(): string {
      return `room:${roomId}:clickable-theme`;
    },
    cloneDefault(): SceneClickableThemeDefinition {
      return cloneClickableTheme();
    },
    loadDraft(): SceneClickableThemeDefinition | null {
      return loadSceneClickableThemeDraft(storageKey());
    },
    saveDraft(sceneClickableTheme: SceneClickableThemeDefinition): void {
      saveSceneClickableThemeDraft(storageKey(), sceneClickableTheme);
    },
    clearDraft(): void {
      clearDraft(storageKey());
    },
    serialize(sceneClickableTheme: SceneClickableThemeDefinition): string {
      return serializeSceneClickableThemeDraft(sceneClickableTheme);
    },
    async copyToClipboard(sceneClickableTheme: SceneClickableThemeDefinition): Promise<void> {
      await copyTextToClipboard(serializeSceneClickableThemeDraft(sceneClickableTheme));
    },
    async saveSource(_sceneClickableTheme: SceneClickableThemeDefinition): Promise<boolean> {
      await Promise.resolve();
      return false;
    },
  };
}
