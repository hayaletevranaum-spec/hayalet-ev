import { getFilename, getMimeTypeFromPath } from "../constants/index.js";
import { FileManager } from "../modules/file-manager.js";
import type { SceneLayoutConfig, SceneDebugNodeSelection } from "../scene/layout/index.js";
import {
  detectSceneAlphaWindowBounds,
  invalidateSceneAlphaWindowBoundsCache,
  type SceneAlphaWindowBounds,
} from "../scene/alpha-window.js";
import type { SceneObjectAction, SceneRoomId, SceneThemeViewDefinition } from "../scene/schema.js";
import { getSceneThemeId, getSceneThemeSourceRoot } from "../scene-system/scene-layout-registry.js";
import { getActiveSceneTheme } from "../scene-system/scene-theme-registry.js";

export interface SceneThemeAssetEntryDraft {
  sourcePath?: string;
  transparentWindow?: SceneAlphaWindowBounds | null;
}

interface SceneThemeViewAssetDraft {
  background?: SceneThemeAssetEntryDraft;
  panelArt?: SceneThemeAssetEntryDraft;
}

interface SceneThemeRoomAssetDraft {
  background?: SceneThemeAssetEntryDraft;
  panels?: Record<string, SceneThemeAssetEntryDraft>;
  views?: Record<string, SceneThemeViewAssetDraft>;
}

export interface SceneThemeAssetDraftDocument {
  version: 1;
  themeId: string;
  rooms: Partial<Record<SceneRoomId, SceneThemeRoomAssetDraft>>;
}

type SceneThemeAssetDraftListener = (draft: SceneThemeAssetDraftDocument) => void;

export interface SceneEditorAssetTargetDescriptor {
  id: string;
  roomId: string;
  label: string;
  sourceHint: string;
  runtimeSrc: string;
  hasSourceOverride: boolean;
  supportsTransparentWindow: boolean;
  transparentWindow: SceneAlphaWindowBounds | null;
}

type AssetTargetKind = "background" | "panel" | "view-background" | "view-panel-art";

interface ParsedSceneEditorAssetTarget {
  roomId: SceneRoomId;
  kind: AssetTargetKind;
  panelId: string | null;
  viewId: string | null;
}

const SCENE_THEME_ASSET_DRAFT_VERSION = 1;
const SCENE_THEME_ASSET_SOURCE_FILE = "scene-editor-assets.json";
const sceneThemeAssetSourceCache = new Map<string, string>();
const sceneThemeAssetDraftListeners = new Set<SceneThemeAssetDraftListener>();

let savedSceneThemeAssetDraft = createEmptySceneThemeAssetDraft();
let currentSceneThemeAssetDraft = createEmptySceneThemeAssetDraft();

function createEmptySceneThemeAssetDraft(): SceneThemeAssetDraftDocument {
  return {
    version: SCENE_THEME_ASSET_DRAFT_VERSION,
    themeId: getSceneThemeId(),
    rooms: {},
  };
}

function cloneSceneThemeAssetDraft<T>(value: T): T {
  return structuredClone(value);
}

function getSceneThemeAssetDraftStorageKey(): string {
  return `scene-editor:${getSceneThemeId()}:assets:draft:v${SCENE_THEME_ASSET_DRAFT_VERSION}`;
}

export function getSceneThemeAssetDraftSourcePath(themeId = getSceneThemeId()): string {
  return `${getSceneThemeSourceRoot(themeId)}/${SCENE_THEME_ASSET_SOURCE_FILE}`;
}

function normalizeAssetSourcePath(sourcePath: string): string {
  const normalizedPath = sourcePath.replace(/\\/g, "/").trim();
  if (
    normalizedPath.startsWith("/") ||
    /^[a-zA-Z]:\//.test(normalizedPath) ||
    normalizedPath.startsWith("data:") ||
    normalizedPath.startsWith("http://") ||
    normalizedPath.startsWith("https://") ||
    normalizedPath.startsWith("blob:") ||
    normalizedPath.startsWith("file://")
  ) {
    return normalizedPath;
  }

  return normalizedPath.replace(/^\/+/, "");
}

async function resolveSceneThemeAssetRuntimeSource(sourcePath: string): Promise<string> {
  const normalizedPath = normalizeAssetSourcePath(sourcePath);
  if (normalizedPath === "") {
    return "";
  }

  if (
    normalizedPath.startsWith("data:") ||
    normalizedPath.startsWith("http://") ||
    normalizedPath.startsWith("https://") ||
    normalizedPath.startsWith("blob:") ||
    normalizedPath.startsWith("/assets/")
  ) {
    return normalizedPath;
  }

  const cached = sceneThemeAssetSourceCache.get(normalizedPath);
  if (cached !== undefined) {
    return cached;
  }

  const readFile = window.electronAPI?.["readFile"] as
    ((path: string) => Promise<string | null>) | undefined;
  if (typeof readFile === "function") {
    try {
      const base64 = await readFile(normalizedPath);
      if (typeof base64 === "string" && base64 !== "") {
        const dataUrl = `data:${getMimeTypeFromPath(normalizedPath)};base64,${base64}`;
        sceneThemeAssetSourceCache.set(normalizedPath, dataUrl);
        return dataUrl;
      }
    } catch {
      // Fall back to a root-relative path for dev/browser environments.
    }
  }

  const fallback =
    normalizedPath.startsWith("/") ||
    /^[a-zA-Z]:\//.test(normalizedPath) ||
    normalizedPath.startsWith("file://")
      ? normalizedPath
      : `/${normalizedPath}`;
  sceneThemeAssetSourceCache.set(normalizedPath, fallback);
  return fallback;
}

export function getSceneThemeRuntimeSource(sourcePath: string): string {
  const normalizedPath = normalizeAssetSourcePath(sourcePath);
  if (normalizedPath === "") {
    return "";
  }

  const cached = sceneThemeAssetSourceCache.get(normalizedPath);
  if (cached !== undefined) {
    return cached;
  }

  if (
    normalizedPath.startsWith("data:") ||
    normalizedPath.startsWith("http://") ||
    normalizedPath.startsWith("https://") ||
    normalizedPath.startsWith("blob:") ||
    normalizedPath.startsWith("/assets/") ||
    normalizedPath.startsWith("/") ||
    /^[a-zA-Z]:\//.test(normalizedPath) ||
    normalizedPath.startsWith("file://")
  ) {
    return normalizedPath;
  }

  return `/${normalizedPath}`;
}

async function warmSceneThemeAssetRuntimeSource(sourcePath: string | undefined): Promise<void> {
  if (typeof sourcePath !== "string" || sourcePath.trim() === "") {
    return;
  }

  await resolveSceneThemeAssetRuntimeSource(sourcePath);
}

function listSceneThemeDefaultAssetSources(): string[] {
  const activeTheme = getActiveSceneTheme();
  const assetSources: string[] = [];

  assetSources.push(...activeTheme.loading.frames);
  Object.values(activeTheme.characters.roles).forEach((roleConfig) => {
    assetSources.push(roleConfig.bodySrc);
  });
  Object.values(activeTheme.rooms).forEach((roomTheme) => {
    assetSources.push(roomTheme.backgroundSrc);
    Object.values(roomTheme.panels ?? {}).forEach((panelSrc) => {
      assetSources.push(panelSrc);
    });
    Object.values(roomTheme.views ?? {}).forEach((viewTheme) => {
      if (typeof viewTheme.backgroundSrc === "string") {
        assetSources.push(viewTheme.backgroundSrc);
      }
      if (typeof viewTheme.panelArtSrc === "string") {
        assetSources.push(viewTheme.panelArtSrc);
      }
    });
  });

  return assetSources;
}

async function warmSceneThemeDefaultSources(): Promise<void> {
  await Promise.all(
    listSceneThemeDefaultAssetSources().map(async (sourcePath) => {
      await warmSceneThemeAssetRuntimeSource(sourcePath);
    })
  );
}

async function warmSceneThemeAssetDraftSources(draft: SceneThemeAssetDraftDocument): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const roomDraft of Object.values(draft.rooms)) {
    tasks.push(warmSceneThemeAssetRuntimeSource(roomDraft.background?.sourcePath));
    Object.values(roomDraft.panels ?? {}).forEach((entry) => {
      tasks.push(warmSceneThemeAssetRuntimeSource(entry.sourcePath));
    });
    Object.values(roomDraft.views ?? {}).forEach((entry) => {
      tasks.push(warmSceneThemeAssetRuntimeSource(entry.background?.sourcePath));
      tasks.push(warmSceneThemeAssetRuntimeSource(entry.panelArt?.sourcePath));
    });
  }

  await Promise.all(tasks);
}

function decodeBase64Json(base64: string): unknown {
  const decoded = atob(base64);
  const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as unknown;
}

function normalizeTransparentWindow(value: unknown): SceneAlphaWindowBounds | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const sourceWidth = Number(record["sourceWidth"] ?? NaN);
  const sourceHeight = Number(record["sourceHeight"] ?? NaN);
  const left = Number(record["left"] ?? NaN);
  const top = Number(record["top"] ?? NaN);
  const right = Number(record["right"] ?? NaN);
  const bottom = Number(record["bottom"] ?? NaN);
  if (
    [sourceWidth, sourceHeight, left, top, right, bottom].some(
      (entry) => Number.isFinite(entry) === false
    )
  ) {
    return null;
  }
  if (sourceWidth <= 0 || sourceHeight <= 0 || right <= left || bottom <= top) {
    return null;
  }

  return {
    sourceWidth,
    sourceHeight,
    left,
    top,
    right,
    bottom,
  };
}

function normalizeSceneThemeAssetEntry(value: unknown): SceneThemeAssetEntryDraft | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const sourcePath =
    typeof record["sourcePath"] === "string" && record["sourcePath"].trim() !== ""
      ? normalizeAssetSourcePath(record["sourcePath"])
      : undefined;
  const transparentWindow = normalizeTransparentWindow(record["transparentWindow"]);

  if (sourcePath === undefined && transparentWindow === null) {
    return undefined;
  }

  return {
    ...(sourcePath !== undefined ? { sourcePath } : {}),
    ...(transparentWindow !== null ? { transparentWindow } : {}),
  };
}

function normalizeSceneThemeViewAssetDraft(value: unknown): SceneThemeViewAssetDraft | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const background = normalizeSceneThemeAssetEntry(record["background"]);
  const panelArt = normalizeSceneThemeAssetEntry(record["panelArt"]);
  if (background === undefined && panelArt === undefined) {
    return undefined;
  }

  return {
    ...(background !== undefined ? { background } : {}),
    ...(panelArt !== undefined ? { panelArt } : {}),
  };
}

function normalizeSceneThemeRoomAssetDraft(value: unknown): SceneThemeRoomAssetDraft | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const background = normalizeSceneThemeAssetEntry(record["background"]);
  const panels = Object.fromEntries(
    Object.entries((record["panels"] as Record<string, unknown> | undefined) ?? {})
      .map(([panelId, entry]) => [panelId, normalizeSceneThemeAssetEntry(entry)])
      .filter((entry): entry is [string, SceneThemeAssetEntryDraft] => entry[1] !== undefined)
  );
  const views = Object.fromEntries(
    Object.entries((record["views"] as Record<string, unknown> | undefined) ?? {})
      .map(([viewId, entry]) => [viewId, normalizeSceneThemeViewAssetDraft(entry)])
      .filter((entry): entry is [string, SceneThemeViewAssetDraft] => entry[1] !== undefined)
  );

  if (
    background === undefined &&
    Object.keys(panels).length === 0 &&
    Object.keys(views).length === 0
  ) {
    return undefined;
  }

  return {
    ...(background !== undefined ? { background } : {}),
    ...(Object.keys(panels).length > 0 ? { panels } : {}),
    ...(Object.keys(views).length > 0 ? { views } : {}),
  };
}

function normalizeSceneThemeAssetDraftDocument(value: unknown): SceneThemeAssetDraftDocument {
  if (typeof value !== "object" || value === null) {
    return createEmptySceneThemeAssetDraft();
  }

  const record = value as Record<string, unknown>;
  const rooms = Object.fromEntries(
    Object.entries((record["rooms"] as Record<string, unknown> | undefined) ?? {})
      .map(([roomId, roomDraft]) => [roomId, normalizeSceneThemeRoomAssetDraft(roomDraft)])
      .filter((entry): entry is [SceneRoomId, SceneThemeRoomAssetDraft] => entry[1] !== undefined)
  ) as Partial<Record<SceneRoomId, SceneThemeRoomAssetDraft>>;

  return {
    version: SCENE_THEME_ASSET_DRAFT_VERSION,
    themeId:
      typeof record["themeId"] === "string" && record["themeId"].trim() !== ""
        ? record["themeId"].trim()
        : getSceneThemeId(),
    rooms,
  };
}

function readSceneThemeAssetDraftFromLocalStorage(): SceneThemeAssetDraftDocument | null {
  try {
    const raw = window.localStorage.getItem(getSceneThemeAssetDraftStorageKey());
    if (raw === null || raw.trim() === "") {
      return null;
    }

    return normalizeSceneThemeAssetDraftDocument(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function persistSceneThemeAssetDraftToLocalStorage(): void {
  try {
    window.localStorage.setItem(
      getSceneThemeAssetDraftStorageKey(),
      JSON.stringify(currentSceneThemeAssetDraft)
    );
  } catch {
    // Ignore local draft persistence failures.
  }
}

function clearSceneThemeAssetDraftFromLocalStorage(): void {
  try {
    window.localStorage.removeItem(getSceneThemeAssetDraftStorageKey());
  } catch {
    // Ignore local draft persistence failures.
  }
}

function notifySceneThemeAssetDraftListeners(): void {
  const snapshot = getCurrentSceneThemeAssetDraft();
  sceneThemeAssetDraftListeners.forEach((listener) => {
    listener(snapshot);
  });
}

function readSceneThemeAssetTargetEntry(
  target: ParsedSceneEditorAssetTarget,
  draft: SceneThemeAssetDraftDocument = currentSceneThemeAssetDraft
): SceneThemeAssetEntryDraft | undefined {
  const roomDraft = draft.rooms[target.roomId];
  if (roomDraft === undefined) {
    return undefined;
  }

  if (target.kind === "background") {
    return roomDraft.background;
  }
  if (target.kind === "panel") {
    return target.panelId === null ? undefined : roomDraft.panels?.[target.panelId];
  }
  if (target.kind === "view-background") {
    return target.viewId === null ? undefined : roomDraft.views?.[target.viewId]?.background;
  }

  return target.viewId === null ? undefined : roomDraft.views?.[target.viewId]?.panelArt;
}

function writeSceneThemeAssetTargetEntry(
  target: ParsedSceneEditorAssetTarget,
  nextEntry: SceneThemeAssetEntryDraft | undefined
): void {
  const roomDraft = {
    ...(currentSceneThemeAssetDraft.rooms[target.roomId] ?? {}),
  } satisfies SceneThemeRoomAssetDraft;

  if (target.kind === "background") {
    if (nextEntry === undefined) {
      delete roomDraft.background;
    } else {
      roomDraft.background = nextEntry;
    }
  } else if (target.kind === "panel" && target.panelId !== null) {
    const nextPanels = { ...(roomDraft.panels ?? {}) };
    if (nextEntry === undefined) {
      delete nextPanels[target.panelId];
    } else {
      nextPanels[target.panelId] = nextEntry;
    }
    if (Object.keys(nextPanels).length > 0) {
      roomDraft.panels = nextPanels;
    } else {
      delete roomDraft.panels;
    }
  } else if (target.viewId !== null) {
    const nextViews = { ...(roomDraft.views ?? {}) };
    const currentViewDraft = { ...(nextViews[target.viewId] ?? {}) };
    if (target.kind === "view-background") {
      if (nextEntry === undefined) {
        delete currentViewDraft.background;
      } else {
        currentViewDraft.background = nextEntry;
      }
    } else if (target.kind === "view-panel-art") {
      if (nextEntry === undefined) {
        delete currentViewDraft.panelArt;
      } else {
        currentViewDraft.panelArt = nextEntry;
      }
    }

    if (currentViewDraft.background === undefined && currentViewDraft.panelArt === undefined) {
      delete nextViews[target.viewId];
    } else {
      nextViews[target.viewId] = currentViewDraft;
    }
    if (Object.keys(nextViews).length > 0) {
      roomDraft.views = nextViews;
    } else {
      delete roomDraft.views;
    }
  }

  if (
    roomDraft.background === undefined &&
    roomDraft.panels === undefined &&
    roomDraft.views === undefined
  ) {
    delete currentSceneThemeAssetDraft.rooms[target.roomId];
  } else {
    currentSceneThemeAssetDraft.rooms[target.roomId] = roomDraft;
  }
}

function buildSceneEditorAssetTargetId(target: ParsedSceneEditorAssetTarget): string {
  if (target.kind === "background") {
    return `${target.roomId}::background`;
  }
  if (target.kind === "panel") {
    return `${target.roomId}::panel::${target.panelId ?? ""}`;
  }
  if (target.kind === "view-background") {
    return `${target.roomId}::view::${target.viewId ?? ""}::background`;
  }
  return `${target.roomId}::view::${target.viewId ?? ""}::panel-art`;
}

function parseSceneEditorAssetTargetId(targetId: string): ParsedSceneEditorAssetTarget | null {
  const segments = targetId.split("::");
  const roomId = segments[0] as SceneRoomId | undefined;
  if (roomId === undefined || roomId.trim() === "") {
    return null;
  }

  if (segments[1] === "background") {
    return {
      roomId,
      kind: "background",
      panelId: null,
      viewId: null,
    };
  }
  if (segments[1] === "panel") {
    return {
      roomId,
      kind: "panel",
      panelId: segments[2] ?? null,
      viewId: null,
    };
  }
  if (segments[1] === "view" && segments[3] === "background") {
    return {
      roomId,
      kind: "view-background",
      panelId: null,
      viewId: segments[2] ?? null,
    };
  }
  if (segments[1] === "view" && segments[3] === "panel-art") {
    return {
      roomId,
      kind: "view-panel-art",
      panelId: null,
      viewId: segments[2] ?? null,
    };
  }

  return null;
}

function humanizeSceneAssetLabel(value: string): string {
  return value
    .split(/[-_]/g)
    .filter((segment) => segment.trim() !== "")
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildSceneEditorAssetSourceHint(
  overrideEntry: SceneThemeAssetEntryDraft | undefined,
  defaultSrc: string
): string {
  if (overrideEntry?.sourcePath !== undefined) {
    return getFilename(overrideEntry.sourcePath);
  }

  if (defaultSrc.startsWith("/assets/")) {
    return "Theme default";
  }

  return getFilename(defaultSrc);
}

function getSceneThemeViewAssetDefault(
  viewDefinition: SceneThemeViewDefinition | null,
  kind: "background" | "panelArt"
): string {
  if (viewDefinition === null) {
    return "";
  }

  return kind === "background"
    ? (viewDefinition.backgroundSrc ?? "")
    : (viewDefinition.panelArtSrc ?? "");
}

function getSceneEditorAssetTargetDefaultSource(target: ParsedSceneEditorAssetTarget): string {
  const roomTheme = getActiveSceneTheme().rooms[target.roomId];
  if (target.kind === "background") {
    return getSceneThemeRuntimeSource(roomTheme.backgroundSrc);
  }
  if (target.kind === "panel") {
    return target.panelId === null
      ? ""
      : getSceneThemeRuntimeSource(roomTheme.panels?.[target.panelId] ?? "");
  }

  const viewDefinition = target.viewId === null ? null : (roomTheme.views?.[target.viewId] ?? null);
  return getSceneThemeRuntimeSource(
    getSceneThemeViewAssetDefault(
      viewDefinition,
      target.kind === "view-background" ? "background" : "panelArt"
    )
  );
}

function getSceneEditorAssetTargetRuntimeSource(target: ParsedSceneEditorAssetTarget): string {
  const entry = readSceneThemeAssetTargetEntry(target);
  if (entry?.sourcePath !== undefined) {
    return getSceneThemeRuntimeSource(entry.sourcePath);
  }

  return getSceneEditorAssetTargetDefaultSource(target);
}

export function getCurrentSceneThemeAssetDraft(): SceneThemeAssetDraftDocument {
  return cloneSceneThemeAssetDraft(currentSceneThemeAssetDraft);
}

export function subscribeSceneThemeAssetDraft(listener: SceneThemeAssetDraftListener): () => void {
  sceneThemeAssetDraftListeners.add(listener);
  return () => {
    sceneThemeAssetDraftListeners.delete(listener);
  };
}

export async function loadSceneThemeAssetDraft(): Promise<void> {
  let nextSavedDraft = createEmptySceneThemeAssetDraft();
  const readFile = window.electronAPI?.["readFile"] as
    ((path: string) => Promise<string | null>) | undefined;
  if (typeof readFile === "function") {
    try {
      const encoded = await readFile(getSceneThemeAssetDraftSourcePath());
      if (typeof encoded === "string" && encoded !== "") {
        nextSavedDraft = normalizeSceneThemeAssetDraftDocument(decodeBase64Json(encoded));
      }
    } catch {
      nextSavedDraft = createEmptySceneThemeAssetDraft();
    }
  }

  savedSceneThemeAssetDraft = nextSavedDraft;
  currentSceneThemeAssetDraft =
    readSceneThemeAssetDraftFromLocalStorage() ?? cloneSceneThemeAssetDraft(nextSavedDraft);
  await warmSceneThemeDefaultSources();
  await warmSceneThemeAssetDraftSources(currentSceneThemeAssetDraft);
  notifySceneThemeAssetDraftListeners();
}

function mutateSceneThemeAssetDraft(mutator: () => void): void {
  mutator();
  persistSceneThemeAssetDraftToLocalStorage();
  notifySceneThemeAssetDraftListeners();
}

export function listSceneEditorAssetTargets(
  roomId: SceneRoomId
): SceneEditorAssetTargetDescriptor[] {
  const roomTheme = getActiveSceneTheme().rooms[roomId];
  const targets: SceneEditorAssetTargetDescriptor[] = [];

  const roomBackgroundTarget = parseSceneEditorAssetTargetId(`${roomId}::background`);
  if (roomBackgroundTarget !== null) {
    const roomBackgroundEntry = readSceneThemeAssetTargetEntry(roomBackgroundTarget);
    targets.push({
      id: buildSceneEditorAssetTargetId(roomBackgroundTarget),
      roomId,
      label: "Room Background",
      sourceHint: buildSceneEditorAssetSourceHint(roomBackgroundEntry, roomTheme.backgroundSrc),
      runtimeSrc: getSceneEditorAssetTargetRuntimeSource(roomBackgroundTarget),
      hasSourceOverride: roomBackgroundEntry?.sourcePath !== undefined,
      supportsTransparentWindow: false,
      transparentWindow: roomBackgroundEntry?.transparentWindow ?? null,
    });
  }

  Object.keys(roomTheme.panels ?? {}).forEach((panelId) => {
    const target = parseSceneEditorAssetTargetId(`${roomId}::panel::${panelId}`);
    if (target === null) {
      return;
    }
    const entry = readSceneThemeAssetTargetEntry(target);
    targets.push({
      id: buildSceneEditorAssetTargetId(target),
      roomId,
      label: `${humanizeSceneAssetLabel(panelId)} Panel`,
      sourceHint: buildSceneEditorAssetSourceHint(entry, roomTheme.panels?.[panelId] ?? ""),
      runtimeSrc: getSceneEditorAssetTargetRuntimeSource(target),
      hasSourceOverride: entry?.sourcePath !== undefined,
      supportsTransparentWindow: true,
      transparentWindow: entry?.transparentWindow ?? null,
    });
  });

  Object.entries(roomTheme.views ?? {}).forEach(([viewId, viewDefinition]) => {
    if (viewDefinition.backgroundSrc !== undefined) {
      const target = parseSceneEditorAssetTargetId(`${roomId}::view::${viewId}::background`);
      if (target !== null) {
        const entry = readSceneThemeAssetTargetEntry(target);
        targets.push({
          id: buildSceneEditorAssetTargetId(target),
          roomId,
          label: `${humanizeSceneAssetLabel(viewId)} View Background`,
          sourceHint: buildSceneEditorAssetSourceHint(entry, viewDefinition.backgroundSrc),
          runtimeSrc: getSceneEditorAssetTargetRuntimeSource(target),
          hasSourceOverride: entry?.sourcePath !== undefined,
          supportsTransparentWindow: false,
          transparentWindow: entry?.transparentWindow ?? null,
        });
      }
    }

    if (viewDefinition.panelArtSrc !== undefined) {
      const target = parseSceneEditorAssetTargetId(`${roomId}::view::${viewId}::panel-art`);
      if (target !== null) {
        const entry = readSceneThemeAssetTargetEntry(target);
        targets.push({
          id: buildSceneEditorAssetTargetId(target),
          roomId,
          label: `${humanizeSceneAssetLabel(viewId)} View Surface`,
          sourceHint: buildSceneEditorAssetSourceHint(entry, viewDefinition.panelArtSrc),
          runtimeSrc: getSceneEditorAssetTargetRuntimeSource(target),
          hasSourceOverride: entry?.sourcePath !== undefined,
          supportsTransparentWindow: true,
          transparentWindow: entry?.transparentWindow ?? null,
        });
      }
    }
  });

  return targets;
}

function buildSceneThemeAssetCopyDestination(target: ParsedSceneEditorAssetTarget): string {
  const themeRoot = getSceneThemeSourceRoot();
  if (target.kind === "background") {
    return `${themeRoot}/assets/${target.roomId}/background`;
  }
  if (target.kind === "panel") {
    return `${themeRoot}/assets/${target.roomId}/panels`;
  }
  return `${themeRoot}/assets/${target.roomId}/views/${target.viewId ?? "default"}`;
}

export async function pickSceneEditorAssetTarget(targetId: string): Promise<boolean> {
  const target = parseSceneEditorAssetTargetId(targetId);
  const showOpenDialog = window.electronAPI?.["showOpenDialog"] as
    | ((options: Record<string, unknown>) => Promise<{ canceled: boolean; filePaths: string[] }>)
    | undefined;
  const copyFileTo = window.electronAPI?.["copyFileTo"] as
    | ((srcPath: string, destDir: string) => Promise<{ success?: boolean; path?: string }>)
    | undefined;
  if (target === null || typeof showOpenDialog !== "function" || typeof copyFileTo !== "function") {
    return false;
  }

  const previousDescriptor = listSceneEditorAssetTargets(target.roomId).find(
    (descriptor) => descriptor.id === targetId
  );

  const selection = await showOpenDialog({
    title: "Select scene asset",
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp", "gif"],
      },
    ],
    properties: ["openFile"],
  });

  const selectedPath = selection.filePaths[0]?.trim() ?? "";
  if (selection.canceled || selectedPath === "") {
    return false;
  }

  const destinationDir = buildSceneThemeAssetCopyDestination(target);
  const copied = await copyFileTo(selectedPath, destinationDir);
  const copiedPath =
    copied.success === true && typeof copied.path === "string"
      ? normalizeAssetSourcePath(copied.path)
      : "";
  if (copiedPath === "") {
    return false;
  }

  if (
    typeof previousDescriptor?.runtimeSrc === "string" &&
    previousDescriptor.runtimeSrc.trim() !== ""
  ) {
    invalidateSceneAlphaWindowBoundsCache(previousDescriptor.runtimeSrc);
  }
  invalidateSceneAlphaWindowBoundsCache(getSceneThemeRuntimeSource(copiedPath));
  sceneThemeAssetSourceCache.delete(copiedPath);
  await warmSceneThemeAssetRuntimeSource(copiedPath);
  const nextRuntimeSrc = getSceneThemeRuntimeSource(copiedPath);
  invalidateSceneAlphaWindowBoundsCache(nextRuntimeSrc);
  mutateSceneThemeAssetDraft(() => {
    writeSceneThemeAssetTargetEntry(target, {
      sourcePath: copiedPath,
    });
  });

  return true;
}

export function clearSceneEditorAssetTargetSource(targetId: string): void {
  const target = parseSceneEditorAssetTargetId(targetId);
  if (target === null) {
    return;
  }

  mutateSceneThemeAssetDraft(() => {
    const previous = readSceneThemeAssetTargetEntry(target);
    if (previous === undefined) {
      return;
    }

    if (previous.transparentWindow !== undefined) {
      writeSceneThemeAssetTargetEntry(target, {
        transparentWindow: previous.transparentWindow,
      });
      return;
    }

    writeSceneThemeAssetTargetEntry(target, undefined);
  });
}

export function updateSceneEditorTransparentWindow(
  targetId: string,
  transparentWindow: SceneAlphaWindowBounds | null
): void {
  const target = parseSceneEditorAssetTargetId(targetId);
  if (target === null) {
    return;
  }

  mutateSceneThemeAssetDraft(() => {
    const previous = readSceneThemeAssetTargetEntry(target);
    if (transparentWindow === null) {
      if (previous?.sourcePath !== undefined) {
        writeSceneThemeAssetTargetEntry(target, {
          sourcePath: previous.sourcePath,
        });
        return;
      }
      writeSceneThemeAssetTargetEntry(target, undefined);
      return;
    }

    writeSceneThemeAssetTargetEntry(target, {
      ...(previous?.sourcePath !== undefined ? { sourcePath: previous.sourcePath } : {}),
      transparentWindow,
    });
  });
}

export function clearSceneEditorTransparentWindow(targetId: string): void {
  updateSceneEditorTransparentWindow(targetId, null);
}

export async function detectSceneEditorTransparentWindow(targetId: string): Promise<boolean> {
  const target = parseSceneEditorAssetTargetId(targetId);
  if (target === null) {
    return false;
  }

  const descriptor = listSceneEditorAssetTargets(target.roomId).find(
    (entry) => entry.id === targetId
  );
  if (descriptor?.supportsTransparentWindow !== true || descriptor.runtimeSrc === "") {
    return false;
  }

  const bounds = await detectSceneAlphaWindowBounds(descriptor.runtimeSrc, 24);
  updateSceneEditorTransparentWindow(targetId, bounds);
  return bounds !== null;
}

export function resetSceneThemeAssetDraft(): void {
  currentSceneThemeAssetDraft = cloneSceneThemeAssetDraft(savedSceneThemeAssetDraft);
  clearSceneThemeAssetDraftFromLocalStorage();
  notifySceneThemeAssetDraftListeners();
}

export async function saveSceneThemeAssetDraftToSource(): Promise<boolean> {
  const savedPath = await FileManager.writeFileAtomic(
    getSceneThemeAssetDraftSourcePath(),
    `${JSON.stringify(currentSceneThemeAssetDraft, null, 2)}\n`,
    "utf-8"
  );
  if (savedPath === "") {
    return false;
  }

  savedSceneThemeAssetDraft = cloneSceneThemeAssetDraft(currentSceneThemeAssetDraft);
  clearSceneThemeAssetDraftFromLocalStorage();
  notifySceneThemeAssetDraftListeners();
  return true;
}

export function resolveSuggestedSceneEditorAssetTargetId(
  roomId: SceneRoomId,
  sceneLayout: SceneLayoutConfig,
  selection: SceneDebugNodeSelection
): string | null {
  if (selection === null) {
    return (
      listSceneEditorAssetTargets(roomId).find((target) => target.supportsTransparentWindow)?.id ??
      null
    );
  }

  if (selection.kind === "character") {
    return null;
  }

  const selectedObject = sceneLayout.objects.find(
    (node) => selection.kind === "object" && node.id === selection.id
  );
  if (selectedObject !== undefined) {
    return resolveSceneEditorAssetTargetIdForAction(roomId, selectedObject.action);
  }

  const selectedBack = sceneLayout.backs.find(
    (node) => selection.kind === "back" && node.id === selection.id
  );
  if (selectedBack !== undefined) {
    if ((roomId === "assistant" || roomId === "server") && selectedBack.viewId === "primary") {
      return `${roomId}::view::primary::panel-art`;
    }
    if (roomId === "analyze") {
      const panelId = selectedBack.viewId === "archive" ? "archive" : "table";
      return `${roomId}::panel::${panelId}`;
    }
  }

  return null;
}

function resolveSceneEditorAssetTargetIdForAction(
  roomId: SceneRoomId,
  action: SceneObjectAction
): string | null {
  if (action.type === "settings" && roomId === "settings" && action.panel !== null) {
    return `${roomId}::panel::${action.panel}`;
  }

  if (action.type === "screen") {
    if ((roomId === "assistant" || roomId === "server") && action.screen === "primary") {
      return `${roomId}::view::primary::panel-art`;
    }
    if (roomId === "analyze") {
      return `${roomId}::panel::${action.screen === "archive" ? "archive" : "table"}`;
    }
  }

  if (action.type === "whisper" && roomId === "entrance") {
    return `${roomId}::view::whisper::background`;
  }

  return null;
}

export function getSceneThemeAssetEntryRuntimeSource(
  roomId: SceneRoomId,
  kind: "background" | "panel" | "view-background" | "view-panel-art",
  targetId?: string
): string | null {
  const target =
    kind === "background"
      ? parseSceneEditorAssetTargetId(`${roomId}::background`)
      : kind === "panel"
        ? parseSceneEditorAssetTargetId(`${roomId}::panel::${targetId ?? ""}`)
        : kind === "view-background"
          ? parseSceneEditorAssetTargetId(`${roomId}::view::${targetId ?? ""}::background`)
          : parseSceneEditorAssetTargetId(`${roomId}::view::${targetId ?? ""}::panel-art`);
  if (target === null) {
    return null;
  }

  const runtimeSource = getSceneEditorAssetTargetRuntimeSource(target);
  return runtimeSource !== "" ? runtimeSource : null;
}

export function getSceneThemeAssetTransparentWindow(
  roomId: SceneRoomId,
  kind: "panel" | "view-panel-art",
  targetId: string
): SceneAlphaWindowBounds | null {
  const target =
    kind === "panel"
      ? parseSceneEditorAssetTargetId(`${roomId}::panel::${targetId}`)
      : parseSceneEditorAssetTargetId(`${roomId}::view::${targetId}::panel-art`);
  if (target === null) {
    return null;
  }

  return readSceneThemeAssetTargetEntry(target)?.transparentWindow ?? null;
}
