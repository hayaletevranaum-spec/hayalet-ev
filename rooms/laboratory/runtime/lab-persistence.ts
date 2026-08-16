import type { LabPersistedState } from "../domain/lab-types.js";

const LAB_PERSISTENCE_KEY = "hayalet-ev:laboratory-refactor:v4";
const LAB_LEGACY_PERSISTENCE_KEYS = [
  "hayalet-ev:laboratory-refactor:v3",
  "hayalet-ev:laboratory-refactor:v2",
];

type PersistenceWindow = Window & typeof globalThis;

let lastPersistedStorage: Storage | null = null;
let lastPersistedSerializedValue: string | null = null;
let pendingPersistWindow: PersistenceWindow | null = null;
let pendingPersistState: LabPersistedState | null = null;
let pendingPersistIdleCallback: number | null = null;
let persistenceUnloadWindow: PersistenceWindow | null = null;

function getStorage(windowRef: PersistenceWindow | undefined) {
  try {
    return windowRef?.localStorage ?? null;
  } catch {
    return null;
  }
}

function persistLabStateNow(windowRef: PersistenceWindow | undefined, state: LabPersistedState) {
  const storage = getStorage(windowRef);
  if (!storage) {
    return;
  }

  try {
    const persistedForBoot = sanitizeBootPersistedState({
      ...state,
      schemaVersion: 4,
    });
    const serialized = JSON.stringify(persistedForBoot);
    if (lastPersistedStorage === storage && lastPersistedSerializedValue === serialized) {
      return;
    }
    storage.setItem(LAB_PERSISTENCE_KEY, serialized);
    lastPersistedStorage = storage;
    lastPersistedSerializedValue = serialized;
  } catch {
    // NOTE: Persistence is best-effort only.
  }
}

function clearPendingIdleCallback(windowRef: PersistenceWindow | null) {
  if (pendingPersistIdleCallback === null) {
    return;
  }
  if (windowRef && typeof windowRef.cancelIdleCallback === "function") {
    windowRef.cancelIdleCallback(pendingPersistIdleCallback);
  }
  pendingPersistIdleCallback = null;
}

function flushPendingPersistence() {
  const windowRef = pendingPersistWindow;
  const state = pendingPersistState;
  clearPendingIdleCallback(windowRef);
  pendingPersistWindow = null;
  pendingPersistState = null;
  if (windowRef === null || state === null) {
    return;
  }
  persistLabStateNow(windowRef, state);
}

function bindPersistenceUnloadFlush(windowRef: PersistenceWindow) {
  if (persistenceUnloadWindow === windowRef || typeof windowRef.addEventListener !== "function") {
    return;
  }
  persistenceUnloadWindow = windowRef;
  windowRef.addEventListener("beforeunload", flushPendingPersistence);
}

function canDeferPersistence(
  windowRef: PersistenceWindow | undefined
): windowRef is PersistenceWindow {
  return Boolean(windowRef && typeof windowRef.requestIdleCallback === "function");
}

export function loadLabPersistedState(windowRef: PersistenceWindow | undefined) {
  const storage = getStorage(windowRef);
  if (!storage) {
    return null;
  }

  try {
    const candidateKeys = [LAB_PERSISTENCE_KEY].concat(LAB_LEGACY_PERSISTENCE_KEYS);
    for (const key of candidateKeys) {
      const rawValue = storage.getItem(key);
      if (!rawValue) {
        continue;
      }
      const parsed = JSON.parse(rawValue) as Partial<LabPersistedState> & {
        schemaVersion?: unknown;
      };
      const migrated = migratePersistedState(parsed);
      const serialized = JSON.stringify(migrated);
      if (key !== LAB_PERSISTENCE_KEY) {
        storage.setItem(LAB_PERSISTENCE_KEY, serialized);
      }
      lastPersistedStorage = storage;
      lastPersistedSerializedValue = serialized;
      return migrated;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLabPersistedState(
  windowRef: PersistenceWindow | undefined,
  state: LabPersistedState
) {
  if (!canDeferPersistence(windowRef)) {
    persistLabStateNow(windowRef, state);
    return;
  }

  if (pendingPersistWindow !== null && pendingPersistWindow !== windowRef) {
    flushPendingPersistence();
  }
  pendingPersistWindow = windowRef;
  pendingPersistState = state;
  bindPersistenceUnloadFlush(windowRef);
  if (pendingPersistIdleCallback !== null) {
    return;
  }
  pendingPersistIdleCallback = windowRef.requestIdleCallback(
    function () {
      pendingPersistIdleCallback = null;
      flushPendingPersistence();
    },
    { timeout: 1200 }
  );
}

function migratePersistedState(
  persisted: Partial<LabPersistedState> & { schemaVersion?: unknown }
): Partial<LabPersistedState> {
  return sanitizeBootPersistedState({
    ...persisted,
    schemaVersion: 4,
    activityFeed: Array.isArray(persisted.activityFeed) ? persisted.activityFeed : [],
    selectedCapabilities: Array.isArray(persisted.selectedCapabilities)
      ? persisted.selectedCapabilities
      : [],
    activePreviewArtifactId:
      typeof persisted.activePreviewArtifactId === "string"
        ? persisted.activePreviewArtifactId
        : null,
    liveFindingsExpanded: persisted.liveFindingsExpanded !== false,
    analysisControlsCollapsed: persisted.analysisControlsCollapsed === true,
    editSidePanelCollapsed: persisted.editSidePanelCollapsed === true,
    rawLogCollapsed: persisted.rawLogCollapsed !== false,
  });
}

function sanitizeWorkspaceForBoot(
  workspace: Partial<LabPersistedState>["workspace"]
): Partial<NonNullable<LabPersistedState["workspace"]>> | undefined {
  if (!workspace || typeof workspace !== "object") {
    return undefined;
  }

  const source = workspace as Record<string, unknown>;
  const next: Partial<NonNullable<LabPersistedState["workspace"]>> = {};

  if (typeof source["previewVolume"] === "number") {
    next.previewVolume = source["previewVolume"];
  }
  if (
    source["interactiveSettings"] &&
    typeof source["interactiveSettings"] === "object" &&
    Array.isArray(source["interactiveSettings"]) === false
  ) {
    next.interactiveSettings = source["interactiveSettings"] as NonNullable<
      NonNullable<LabPersistedState["workspace"]>["interactiveSettings"]
    >;
  }
  if (
    source["comparisonInteractiveSettings"] &&
    typeof source["comparisonInteractiveSettings"] === "object" &&
    Array.isArray(source["comparisonInteractiveSettings"]) === false
  ) {
    next.comparisonInteractiveSettings = source["comparisonInteractiveSettings"] as NonNullable<
      NonNullable<LabPersistedState["workspace"]>["comparisonInteractiveSettings"]
    >;
  }
  if (
    source["audioFocus"] &&
    typeof source["audioFocus"] === "object" &&
    Array.isArray(source["audioFocus"]) === false
  ) {
    next.audioFocus = source["audioFocus"] as NonNullable<
      NonNullable<LabPersistedState["workspace"]>["audioFocus"]
    >;
  }
  if (typeof source["controlsDrawerOpen"] === "boolean") {
    next.controlsDrawerOpen = source["controlsDrawerOpen"];
  }
  if (
    source["controlsDrawerTab"] === "visual" ||
    source["controlsDrawerTab"] === "audio" ||
    source["controlsDrawerTab"] === "operations"
  ) {
    next.controlsDrawerTab = source["controlsDrawerTab"] as NonNullable<
      NonNullable<LabPersistedState["workspace"]>["controlsDrawerTab"]
    >;
  }
  if (typeof source["preflightAutoRunEnabled"] === "boolean") {
    next.preflightAutoRunEnabled = source["preflightAutoRunEnabled"];
  }
  if (typeof source["drawerCollapsed"] === "boolean") {
    next.drawerCollapsed = source["drawerCollapsed"];
  }
  if (typeof source["inspectorPinned"] === "boolean") {
    next.inspectorPinned = source["inspectorPinned"];
  }
  if (
    source["activeIconRailSlot"] === "roi-select" ||
    source["activeIconRailSlot"] === "audio-focus" ||
    source["activeIconRailSlot"] === "frame-export" ||
    source["activeIconRailSlot"] === "denoise" ||
    source["activeIconRailSlot"] === "stabilize" ||
    source["activeIconRailSlot"] === "visual-adjust" ||
    source["activeIconRailSlot"] === "clip-export" ||
    source["activeIconRailSlot"] === "enhanced-frame" ||
    source["activeIconRailSlot"] === "image-comparison" ||
    source["activeIconRailSlot"] === "before-after" ||
    source["activeIconRailSlot"] === "audio-extract" ||
    source["activeIconRailSlot"] === "band-pass" ||
    source["activeIconRailSlot"] === "stem-separate"
  ) {
    next.activeIconRailSlot = source["activeIconRailSlot"] as NonNullable<
      NonNullable<LabPersistedState["workspace"]>["activeIconRailSlot"]
    >;
  }

  return next;
}

function sanitizeSourceForBoot(
  source: Partial<LabPersistedState>["source"]
): LabPersistedState["source"] {
  if (!source || typeof source !== "object") {
    return null;
  }
  const record = source as Record<string, unknown>;
  const previewUrl =
    typeof record["previewUrl"] === "string" && record["previewUrl"].trim() !== ""
      ? record["previewUrl"].trim()
      : null;
  if (previewUrl === null || record["status"] !== "ready") {
    return null;
  }
  return source;
}

function sanitizeBootPersistedState(
  persisted: Partial<LabPersistedState>
): Partial<LabPersistedState> {
  const workspace = sanitizeWorkspaceForBoot(persisted.workspace);
  const source = sanitizeSourceForBoot(persisted.source);
  const next: Partial<LabPersistedState> = {
    ...persisted,
    selectedCapabilities: [],
    projectIndex: {
      activeProjectId: null,
      projects: [],
    },
    workbench: {},
    source,
    sourceProbeStatus:
      source !== null && persisted.sourceProbeStatus === "completed" ? "completed" : "idle",
    editConfig: null,
    profileConfig: null,
    preflight: null,
    lastRun: null,
    reports: {
      user: null,
      ai: null,
      emptyReason: "Rapor henüz üretilmedi.",
    },
    reportExports: [],
    assets: [],
    profileModels: [],
    toolState: {},
    activityFeed: [],
    activePreviewArtifactId: null,
  };
  if (workspace !== undefined) {
    next.workspace = workspace;
  }
  return next;
}
