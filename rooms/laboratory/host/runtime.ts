import { createLaboratoryHostActivation } from "../shared/host/activation.js";
import {
  LABORATORY_AUDIO_FEATURE_ID as AUDIO_FEATURE_ID,
  LABORATORY_FEATURE_IDS as FEATURE_IDS,
  LABORATORY_MEDIA_FEATURE_ID as FEATURE_ID,
  LABORATORY_MEDIA_STAGES as MEDIA_STAGES,
  LABORATORY_ROOM_ID as ROOM_ID,
  cloneLaboratoryValue as clone,
  getLaboratoryFeatureProcessDir as getFeatureProcessDir,
  getLaboratoryFeatureReportDir as getFeatureReportDir,
  normalizeLaboratoryLocale as normalizeLocale,
  readNonEmptyString as asNonEmptyString,
  toLaboratoryRecord as toRecord,
} from "../shared/host/runtime-primitives.js";
import { freezeAnalysisScope } from "../shared/types/analysis-scope.js";
import { createLaboratoryHostFoundation } from "./foundation-runtimes.js";
import { createLaboratoryHostProjectRuntimes } from "./project-runtimes.js";
import { createLaboratoryHostFeatureRuntimes } from "./feature-runtimes.js";

const AUDIO_ANALYSIS_SCHEMA_VERSION = 1;
const PROJECT_SCHEMA_VERSION = 1;

type LaboratoryRecord = Record<string, unknown>;
type LaboratoryHostProjectRuntimes = ReturnType<typeof createLaboratoryHostProjectRuntimes>;
type LaboratoryHostFeatureRuntimes = ReturnType<typeof createLaboratoryHostFeatureRuntimes>;
type LaboratoryHostFoundationDeps = Parameters<typeof createLaboratoryHostFoundation>[0];
type LaboratoryHostProjectRuntimesDeps = Parameters<typeof createLaboratoryHostProjectRuntimes>[0];
type LaboratoryHostFeatureRuntimesDeps = Parameters<typeof createLaboratoryHostFeatureRuntimes>[0];
type LaboratoryHostActivationDeps = Parameters<typeof createLaboratoryHostActivation>[0];
type LaboratoryCloseoutStalenessRuntime = NonNullable<
  LaboratoryHostProjectRuntimes["stateComposition"]
>["laboratoryCloseoutStalenessRuntime"];
type LaboratoryProjectRecord = Parameters<
  LaboratoryCloseoutStalenessRuntime["markFeatureProcessStale"]
>[0];
type LaboratoryAudioAnalysisStateRuntime =
  LaboratoryHostFeatureRuntimes["processComposition"]["audioAnalysisStateRuntime"];

function toRuntimeRecord(value: unknown): LaboratoryRecord {
  return value !== null && typeof value === "object" && Array.isArray(value) === false
    ? (value as LaboratoryRecord)
    : {};
}

const runtimeRefs: {
  closeoutStaleness: LaboratoryCloseoutStalenessRuntime | null;
  processCoordination:
    | LaboratoryHostFeatureRuntimes["processComposition"]["laboratoryProcessCoordinationRuntime"]
    | null;
  projectState: LaboratoryHostFeatureRuntimes["projectState"] | null;
} = {
  closeoutStaleness: null,
  processCoordination: null,
  projectState: null,
};

let projectRuntimes: LaboratoryHostProjectRuntimes | null = null;
let featureRuntimes: LaboratoryHostFeatureRuntimes | null = null;

function requireProjectRuntimes(): LaboratoryHostProjectRuntimes {
  if (!projectRuntimes) {
    throw new Error("projectRuntimes not initialized");
  }
  return projectRuntimes;
}

function requireFeatureRuntimes(): LaboratoryHostFeatureRuntimes {
  if (!featureRuntimes) {
    throw new Error("featureRuntimes not initialized");
  }
  return featureRuntimes;
}

function requireCloseoutStaleness(): LaboratoryCloseoutStalenessRuntime {
  if (!runtimeRefs.closeoutStaleness) {
    throw new Error("closeoutStaleness not initialized");
  }
  return runtimeRefs.closeoutStaleness;
}

function normalizeAudioAnalysisModuleResult(
  ...args: Parameters<LaboratoryAudioAnalysisStateRuntime["normalizeAudioAnalysisModuleResult"]>
) {
  return requireFeatureRuntimes().processComposition.audioAnalysisStateRuntime.normalizeAudioAnalysisModuleResult(
    ...args
  );
}

function createEmptyAudioAnalysisState(): ReturnType<
  LaboratoryAudioAnalysisStateRuntime["createEmptyAudioAnalysisState"]
> {
  return requireFeatureRuntimes().processComposition.audioAnalysisStateRuntime.createEmptyAudioAnalysisState();
}

function normalizeAudioAnalysisState(
  ...args: Parameters<LaboratoryAudioAnalysisStateRuntime["normalizeAudioAnalysisState"]>
) {
  return requireFeatureRuntimes().processComposition.audioAnalysisStateRuntime.normalizeAudioAnalysisState(
    ...args
  );
}

function markFeatureProcessStale(
  project: LaboratoryProjectRecord,
  featureId: string,
  reason: string
) {
  return requireCloseoutStaleness().markFeatureProcessStale(project, featureId, reason);
}

function markFeatureReportStale(
  project: LaboratoryProjectRecord,
  featureId: string,
  reason: string
) {
  return requireCloseoutStaleness().markFeatureReportStale(project, featureId, reason);
}

function markCloseoutAsStale(
  project: LaboratoryProjectRecord,
  reason: string,
  featureIds: string[]
) {
  return requireCloseoutStaleness().markCloseoutAsStale(project, reason, featureIds);
}

function getProfileArtifactPreferenceMap(profileCapabilities: unknown): LaboratoryRecord {
  return toRuntimeRecord(toRuntimeRecord(profileCapabilities)["artifactPreferences"]);
}

const foundationDeps = {
  asNonEmptyString,
  audioFeatureId: AUDIO_FEATURE_ID,
  clone,
  defaultFeatureId: FEATURE_ID,
  getAnalysisArtifactRuntime() {
    return requireProjectRuntimes().analysisArtifact;
  },
  getProjectStateRuntime() {
    if (!runtimeRefs.projectState) {
      throw new Error("projectState not initialized");
    }
    return runtimeRefs.projectState;
  },
  normalizeLocale,
  roomId: ROOM_ID,
  toRecord,
};

const foundation = createLaboratoryHostFoundation(
  foundationDeps as unknown as LaboratoryHostFoundationDeps
);

const projectRuntimesDeps = {
  asNonEmptyString,
  audioFeatureId: AUDIO_FEATURE_ID,
  createEmptyAudioAnalysisState,
  clone,
  defaultFeatureId: FEATURE_ID,
  featureIds: FEATURE_IDS,
  foundation,
  getProfileArtifactPreferenceMap,
  getProjectStateRuntime() {
    return runtimeRefs.projectState;
  },
  markCloseoutAsStale,
  markFeatureProcessStale,
  markFeatureReportStale,
  mediaFeatureId: FEATURE_ID,
  mediaStages: MEDIA_STAGES,
  normalizeAudioAnalysisModuleResult,
  normalizeAudioAnalysisState,
  projectSchemaVersion: PROJECT_SCHEMA_VERSION,
  roomId: ROOM_ID,
  setCloseoutStalenessRuntime(
    value: NonNullable<
      LaboratoryHostProjectRuntimes["stateComposition"]
    >["laboratoryCloseoutStalenessRuntime"]
  ) {
    runtimeRefs.closeoutStaleness = value;
  },
  toRecord,
};

projectRuntimes = createLaboratoryHostProjectRuntimes(
  projectRuntimesDeps as unknown as LaboratoryHostProjectRuntimesDeps
);

const featureRuntimesDeps = {
  asNonEmptyString,
  audioAnalysisSchemaVersion: AUDIO_ANALYSIS_SCHEMA_VERSION,
  audioFeatureId: AUDIO_FEATURE_ID,
  clone,
  foundation,
  getFeatureProcessDir,
  getFeatureReportDir,
  markCloseoutAsStale,
  markFeatureProcessStale,
  markFeatureReportStale,
  mediaFeatureId: FEATURE_ID,
  normalizeAudioAnalysisModuleResult,
  normalizeAudioAnalysisState,
  projectRuntimes,
  roomId: ROOM_ID,
  setProcessCoordinationRuntime(
    value: LaboratoryHostFeatureRuntimes["processComposition"]["laboratoryProcessCoordinationRuntime"]
  ) {
    runtimeRefs.processCoordination = value;
  },
  setProjectStateRuntime(value: LaboratoryHostFeatureRuntimes["projectState"]) {
    runtimeRefs.projectState = value;
  },
  toRecord,
};

featureRuntimes = createLaboratoryHostFeatureRuntimes(
  featureRuntimesDeps as unknown as LaboratoryHostFeatureRuntimesDeps
);

export default function createLaboratoryHostRuntime() {
  const currentProjectRuntimes = requireProjectRuntimes();
  const currentFeatureRuntimes = requireFeatureRuntimes();
  async function queueInteractiveReprocess(
    _api: Record<string, unknown>,
    runtime: Record<string, unknown>,
    context: LaboratoryRecord
  ) {
    const featureId =
      asNonEmptyString(context["featureId"]) ||
      asNonEmptyString(toRecord(context["workbench"])["activeModuleId"]) ||
      FEATURE_ID;
    const nextScope = toRecord(toRecord(context["workbench"])["analysisScope"]);
    const nextModuleToggles = toRecord(toRecord(context["workbench"])["moduleToggles"]);
    if (Object.keys(nextScope).length === 0 && Object.keys(nextModuleToggles).length === 0) {
      return;
    }

    await currentProjectRuntimes.lifecycle.patchActiveProject(
      runtime as Parameters<typeof currentProjectRuntimes.lifecycle.patchActiveProject>[0],
      function (nextProject) {
        const processRecord = toRecord(
          currentProjectRuntimes.stateComposition.getFeatureProcessRecord(nextProject, featureId)
        );
        const processStatus = asNonEmptyString(processRecord["status"]) || "idle";
        if (processStatus !== "running" && processStatus !== "queued") {
          return nextProject;
        }
        const requestedAt = new Date().toISOString();
        const queuedRunId = `${featureId}-queued-${Date.now()}`;
        processRecord["queuedProcessInstance"] = {
          runId: queuedRunId,
          requestedAt,
          reason: "interactive-adjustment",
          analysisScope: freezeAnalysisScope(nextScope, queuedRunId, requestedAt),
          moduleToggles: nextModuleToggles,
        };
        currentProjectRuntimes.stateComposition.setFeatureProcessRecord(
          nextProject,
          featureId,
          processRecord
        );
        return nextProject;
      }
    );
  }
  const activationDeps = {
    createRuntimeState: foundation.bootstrap.createRuntimeState,
    emitEvent: currentProjectRuntimes.snapshot.emitEvent,
    ensureHydrated: currentProjectRuntimes.lifecycle.ensureHydrated,
    ensureRoomToolsSubscription:
      currentFeatureRuntimes.roomToolsProgress.ensureRoomToolsSubscription,
    handleMediaAction: currentFeatureRuntimes.featureAdapters.handleMediaAction,
    loadContext: foundation.bootstrap.loadContext,
    pushMediaState: currentProjectRuntimes.snapshot.pushMediaState,
    queueInteractiveReprocess,
    saveContext: foundation.bootstrap.saveContext,
    tearDownRoomToolsSubscription:
      currentFeatureRuntimes.roomToolsProgress.tearDownRoomToolsSubscription,
    toRecord,
  };

  return createLaboratoryHostActivation(activationDeps as unknown as LaboratoryHostActivationDeps);
}
