import {
  createLaboratoryWorkbenchState,
  normalizeLaboratoryFeatureId,
} from "./runtime-primitives.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryContextRecord = LaboratoryRecord & {
  activeFeature?: unknown;
  feature?: unknown;
  featureId?: unknown;
  locale?: unknown;
  presence?: unknown;
  presentation?: unknown;
  room?: unknown;
  roomId?: unknown;
  slots?: unknown;
  translations?: unknown;
  user?: unknown;
  workbench?: unknown;
};

type LaboratoryContextRoomRecord = LaboratoryRecord & {
  name?: unknown;
};

type LaboratoryContextUserRecord = LaboratoryRecord & {
  nickname?: unknown;
};

type LaboratoryContextPresentationRecord = LaboratoryRecord & {
  mode?: unknown;
  uiScale?: unknown;
};

type LaboratoryActiveFeatureRecord = LaboratoryRecord & {
  id?: unknown;
};

type LaboratoryWorkbenchRecord = LaboratoryRecord & {
  activeModuleId?: unknown;
};

type LaboratoryRoomApi = {
  getLocale: () => string;
  getState: (key: string) => unknown;
  setState: (key: string, value: unknown) => void;
};

type LaboratoryToolEntry = {
  binaryPath: string | null;
  busy: boolean;
  companionPaths: LaboratoryRecord;
  installDir: string | null;
  installed: boolean;
  lastCheckedAt: string | number | null;
  lastError: string | null;
  latestReleaseName: string | null;
  latestReleaseTag: string | null;
  latestVersion: string | null;
  releaseName: string | null;
  releaseTag: string | null;
  releaseUrl: string | null;
  toolId: string;
  updateAvailable: boolean;
  version: string | null;
};

type LaboratoryToolState = {
  schemaVersion: number;
  tools: Record<string, LaboratoryToolEntry>;
  updatedAt: string | number | null;
};

type LaboratoryProfileModelEntry = {
  busy: boolean;
  checksumSha1: string | null;
  checksumValid: boolean;
  expectedBytes: number | null;
  expectedSha1: string | null;
  fileName: string | null;
  installed: boolean;
  lastError: string | null;
  lastVerifiedAt: string | number | null;
  modelId: string;
  path: string | null;
  sizeBytes: number | null;
};

type LaboratoryProfileModelState = {
  activeLanguage: string | null;
  activeModelId: string | null;
  activeVariant: string | null;
  models: Record<string, LaboratoryProfileModelEntry>;
  schemaVersion: number;
  updatedAt: string | number | null;
};

type LaboratoryBootstrapStepState = {
  id: string;
  status: "pending" | "active" | "done" | "error";
};

type LaboratoryBootstrapState = {
  active: boolean;
  currentStep: number;
  currentStepId: string | null;
  error: string | null;
  message: string | null;
  status: "idle" | "running" | "ready" | "error";
  steps: LaboratoryBootstrapStepState[];
  totalSteps: number;
};

type LaboratoryToolManifestRecord = LaboratoryRecord & {
  stageSupport?: unknown;
};

type LaboratoryRuntimeState = {
  activeProjectId: string | null;
  audioAnalysisCapabilities: unknown;
  audioAnalysisCatalog: unknown;
  audioAnalysisPresets: unknown;
  audioAnalysisProviders: unknown;
  bootstrap: LaboratoryBootstrapState;
  editCapabilities: unknown;
  editPresets: unknown;
  hydrated: boolean;
  hydrating: Promise<void> | null;
  jobs: Record<string, unknown>;
  packageToolsDir: string | null;
  paths: LaboratoryRecord | null;
  profileCapabilities: unknown;
  profileModelState: LaboratoryProfileModelState;
  profileModels: unknown;
  profilePresets: unknown;
  projectSchema: unknown;
  projects: LaboratoryRecord[];
  roomToolsProgressHandler: unknown;
  roomToolsSubscribed: boolean;
  sourcePresets: unknown;
  toolState: LaboratoryToolState;
  toolchainManifest: LaboratoryRecord | null;
  visualAnalysisCapabilities: unknown;
  visualAnalysisCatalog: unknown;
  visualAnalysisProviders: unknown;
  ytDlpForm: unknown;
};

type LaboratoryContext = {
  featureId: string;
  locale: string;
  presence: {
    user: {
      nickname: string;
    };
    slots: LaboratoryRecord;
  };
  presentation: {
    mode: "classic" | "scene-view";
    uiScale: number;
  };
  room: {
    id: string;
    name: string;
  };
  roomId: string;
  slots: LaboratoryRecord;
  translations: LaboratoryRecord;
  user: {
    nickname: string;
  };
  workbench: ReturnType<typeof createLaboratoryWorkbenchState>;
};

type LaboratoryRuntimeBootstrapDeps = {
  defaultFeatureId: string;
  normalizeLocale: (value: string) => string;
  roomId: string;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryRuntimeBootstrap(deps: LaboratoryRuntimeBootstrapDeps) {
  const { defaultFeatureId, normalizeLocale, roomId, toRecord } = deps;

  function toContextRecord(value: unknown): LaboratoryContextRecord {
    return toRecord(value);
  }

  function toRoomRecord(value: unknown): LaboratoryContextRoomRecord {
    return toRecord(value);
  }

  function toUserRecord(value: unknown): LaboratoryContextUserRecord {
    return toRecord(value);
  }

  function toPresentationRecord(value: unknown): LaboratoryContextPresentationRecord {
    return toRecord(value);
  }

  function toActiveFeatureRecord(value: unknown): LaboratoryActiveFeatureRecord {
    return toRecord(value);
  }

  function toToolManifestRecord(value: unknown): LaboratoryToolManifestRecord {
    return toRecord(value);
  }

  function toWorkbenchRecord(value: unknown): LaboratoryWorkbenchRecord {
    return toRecord(value);
  }

  function asNonEmptyString(value: unknown): string | null {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  }

  function normalizeUiScale(value: unknown): number {
    const numeric =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number.parseInt(value, 10)
          : Number.NaN;
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 100;
    }
    return Math.max(70, Math.min(130, Math.round(numeric)));
  }

  function sanitizeContext(payload: unknown, api: LaboratoryRoomApi): LaboratoryContext {
    const source = toContextRecord(payload);
    const room = toRoomRecord(source.room);
    const presence = toRecord(source.presence);
    const user = toUserRecord(presence["user"]);
    const presentation = toPresentationRecord(source.presentation);
    const translations = toRecord(source.translations);
    const slots = toRecord(presence["slots"]);
    const activeFeature = toActiveFeatureRecord(source.activeFeature);
    const workbenchSource = toWorkbenchRecord(source.workbench);
    const normalizedFeatureId = normalizeLaboratoryFeatureId(
      asNonEmptyString(workbenchSource.activeModuleId) ||
        asNonEmptyString(activeFeature.id) ||
        asNonEmptyString(source.featureId) ||
        asNonEmptyString(source.feature) ||
        defaultFeatureId,
      defaultFeatureId
    );
    const workbench = createLaboratoryWorkbenchState({
      ...workbenchSource,
      primaryFeatureId: defaultFeatureId,
      activeModuleId: normalizedFeatureId,
    });

    const normalizedUser = {
      nickname: asNonEmptyString(user.nickname) || "Operator",
    };

    return {
      room: {
        id: roomId,
        name: asNonEmptyString(room.name) || "Laboratory",
      },
      user: normalizedUser,
      presence: {
        user: { ...normalizedUser },
        slots: { ...slots },
      },
      presentation: {
        mode: presentation.mode === "scene-view" ? "scene-view" : "classic",
        uiScale: normalizeUiScale(presentation.uiScale),
      },
      locale: normalizeLocale(asNonEmptyString(source.locale) || api.getLocale()),
      translations,
      slots,
      roomId: asNonEmptyString(source.roomId) || roomId,
      featureId: workbench.activeModuleId,
      workbench,
    };
  }

  function loadContext(api: LaboratoryRoomApi): LaboratoryContext {
    return sanitizeContext(api.getState("context"), api);
  }

  function saveContext(api: LaboratoryRoomApi, payload: unknown): LaboratoryContext {
    const nextContext = sanitizeContext(payload, api);
    api.setState("context", nextContext);
    return nextContext;
  }

  function getFeatureIdFromContext(context: unknown): string {
    const source = toContextRecord(context);
    const featureId =
      asNonEmptyString(toWorkbenchRecord(source.workbench).activeModuleId) ||
      asNonEmptyString(source.featureId);
    return normalizeLaboratoryFeatureId(featureId, defaultFeatureId);
  }

  function createDefaultToolEntry(toolId: string): LaboratoryToolEntry {
    return {
      toolId,
      installed: false,
      version: null,
      binaryPath: null,
      releaseTag: null,
      releaseName: null,
      installDir: null,
      companionPaths: {},
      latestVersion: null,
      latestReleaseTag: null,
      latestReleaseName: null,
      releaseUrl: null,
      updateAvailable: false,
      busy: false,
      lastCheckedAt: null,
      lastError: null,
    };
  }

  function createDefaultToolState(toolIds: unknown): LaboratoryToolState {
    const ids = Array.isArray(toolIds) ? toolIds : [];
    const tools: Record<string, LaboratoryToolEntry> = {};
    ids.forEach(function (toolId) {
      const id = asNonEmptyString(toolId);
      if (id !== null) {
        tools[id] = createDefaultToolEntry(id);
      }
    });

    return {
      schemaVersion: 1,
      updatedAt: null,
      tools,
    };
  }

  function createDefaultProfileModelEntry(modelId: string): LaboratoryProfileModelEntry {
    return {
      modelId,
      installed: false,
      fileName: null,
      path: null,
      sizeBytes: null,
      checksumSha1: null,
      checksumValid: false,
      expectedBytes: null,
      expectedSha1: null,
      busy: false,
      lastVerifiedAt: null,
      lastError: null,
    };
  }

  function getToolManifestMap(
    runtime: Pick<LaboratoryRuntimeState, "toolchainManifest">
  ): Record<string, LaboratoryToolManifestRecord> {
    const tools = toRecord(toRecord(runtime.toolchainManifest)["tools"]);
    return Object.fromEntries(
      Object.entries(tools).map(function ([toolId, manifest]) {
        return [toolId, toToolManifestRecord(manifest)];
      })
    );
  }

  function getRuntimeToolIds(runtime: Pick<LaboratoryRuntimeState, "toolchainManifest">): string[] {
    return Object.keys(getToolManifestMap(runtime));
  }

  function getToolManifest(
    runtime: Pick<LaboratoryRuntimeState, "toolchainManifest">,
    toolId: string
  ): LaboratoryToolManifestRecord {
    return toToolManifestRecord(getToolManifestMap(runtime)[toolId]);
  }

  function getStageSupport(toolManifest: unknown, stageId: string): string {
    const stageSupport = toRecord(toToolManifestRecord(toolManifest).stageSupport);
    return asNonEmptyString(stageSupport[stageId]) || "unsupported";
  }

  function createBootstrapState(): LaboratoryBootstrapState {
    return {
      active: false,
      currentStep: 0,
      currentStepId: null,
      error: null,
      message: null,
      status: "idle",
      steps: [],
      totalSteps: 0,
    };
  }

  function createRuntimeState(): LaboratoryRuntimeState {
    return {
      bootstrap: createBootstrapState(),
      hydrated: false,
      hydrating: null,
      paths: null,
      packageToolsDir: null,
      toolchainManifest: null,
      sourcePresets: null,
      projectSchema: null,
      ytDlpForm: null,
      editPresets: null,
      editCapabilities: null,
      profilePresets: null,
      profileCapabilities: null,
      profileModels: null,
      visualAnalysisCatalog: null,
      visualAnalysisCapabilities: null,
      visualAnalysisProviders: null,
      audioAnalysisCatalog: null,
      audioAnalysisCapabilities: null,
      audioAnalysisPresets: null,
      audioAnalysisProviders: null,
      projects: [],
      activeProjectId: null,
      toolState: createDefaultToolState([]),
      profileModelState: {
        activeLanguage: null,
        activeModelId: null,
        activeVariant: null,
        schemaVersion: 1,
        updatedAt: null,
        models: {},
      },
      jobs: {},
      roomToolsSubscribed: false,
      roomToolsProgressHandler: null,
    };
  }

  return {
    createBootstrapState,
    createDefaultProfileModelEntry,
    createDefaultToolEntry,
    createDefaultToolState,
    createRuntimeState,
    getFeatureIdFromContext,
    getRuntimeToolIds,
    getStageSupport,
    getToolManifest,
    loadContext,
    sanitizeContext,
    saveContext,
  };
}
