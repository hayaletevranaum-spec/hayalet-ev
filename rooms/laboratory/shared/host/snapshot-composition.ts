import { createLaboratoryProjectManifestRuntime } from "./project-manifests.js";
import { createLaboratoryRoomSnapshotRuntime } from "./room-snapshot.js";
import { createLaboratoryRuntimeEvents } from "./runtime-events.js";

type LaboratoryRecord = Record<string, unknown>;
type LaboratoryProjectManifestRuntimeDeps = Parameters<
  typeof createLaboratoryProjectManifestRuntime
>[0];
type LaboratoryRuntimeEventsDeps = Parameters<typeof createLaboratoryRuntimeEvents>[0];

type LaboratorySnapshotCompositionDeps = LaboratoryProjectManifestRuntimeDeps & {
  audioFeatureId: string;
  defaultFeatureId: string;
  featureIds: string[];
  getFeatureIdFromContext: LaboratoryRuntimeEventsDeps["getFeatureIdFromContext"];
  getFeatureProcessRecord: (project: LaboratoryRecord, featureId: string) => LaboratoryRecord;
  getFeatureReportRecord: (project: LaboratoryRecord, featureId: string) => LaboratoryRecord;
  getRuntimeToolIds: (runtime: LaboratoryRecord) => string[];
  getStageSupport: (toolManifest: LaboratoryRecord, stageId: string) => string;
  getToolManifest: (runtime: LaboratoryRecord, toolId: string) => LaboratoryRecord;
  loadContext: LaboratoryRuntimeEventsDeps["loadContext"];
  mediaFeatureId: string;
  mediaStages: string[];
  normalizeAudioAnalysisModuleResult: (
    rawValue: unknown,
    moduleId: string,
    extra: LaboratoryRecord
  ) => LaboratoryRecord;
  normalizeAudioAnalysisState: (rawValue: unknown, runtime: LaboratoryRecord) => LaboratoryRecord;
  roomId: string;
  syncProjectFeatureProjections: (runtime: LaboratoryRecord, project: LaboratoryRecord) => void;
  toFileUrl: (path: unknown) => string;
};

export function createLaboratorySnapshotCompositionRuntime(
  deps: LaboratorySnapshotCompositionDeps
) {
  const laboratoryProjectManifestRuntime = createLaboratoryProjectManifestRuntime({
    asNonEmptyString: deps.asNonEmptyString,
    asNumber: deps.asNumber,
    clone: deps.clone,
    normalizeEditOutput: deps.normalizeEditOutput,
    normalizeProcessState: deps.normalizeProcessState,
    normalizeProfileArtifact: deps.normalizeProfileArtifact,
    normalizeProfileSignal: deps.normalizeProfileSignal,
    normalizeReportState: deps.normalizeReportState,
    normalizeSourceMetadata: deps.normalizeSourceMetadata,
    projectSchemaVersion: deps.projectSchemaVersion,
    toRecord: deps.toRecord,
  });
  const {
    buildDerivedTargetSignature,
    buildEditManifest,
    buildProcessManifest,
    buildProfileManifest,
    buildReportManifest,
    buildSourceTargetSignature,
    findEditOutputById,
  } = laboratoryProjectManifestRuntime;

  const laboratoryRoomSnapshotRuntime = createLaboratoryRoomSnapshotRuntime({
    asNonEmptyString: deps.asNonEmptyString,
    clone: deps.clone,
    defaultFeatureId: deps.defaultFeatureId,
    featureIds: deps.featureIds,
    mediaStages: deps.mediaStages,
    audioFeatureId: deps.audioFeatureId,
    getFeatureProcessRecord: deps.getFeatureProcessRecord,
    getFeatureReportRecord: deps.getFeatureReportRecord,
    getRuntimeToolIds: deps.getRuntimeToolIds,
    getStageSupport: deps.getStageSupport,
    getToolManifest: deps.getToolManifest,
    mediaFeatureId: deps.mediaFeatureId,
    normalizeAudioAnalysisModuleResult: deps.normalizeAudioAnalysisModuleResult,
    normalizeAudioAnalysisState: deps.normalizeAudioAnalysisState,
    roomId: deps.roomId,
    syncProjectFeatureProjections: deps.syncProjectFeatureProjections,
    toFileUrl: deps.toFileUrl,
    toRecord: deps.toRecord,
  });

  const laboratoryRuntimeEventsDeps: LaboratoryRuntimeEventsDeps = {
    asNonEmptyString: deps.asNonEmptyString,
    defaultFeatureId: deps.defaultFeatureId,
    getFeatureIdFromContext: deps.getFeatureIdFromContext,
    loadContext: deps.loadContext,
    roomSnapshotRuntime:
      laboratoryRoomSnapshotRuntime as unknown as LaboratoryRuntimeEventsDeps["roomSnapshotRuntime"],
  };
  const laboratoryRuntimeEvents = createLaboratoryRuntimeEvents(laboratoryRuntimeEventsDeps);
  const {
    buildMediaSnapshot,
    buildSourceSnapshot,
    emitEvent,
    isSourceCompatibleAction,
    notifyRoom,
    pushActionResult,
    pushJobState,
    pushMediaState,
    pushSourceState,
  } = laboratoryRuntimeEvents;

  return {
    buildDerivedTargetSignature,
    buildEditManifest,
    buildMediaSnapshot,
    buildProcessManifest,
    buildProfileManifest,
    buildReportManifest,
    buildSourceSnapshot,
    buildSourceTargetSignature,
    emitEvent,
    findEditOutputById,
    isSourceCompatibleAction,
    laboratoryRoomSnapshotRuntime,
    notifyRoom,
    pushActionResult,
    pushJobState,
    pushMediaState,
    pushSourceState,
  };
}
