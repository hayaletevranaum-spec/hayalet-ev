import {
  getProjectDir,
  getProjectEditManifestPath,
  getProjectMetaPath,
  getProjectProcessManifestPath,
  getProjectProfileDir,
  getProjectProfileManifestPath,
  getProjectProfilePreflightDir,
  getProjectReportManifestPath,
} from "../shared/host/project-paths.js";
import { createLaboratoryProjectLifecycleRuntime } from "../shared/host/project-lifecycle.js";
import { createLaboratoryAnalysisArtifactRuntime } from "../shared/host/analysis-artifact-runtime.js";
import { createLaboratoryJobRuntime } from "../shared/host/job-runtime.js";
import { createLaboratorySnapshotCompositionRuntime } from "../shared/host/snapshot-composition.js";
import { createLaboratoryHostStateCompositionRuntime } from "../shared/host/state-composition.js";
import { createLaboratoryJobStateRuntime } from "../shared/host/job-state.js";
import { createMediaProfileModelRuntime } from "../features/media-analysis/host/profile-models.js";
import { createMediaProfileProjectionRuntime } from "../features/media-analysis/host/profile-projection.js";
import { createMediaProfileStateRuntime } from "../features/media-analysis/host/profile-state.js";
import type { createLaboratoryHostFoundation } from "./foundation-runtimes.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryHostFoundationRuntime = ReturnType<typeof createLaboratoryHostFoundation>;
type LaboratoryHostProjectStateComposition = ReturnType<
  typeof createLaboratoryHostStateCompositionRuntime
>;

type LaboratoryHostProjectRuntimesDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  audioFeatureId: string;
  createEmptyAudioAnalysisState: () => unknown;
  clone: (value: unknown) => unknown;
  defaultFeatureId: string;
  featureIds: string[];
  foundation: LaboratoryHostFoundationRuntime;
  getProfileArtifactPreferenceMap: (profileCapabilities: unknown) => LaboratoryRecord;
  getProjectStateRuntime: () => unknown;
  markCloseoutAsStale: (project: LaboratoryRecord, reason: string, featureIds: string[]) => unknown;
  markFeatureProcessStale: (
    project: LaboratoryRecord,
    featureId: string,
    reason: string
  ) => unknown;
  markFeatureReportStale: (project: LaboratoryRecord, featureId: string, reason: string) => unknown;
  mediaFeatureId: string;
  mediaStages: string[];
  normalizeAudioAnalysisModuleResult: (
    rawValue: unknown,
    moduleId: string,
    catalogEntry: unknown
  ) => unknown;
  normalizeAudioAnalysisState: (rawValue: unknown, runtime: unknown) => unknown;
  projectSchemaVersion: number;
  roomId: string;
  setCloseoutStalenessRuntime: (
    value: LaboratoryHostProjectStateComposition["laboratoryCloseoutStalenessRuntime"]
  ) => void;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryHostProjectRuntimes(deps: LaboratoryHostProjectRuntimesDeps) {
  const { foundation } = deps;
  const { bootstrap, hostUtils, io, preset, profileModelState } = foundation;

  let stateComposition: LaboratoryHostProjectStateComposition | null = null;

  function requireStateComposition(): LaboratoryHostProjectStateComposition {
    if (!stateComposition) {
      throw new Error("stateComposition not initialized");
    }
    return stateComposition;
  }

  const snapshotDeps = {
    asNonEmptyString: deps.asNonEmptyString,
    asNumber: preset.asNumber,
    audioFeatureId: deps.audioFeatureId,
    clone: deps.clone,
    defaultFeatureId: deps.defaultFeatureId,
    featureIds: deps.featureIds,
    getFeatureIdFromContext: bootstrap.getFeatureIdFromContext,
    getFeatureProcessRecord(
      ...args: Parameters<LaboratoryHostProjectStateComposition["getFeatureProcessRecord"]>
    ) {
      return requireStateComposition().getFeatureProcessRecord(...args);
    },
    getFeatureReportRecord(
      ...args: Parameters<LaboratoryHostProjectStateComposition["getFeatureReportRecord"]>
    ) {
      return requireStateComposition().getFeatureReportRecord(...args);
    },
    getRuntimeToolIds: bootstrap.getRuntimeToolIds,
    getStageSupport: bootstrap.getStageSupport,
    getToolManifest: bootstrap.getToolManifest,
    loadContext: bootstrap.loadContext,
    mediaFeatureId: deps.mediaFeatureId,
    mediaStages: deps.mediaStages,
    normalizeAudioAnalysisModuleResult: deps.normalizeAudioAnalysisModuleResult,
    normalizeAudioAnalysisState: deps.normalizeAudioAnalysisState,
    normalizeEditOutput: preset.normalizeEditOutput,
    normalizeProcessState(
      rawValue: Parameters<
        LaboratoryHostProjectStateComposition["laboratoryProjectStateDelegatesRuntime"]["normalizeProjectProcessState"]
      >[0]
    ) {
      return requireStateComposition().laboratoryProjectStateDelegatesRuntime.normalizeProjectProcessState(
        rawValue
      );
    },
    normalizeProfileArtifact(
      rawValue: Parameters<
        LaboratoryHostProjectStateComposition["laboratoryProjectStateDelegatesRuntime"]["normalizeProjectProfileArtifact"]
      >[0]
    ) {
      return requireStateComposition().laboratoryProjectStateDelegatesRuntime.normalizeProjectProfileArtifact(
        rawValue
      );
    },
    normalizeProfileSignal(
      rawValue: Parameters<
        LaboratoryHostProjectStateComposition["laboratoryProjectStateDelegatesRuntime"]["normalizeProjectProfileSignal"]
      >[0]
    ) {
      return requireStateComposition().laboratoryProjectStateDelegatesRuntime.normalizeProjectProfileSignal(
        rawValue
      );
    },
    normalizeReportState(
      rawValue: Parameters<
        LaboratoryHostProjectStateComposition["laboratoryProjectStateDelegatesRuntime"]["normalizeProjectReportState"]
      >[0]
    ) {
      return requireStateComposition().laboratoryProjectStateDelegatesRuntime.normalizeProjectReportState(
        rawValue
      );
    },
    normalizeSourceMetadata: preset.normalizeSourceMetadata,
    projectSchemaVersion: deps.projectSchemaVersion,
    roomId: deps.roomId,
    syncProjectFeatureProjections(
      ...args: Parameters<
        LaboratoryHostProjectStateComposition["laboratoryProjectStateDelegatesRuntime"]["syncProjectFeatureProjections"]
      >
    ) {
      return requireStateComposition().laboratoryProjectStateDelegatesRuntime.syncProjectFeatureProjections(
        ...args
      );
    },
    toFileUrl: hostUtils.toFileUrl,
    toRecord: deps.toRecord,
  };
  const snapshot = createLaboratorySnapshotCompositionRuntime(
    snapshotDeps as unknown as Parameters<typeof createLaboratorySnapshotCompositionRuntime>[0]
  );

  const jobState = createLaboratoryJobStateRuntime({
    cancelRoomTool: io.cancelRoomTool,
    roomId: deps.roomId,
  });

  const lifecycleDeps = {
    asNonEmptyString: deps.asNonEmptyString,
    buildEditManifest: snapshot.buildEditManifest,
    buildProcessManifest: snapshot.buildProcessManifest,
    buildProfileManifest: snapshot.buildProfileManifest,
    buildReportManifest: snapshot.buildReportManifest,
    callRoomTools: io.callRoomTools,
    cancelJobsForProject: jobState.cancelJobsForProject,
    clone: deps.clone,
    createDefaultProfileModelEntry: bootstrap.createDefaultProfileModelEntry,
    createDefaultToolEntry: bootstrap.createDefaultToolEntry,
    createDefaultToolState: bootstrap.createDefaultToolState,
    createProjectRecord(
      ...args: Parameters<
        LaboratoryHostProjectStateComposition["laboratoryProjectRecordsRuntime"]["createProjectRecord"]
      >
    ) {
      return requireStateComposition().laboratoryProjectRecordsRuntime.createProjectRecord(...args);
    },
    defaultFeatureId: deps.defaultFeatureId,
    ensureProjectDirectories: io.ensureProjectDirectories,
    findProject(
      ...args: Parameters<
        LaboratoryHostProjectStateComposition["laboratoryProjectRecordsRuntime"]["findProject"]
      >
    ) {
      return requireStateComposition().laboratoryProjectRecordsRuntime.findProject(...args);
    },
    getActiveProject(
      ...args: Parameters<
        LaboratoryHostProjectStateComposition["laboratoryProjectRecordsRuntime"]["getActiveProject"]
      >
    ) {
      return requireStateComposition().laboratoryProjectRecordsRuntime.getActiveProject(...args);
    },
    getFeatureIdFromContext: bootstrap.getFeatureIdFromContext,
    getProjectDir,
    getProjectEditManifestPath,
    getProjectMetaPath,
    getProjectProcessManifestPath,
    getProjectProfileManifestPath,
    getProjectReportManifestPath,
    getRuntimeToolIds: bootstrap.getRuntimeToolIds,
    listDirectory: io.listDirectory,
    loadContext: bootstrap.loadContext,
    pushBootstrapState: snapshot.pushMediaState,
    normalizeProject(
      ...args: Parameters<
        LaboratoryHostProjectStateComposition["laboratoryProjectRecordsRuntime"]["normalizeProject"]
      >
    ) {
      return requireStateComposition().laboratoryProjectRecordsRuntime.normalizeProject(...args);
    },
    readJsonFile: io.readJsonFile,
    refreshProfileModelState: profileModelState.reloadProfileModelState,
    roomId: deps.roomId,
    syncProjectFeatureProjections(
      ...args: Parameters<
        LaboratoryHostProjectStateComposition["laboratoryProjectStateDelegatesRuntime"]["syncProjectFeatureProjections"]
      >
    ) {
      return requireStateComposition().laboratoryProjectStateDelegatesRuntime.syncProjectFeatureProjections(
        ...args
      );
    },
    toRecord: deps.toRecord,
    updateProjectTimestamps(
      ...args: Parameters<
        LaboratoryHostProjectStateComposition["laboratoryProjectRecordsRuntime"]["updateProjectTimestamps"]
      >
    ) {
      return requireStateComposition().laboratoryProjectRecordsRuntime.updateProjectTimestamps(
        ...args
      );
    },
    writeJsonFile: io.writeJsonFile,
  };
  const lifecycle = createLaboratoryProjectLifecycleRuntime(
    lifecycleDeps as unknown as Parameters<typeof createLaboratoryProjectLifecycleRuntime>[0]
  );

  const mediaProfileModelDeps = {
    asNonEmptyString: deps.asNonEmptyString,
    asNumber: preset.asNumber,
    callRoomTools: io.callRoomTools,
    clearJob: jobState.clearJob,
    createDefaultProfileModelEntry: bootstrap.createDefaultProfileModelEntry,
    digestSha1: io.digestSha1,
    ensureRuntimeDirectory: io.ensureRuntimeDirectory,
    getActiveProject(
      ...args: Parameters<
        LaboratoryHostProjectStateComposition["laboratoryProjectRecordsRuntime"]["getActiveProject"]
      >
    ) {
      return requireStateComposition().laboratoryProjectRecordsRuntime.getActiveProject(...args);
    },
    getProfileModelDescriptor: profileModelState.readProfileModelDescriptor,
    getProfileModelDescriptorMap: profileModelState.readProfileModelDescriptorMap,
    getStageSupport: bootstrap.getStageSupport,
    getToolManifest: bootstrap.getToolManifest,
    listDirectory: io.listDirectory,
    listSharedTranscriptModels: io.listSharedTranscriptModels,
    persistProfileModelState: profileModelState.saveProfileModelState,
    pushJobState: snapshot.pushJobState,
    readBinaryFileBytes: io.readBinaryFileBytes,
    readSharedTranscriptStatus: io.readSharedTranscriptStatus,
    refreshProfileModelState: profileModelState.reloadProfileModelState,
    registerJob: jobState.registerJob,
    roomId: deps.roomId,
    toRecord: deps.toRecord,
    updateProfileModelBusy: profileModelState.updateProfileModelBusy,
    updateProfileModelEntry: profileModelState.updateProfileModelEntry,
  };
  const mediaProfileModel = createMediaProfileModelRuntime(
    mediaProfileModelDeps as unknown as Parameters<typeof createMediaProfileModelRuntime>[0]
  );

  const mediaProfileStateDeps = {
    asNonEmptyString: deps.asNonEmptyString,
    asNumber: preset.asNumber,
    clampNumber: hostUtils.clampNumber,
    createEmptyProfileEstimate: preset.createEmptyProfileEstimate,
    createEmptyProfilePreflight: preset.createEmptyProfilePreflight,
    createEmptyProfileReadiness: preset.createEmptyProfileReadiness,
    findProfilePreset: preset.findProfilePreset,
    getCompatibleProfileLaneIds: preset.getCompatibleProfileLaneIds,
    getDefaultProfileModelId: preset.getDefaultProfileModelId,
    getDefaultProfilePresetId: preset.getDefaultProfilePresetId,
    getProfileArtifactPreferenceMap: deps.getProfileArtifactPreferenceMap,
    getProfileLaneMap: preset.getProfileLaneMap,
    markCloseoutAsStale: deps.markCloseoutAsStale,
    mediaFeatureId: deps.mediaFeatureId,
    toRecord: deps.toRecord,
  };
  const mediaProfileState = createMediaProfileStateRuntime(
    mediaProfileStateDeps as unknown as Parameters<typeof createMediaProfileStateRuntime>[0]
  );

  const stateCompositionDeps = {
    asNonEmptyString: deps.asNonEmptyString,
    asNumber: preset.asNumber,
    buildProjectName: preset.buildProjectName,
    buildProjectSlug: preset.buildProjectSlug,
    clone: deps.clone,
    createDefaultEditState: preset.createDefaultEditState,
    createDefaultProfileState: mediaProfileState.createDefaultProfileState,
    createEmptyAudioAnalysisState: deps.createEmptyAudioAnalysisState,
    createEmptySourceDrafts: preset.createEmptySourceDrafts,
    featureIds: deps.featureIds,
    getDefaultMode: preset.getDefaultMode,
    getDefaultSourceType: preset.getDefaultSourceType,
    getDefaultYoutubePreset: preset.getDefaultYoutubePreset,
    getMediaProfileStateRuntime() {
      return mediaProfileState;
    },
    getPreferredFeatureSourceKind: hostUtils.getPreferredFeatureSourceKind,
    getPresetDefaultCustomValues: preset.getPresetDefaultCustomValues,
    getProjectStateRuntime: deps.getProjectStateRuntime,
    markFeatureProcessStale: deps.markFeatureProcessStale,
    markFeatureReportStale: deps.markFeatureReportStale,
    normalizeAudioAnalysisState: deps.normalizeAudioAnalysisState,
    normalizeEditState: preset.normalizeEditState,
    normalizeProfileArtifact: mediaProfileState.normalizeProfileArtifact,
    normalizeProfileSignal: mediaProfileState.normalizeProfileSignal,
    normalizeProfileState: mediaProfileState.normalizeProfileState,
    normalizeSourceMetadata: preset.normalizeSourceMetadata,
    normalizeStringArray: preset.normalizeStringArray,
    projectSchemaVersion: deps.projectSchemaVersion,
    toRecord: deps.toRecord,
  };
  stateComposition = createLaboratoryHostStateCompositionRuntime(
    stateCompositionDeps as unknown as Parameters<
      typeof createLaboratoryHostStateCompositionRuntime
    >[0]
  );

  const sc = requireStateComposition();
  deps.setCloseoutStalenessRuntime(sc.laboratoryCloseoutStalenessRuntime);

  const analysisArtifactDeps = {
    asNonEmptyString: deps.asNonEmptyString,
    asNumber: preset.asNumber,
    callRoomTools: io.callRoomTools,
    getProjectProfileDir,
    getProjectProfilePreflightDir,
    normalizeProcessArtifact: sc.normalizeProcessArtifact,
    normalizeProcessFinding: sc.normalizeProcessFinding,
    normalizeProfileArtifact: mediaProfileState.normalizeProfileArtifact,
    normalizeProfileSignal: mediaProfileState.normalizeProfileSignal,
    readTextFile: io.readTextFile,
    roomId: deps.roomId,
    toRecord: deps.toRecord,
    transcribeManagedAudioFile: io.transcribeManagedAudioFile,
    writeJsonFile: io.writeJsonFile,
  };
  const analysisArtifact = createLaboratoryAnalysisArtifactRuntime(
    analysisArtifactDeps as unknown as Parameters<typeof createLaboratoryAnalysisArtifactRuntime>[0]
  );

  const profileProjectionDeps = {
    asNonEmptyString: deps.asNonEmptyString,
    asNumber: preset.asNumber,
    buildDerivedTargetSignature: snapshot.buildDerivedTargetSignature,
    buildProfileModelSummary: mediaProfileModel.buildProfileModelSummary,
    buildProfileToolSummary: mediaProfileModel.buildProfileToolSummary,
    buildSourceTargetSignature: snapshot.buildSourceTargetSignature,
    clampProfileTranscriptSampleSeconds: mediaProfileState.clampProfileTranscriptSampleSeconds,
    clone: deps.clone,
    createDefaultProfileState: mediaProfileState.createDefaultProfileState,
    createEmptyProfilePreflight: preset.createEmptyProfilePreflight,
    findEditOutputById: snapshot.findEditOutputById,
    findProfilePreset: preset.findProfilePreset,
    getCompatibleProfileLaneIds: preset.getCompatibleProfileLaneIds,
    getDefaultProfileModelId: preset.getDefaultProfileModelId,
    getEnabledProfileLaneIds: mediaProfileState.getEnabledProfileLaneIds,
    getProfileDepthConfig: mediaProfileState.getProfileDepthConfig,
    getProfileFrameDensityRuntimeConfig: mediaProfileState.getProfileFrameDensityRuntimeConfig,
    getProfileLaneMap: preset.getProfileLaneMap,
    getProfileModelDescriptorMap: profileModelState.readProfileModelDescriptorMap,
    getStageSupport: bootstrap.getStageSupport,
    getToolManifest: bootstrap.getToolManifest,
    normalizeEditOutput: preset.normalizeEditOutput,
    normalizeProfileArtifactPreferences: mediaProfileState.normalizeProfileArtifactPreferences,
    normalizeProfileState: mediaProfileState.normalizeProfileState,
    normalizeSourceMetadata: preset.normalizeSourceMetadata,
    toRecord: deps.toRecord,
  };
  const profileProjection = createMediaProfileProjectionRuntime(
    profileProjectionDeps as unknown as Parameters<typeof createMediaProfileProjectionRuntime>[0]
  );

  const jobRuntimeDeps = {
    cancelRoomTool: io.cancelRoomTool,
    clearJob(runtime: Record<string, unknown>, jobId: string) {
      jobState.clearJob(runtime as Parameters<typeof jobState.clearJob>[0], jobId);
    },
    pushJobState: snapshot.pushJobState,
    roomId: deps.roomId,
    toRecord: deps.toRecord,
  };
  const jobRuntime = createLaboratoryJobRuntime(
    jobRuntimeDeps as unknown as Parameters<typeof createLaboratoryJobRuntime>[0]
  );

  return {
    analysisArtifact,
    jobRuntime,
    jobState,
    lifecycle,
    mediaProfileModel,
    mediaProfileState,
    profileProjection,
    snapshot,
    stateComposition,
  };
}
