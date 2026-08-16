import {
  getProjectEditDir,
  getProjectEditOutputDir,
  getProjectEditPreviewDir,
  getProjectSourceDir,
} from "../shared/host/project-paths.js";
import { createLaboratoryProjectStateRuntime } from "../shared/host/project-state.js";
import { createLaboratoryRoomToolsProgressRuntime } from "../shared/host/room-tools-progress.js";
import { createLaboratoryRuntimeStorage } from "../shared/host/runtime-storage.js";
import { createLaboratorySourceCompositionRuntime } from "../shared/host/source-composition.js";
import { createLaboratoryHostProcessCompositionRuntime } from "../shared/host/process-composition.js";
import { createLaboratoryMediaAnalysisHostRuntime } from "../features/media-analysis/host/runtime.js";
import { createLaboratoryFeatureAdapters } from "./feature-adapters.js";
import type { createLaboratoryHostFoundation } from "./foundation-runtimes.js";
import type { createLaboratoryHostProjectRuntimes } from "./project-runtimes.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryHostFoundationRuntime = ReturnType<typeof createLaboratoryHostFoundation>;
type LaboratoryHostProjectRuntimesRuntime = ReturnType<typeof createLaboratoryHostProjectRuntimes>;
type LaboratorySourceCompositionRuntime = ReturnType<
  typeof createLaboratorySourceCompositionRuntime
>;
type LaboratoryProcessDelegatesRuntime = {
  cancelFeatureProcess: (...args: unknown[]) => unknown;
  exportFeatureReport: (...args: unknown[]) => unknown;
  runFeatureProcess: (...args: unknown[]) => unknown;
};
type LaboratoryProcessCompositionRuntime = ReturnType<
  typeof createLaboratoryHostProcessCompositionRuntime
> & {
  laboratoryProcessDelegatesRuntime: LaboratoryProcessDelegatesRuntime | null;
};
type LaboratoryProjectStateRuntime = ReturnType<typeof createLaboratoryProjectStateRuntime>;

type LaboratoryHostFeatureRuntimesDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  audioAnalysisSchemaVersion: number;
  audioFeatureId: string;
  clone: (value: unknown) => unknown;
  foundation: LaboratoryHostFoundationRuntime;
  getFeatureProcessDir: (runtime: unknown, project: unknown, featureId: string) => string;
  getFeatureReportDir: (runtime: unknown, project: unknown, featureId: string) => string;
  markCloseoutAsStale: (project: LaboratoryRecord, reason: string, featureIds: string[]) => unknown;
  markFeatureProcessStale: (
    project: LaboratoryRecord,
    featureId: string,
    reason: string
  ) => unknown;
  markFeatureReportStale: (project: LaboratoryRecord, featureId: string, reason: string) => unknown;
  mediaFeatureId: string;
  normalizeAudioAnalysisModuleResult: (
    rawValue: unknown,
    moduleId: string,
    catalogEntry: unknown
  ) => unknown;
  normalizeAudioAnalysisState: (rawValue: unknown, runtime: unknown) => unknown;
  projectRuntimes: LaboratoryHostProjectRuntimesRuntime;
  roomId: string;
  setProcessCoordinationRuntime: (
    value: LaboratoryProcessCompositionRuntime["laboratoryProcessCoordinationRuntime"]
  ) => void;
  setProjectStateRuntime: (value: LaboratoryProjectStateRuntime) => void;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryHostFeatureRuntimes(deps: LaboratoryHostFeatureRuntimesDeps) {
  const { foundation, projectRuntimes } = deps;
  const { bootstrap, hostUtils, io, preset, profileModelState } = foundation;

  let sourceComposition: LaboratorySourceCompositionRuntime | null = null;

  const projectRecordsRuntime = projectRuntimes.stateComposition.laboratoryProjectRecordsRuntime;
  const projectStateDelegatesRuntime =
    projectRuntimes.stateComposition.laboratoryProjectStateDelegatesRuntime;

  function getActiveProject(
    ...args: Parameters<typeof projectRecordsRuntime.getActiveProject>
  ): ReturnType<typeof projectRecordsRuntime.getActiveProject> {
    return projectRecordsRuntime.getActiveProject(...args);
  }

  function syncProjectFeatureProjections(
    ...args: Parameters<typeof projectStateDelegatesRuntime.syncProjectFeatureProjections>
  ): ReturnType<typeof projectStateDelegatesRuntime.syncProjectFeatureProjections> {
    return projectStateDelegatesRuntime.syncProjectFeatureProjections(...args);
  }

  function requireSourceComposition(): LaboratorySourceCompositionRuntime {
    if (!sourceComposition) {
      throw new Error("sourceComposition not initialized");
    }
    return sourceComposition;
  }

  const mediaAnalysisDeps = {
    asNonEmptyString: deps.asNonEmptyString,
    asNumber: preset.asNumber,
    audioFeatureId: deps.audioFeatureId,
    buildSyntheticProfileSignal: projectRuntimes.analysisArtifact.buildSyntheticProfileSignal,
    callRoomTools: io.callRoomTools,
    clearJob: projectRuntimes.jobState.clearJob,
    clone: deps.clone,
    clampNumber: hostUtils.clampNumber,
    clampProfileTranscriptSampleSeconds:
      projectRuntimes.mediaProfileState.clampProfileTranscriptSampleSeconds,
    createDefaultEditState: preset.createDefaultEditState,
    createEmptyProfilePreflight: preset.createEmptyProfilePreflight,
    createProfileSignal: projectRuntimes.analysisArtifact.createProfileSignal,
    ensureEditJobSlotAvailable: projectRuntimes.jobRuntime.ensureEditJobSlotAvailable,
    ensureProfileJobSlotAvailable: projectRuntimes.jobRuntime.ensureProfileJobSlotAvailable,
    ensureProjectDirectories: io.ensureProjectDirectories,
    generateProfileFrameStrip: projectRuntimes.analysisArtifact.generateProfileFrameStrip,
    generateProfileMetadataArtifact:
      projectRuntimes.analysisArtifact.generateProfileMetadataArtifact,
    generateProfileSpectrogram: projectRuntimes.analysisArtifact.generateProfileSpectrogram,
    getActiveProject,
    getCollectDerivedOutputMetadata() {
      return requireSourceComposition().mediaSourceMetadataRuntime.collectDerivedOutputMetadata;
    },
    getFocusRegionCrop: preset.getFocusRegionCrop,
    getProfileFrameDensityRuntimeConfig:
      projectRuntimes.mediaProfileState.getProfileFrameDensityRuntimeConfig,
    getProjectEditDir,
    getProjectEditOutputDir,
    getProjectEditPreviewDir,
    getResizePresetMap: preset.getResizePresetMap,
    maybeRunTranscriptProfileSample:
      projectRuntimes.analysisArtifact.maybeRunTranscriptProfileSample,
    markCloseoutAsStale: deps.markCloseoutAsStale,
    markProfileAsStale: projectRuntimes.mediaProfileState.markProfileAsStale,
    mergeObjects: preset.mergeObjects,
    normalizeEditOutput: preset.normalizeEditOutput,
    normalizeProfileArtifactPreferences:
      projectRuntimes.mediaProfileState.normalizeProfileArtifactPreferences,
    normalizeSourceMetadata: preset.normalizeSourceMetadata,
    patchActiveProject: projectRuntimes.lifecycle.patchActiveProject,
    pushJobState: projectRuntimes.snapshot.pushJobState,
    registerJob: projectRuntimes.jobState.registerJob,
    runAudioStructureProbe: foundation.audioAnalysisUtility.runAudioStructureProbe,
    runVideoStructureProbe: foundation.audioAnalysisUtility.runVideoStructureProbe,
    roomId: deps.roomId,
    syncProjectFeatureProjections,
    toRecord: deps.toRecord,
  } as unknown as Parameters<typeof createLaboratoryMediaAnalysisHostRuntime>[0];

  const mediaAnalysis = createLaboratoryMediaAnalysisHostRuntime(mediaAnalysisDeps);

  const processCompositionDeps = {
    asNonEmptyString: deps.asNonEmptyString,
    asNumber: preset.asNumber,
    audioAnalysisSchemaVersion: deps.audioAnalysisSchemaVersion,
    audioFeatureId: deps.audioFeatureId,
    buildDerivedTargetSignature: projectRuntimes.snapshot.buildDerivedTargetSignature,
    buildEmotionHeuristicFromProsody:
      foundation.audioAnalysisUtility.buildEmotionHeuristicFromProsody,
    buildProfileModelSummary: projectRuntimes.mediaProfileModel.buildProfileModelSummary,
    buildSourceTargetSignature: projectRuntimes.snapshot.buildSourceTargetSignature,
    callRoomTools: io.callRoomTools,
    clampProfileTranscriptSampleSeconds:
      projectRuntimes.mediaProfileState.clampProfileTranscriptSampleSeconds,
    cancelProcessJobsForProject: projectRuntimes.jobRuntime.cancelProcessJobsForProject,
    clearJob: projectRuntimes.jobState.clearJob,
    clone: deps.clone,
    createEmptyFeatureProcessRecord:
      projectRuntimes.stateComposition.createEmptyFeatureProcessRecord,
    createEmptyFeatureReportRecord: projectRuntimes.stateComposition.createEmptyFeatureReportRecord,
    createProcessArtifact: projectRuntimes.analysisArtifact.createProcessArtifact,
    createProcessFinding: projectRuntimes.analysisArtifact.createProcessFinding,
    ensureEditToolReady: mediaAnalysis.ensureEditToolReady,
    ensureProcessJobSlotAvailable: projectRuntimes.jobRuntime.ensureProcessJobSlotAvailable,
    ensureProjectDirectories: io.ensureProjectDirectories,
    ensureReportJobSlotAvailable: projectRuntimes.jobRuntime.ensureReportJobSlotAvailable,
    ensureRuntimeDirectory: io.ensureRuntimeDirectory,
    findEditOutputById: projectRuntimes.snapshot.findEditOutputById,
    formatIdentifierLabel: projectRuntimes.analysisArtifact.formatIdentifierLabel,
    getActiveProject,
    getElectronApi: io.getElectronApi,
    getFeatureProcessDir: deps.getFeatureProcessDir,
    getProjectSourceDir,
    getFeatureProcessRecord: projectRuntimes.stateComposition.getFeatureProcessRecord,
    getFeatureReportDir: deps.getFeatureReportDir,
    getFeatureReportRecord: projectRuntimes.stateComposition.getFeatureReportRecord,
    getFindingSeverityRank: projectRuntimes.analysisArtifact.getFindingSeverityRank,
    getPreferredFeatureSourceKind: hostUtils.getPreferredFeatureSourceKind,
    getStageSupport: bootstrap.getStageSupport,
    getToolManifest: bootstrap.getToolManifest,
    generateProcessMetadataArtifact:
      projectRuntimes.analysisArtifact.generateProcessMetadataArtifact,
    generateProcessFramePreviewArtifact:
      projectRuntimes.analysisArtifact.generateProcessFramePreviewArtifact,
    generateProcessImageComparisonArtifact:
      projectRuntimes.analysisArtifact.generateProcessImageComparisonArtifact,
    generateProcessVisualTransformArtifact:
      projectRuntimes.analysisArtifact.generateProcessVisualTransformArtifact,
    listDirectory: io.listDirectory,
    markFeatureReportStale: deps.markFeatureReportStale,
    maybeRunTranscriptProfileSample:
      projectRuntimes.analysisArtifact.maybeRunTranscriptProfileSample,
    mediaFeatureId: deps.mediaFeatureId,
    normalizeAudioAnalysisModuleResult: deps.normalizeAudioAnalysisModuleResult,
    normalizeAudioAnalysisState: deps.normalizeAudioAnalysisState,
    normalizeEditOutput: preset.normalizeEditOutput,
    normalizeFeatureReportRecord: projectRuntimes.stateComposition.normalizeFeatureReportRecord,
    normalizeProcessArtifact: projectRuntimes.stateComposition.normalizeProcessArtifact,
    normalizeProcessFinding: projectRuntimes.stateComposition.normalizeProcessFinding,
    normalizeProcessModule: projectRuntimes.stateComposition.normalizeProcessModule,
    normalizeReportExport: projectRuntimes.stateComposition.normalizeReportExport,
    normalizeSourceMetadata: preset.normalizeSourceMetadata,
    normalizeStringArray: preset.normalizeStringArray,
    parseAspectralStatsText: foundation.audioAnalysisUtility.parseAspectralStatsText,
    patchActiveProject: projectRuntimes.lifecycle.patchActiveProject,
    pushJobState: projectRuntimes.snapshot.pushJobState,
    readJsonFile: io.readJsonFile,
    readTextFile: io.readTextFile,
    registerJob: projectRuntimes.jobState.registerJob,
    resolveOpenSmileProsodyRuntime: foundation.audioAnalysisUtility.resolveOpenSmileProsodyRuntime,
    resolveProfileTarget: projectRuntimes.profileProjection.resolveProfileTarget,
    runAudioStructureProbe: foundation.audioAnalysisUtility.runAudioStructureProbe,
    runOpenSmileProsodyExtraction: foundation.audioAnalysisUtility.runOpenSmileProsodyExtraction,
    runProfileTool: projectRuntimes.analysisArtifact.runProfileTool,
    runVideoStructureProbe: foundation.audioAnalysisUtility.runVideoStructureProbe,
    roomId: deps.roomId,
    sanitizeFileSegment: mediaAnalysis.sanitizeFileSegment,
    getVisualAnalysisCapabilityState(runtime: unknown, sourceKind: string | null) {
      return mediaAnalysis.visualAnalysisRuntime.buildVisualAnalysisCapabilityState(
        deps.toRecord(runtime),
        sourceKind
      );
    },
    getVisualAnalysisModulesForRuntime(runtime: unknown, sourceKind?: string | null) {
      return mediaAnalysis.visualAnalysisRuntime.getVisualAnalysisModulesForRuntime(
        deps.toRecord(runtime),
        sourceKind || null
      );
    },
    getVisualAnalysisProviderState(runtime: unknown) {
      return mediaAnalysis.visualAnalysisRuntime.buildVisualAnalysisProviderState(
        deps.toRecord(runtime)
      );
    },
    partitionVisualAnalysisModuleIds(runtime: unknown, moduleIds: string[]) {
      return mediaAnalysis.visualAnalysisRuntime.partitionVisualAnalysisModuleIds(
        deps.toRecord(runtime),
        moduleIds
      );
    },
    resolveEnabledVisualAnalysisModuleIds(
      runtime: unknown,
      project: unknown,
      sourceKind: string | null,
      workbenchSource?: unknown
    ) {
      return mediaAnalysis.visualAnalysisRuntime.resolveEnabledVisualAnalysisModuleIds(
        deps.toRecord(runtime),
        deps.toRecord(project),
        sourceKind,
        workbenchSource
      );
    },
    setFeatureProcessRecord: projectRuntimes.stateComposition.setFeatureProcessRecord,
    setFeatureReportRecord: projectRuntimes.stateComposition.setFeatureReportRecord,
    toRecord: deps.toRecord,
    writeJsonFile: io.writeJsonFile,
    writeTextFile: io.writeTextFile,
  } as unknown as Parameters<typeof createLaboratoryHostProcessCompositionRuntime>[0];

  const processComposition = createLaboratoryHostProcessCompositionRuntime(
    processCompositionDeps
  ) as unknown as LaboratoryProcessCompositionRuntime;

  deps.setProcessCoordinationRuntime(processComposition.laboratoryProcessCoordinationRuntime);

  const sourceCompositionDeps = {
    asNumber: preset.asNumber,
    asNonEmptyString: deps.asNonEmptyString,
    callRoomTools: io.callRoomTools,
    cancelJobsForProject: projectRuntimes.jobState.cancelJobsForProject,
    clearJob: projectRuntimes.jobState.clearJob,
    ensureProjectDirectories: io.ensureProjectDirectories,
    getActiveProject,
    getElectronApi: io.getElectronApi,
    getProjectEditDir,
    getProjectSourceDir,
    getPresetDefaultCustomValues: preset.getPresetDefaultCustomValues,
    getSourceConfig: preset.getSourceConfig,
    normalizeSourceMetadata: preset.normalizeSourceMetadata,
    patchActiveProject: projectRuntimes.lifecycle.patchActiveProject,
    pushJobState: projectRuntimes.snapshot.pushJobState,
    registerJob: projectRuntimes.jobState.registerJob,
    resetEditForCurrentSource: mediaAnalysis.resetEditForCurrentSource,
    resetProfileForCurrentSource: projectRuntimes.mediaProfileState.resetProfileForCurrentSource,
    roomId: deps.roomId,
    toRecord: deps.toRecord,
  } as unknown as Parameters<typeof createLaboratorySourceCompositionRuntime>[0];

  sourceComposition = createLaboratorySourceCompositionRuntime(sourceCompositionDeps);

  const roomToolsProgressDeps = {
    roomId: deps.roomId,
    asNonEmptyString: deps.asNonEmptyString,
    toRecord: deps.toRecord,
    emitEvent: projectRuntimes.snapshot.emitEvent,
    getElectronApi: io.getElectronApi,
    pushJobState: projectRuntimes.snapshot.pushJobState,
    pushSourceState: projectRuntimes.snapshot.pushSourceState,
  } as unknown as Parameters<typeof createLaboratoryRoomToolsProgressRuntime>[0];

  const roomToolsProgress = createLaboratoryRoomToolsProgressRuntime(roomToolsProgressDeps);

  const runtimeStorageDeps = {
    lifecycleRuntime: projectRuntimes.lifecycle,
    profileModelRuntime: projectRuntimes.mediaProfileModel,
    toRecord: deps.toRecord,
  } as unknown as Parameters<typeof createLaboratoryRuntimeStorage>[0];

  const runtimeStorage = createLaboratoryRuntimeStorage(runtimeStorageDeps);

  const projectStateDeps = {
    roomSnapshotRuntime: projectRuntimes.snapshot.laboratoryRoomSnapshotRuntime,
    runtimeStorage: {
      ...runtimeStorage,
      getFeatureProcessRecord(project: Record<string, unknown>, featureId: string) {
        return projectRuntimes.stateComposition.getFeatureProcessRecord(project, featureId);
      },
      getFeatureReportRecord(project: Record<string, unknown>, featureId: string) {
        return projectRuntimes.stateComposition.getFeatureReportRecord(project, featureId);
      },
      getProfileModelDescriptor(runtime: unknown, modelId: string) {
        return runtimeStorage.getProfileModelDescriptor(
          runtime as Parameters<typeof runtimeStorage.getProfileModelDescriptor>[0],
          modelId
        );
      },
      getProfileModelDescriptorMap(runtime: unknown) {
        return runtimeStorage.getProfileModelDescriptorMap(
          runtime as Parameters<typeof runtimeStorage.getProfileModelDescriptorMap>[0]
        );
      },
      persistProfileModelState(runtime: unknown) {
        return runtimeStorage.persistProfileModelState(
          runtime as Parameters<typeof runtimeStorage.persistProfileModelState>[0]
        );
      },
      persistToolState(runtime: unknown) {
        return runtimeStorage.persistToolState(
          runtime as Parameters<typeof runtimeStorage.persistToolState>[0]
        );
      },
      refreshProfileModelState(runtime: unknown) {
        return runtimeStorage.refreshProfileModelState(
          runtime as Parameters<typeof runtimeStorage.refreshProfileModelState>[0]
        );
      },
    },
    syncProjectAudioAnalysisProjection(runtime: unknown, project: Record<string, unknown>) {
      return processComposition.syncProjectAudioAnalysisProjection(
        runtime as Parameters<typeof processComposition.syncProjectAudioAnalysisProjection>[0],
        project
      );
    },
    syncProjectProfileProjection: projectRuntimes.profileProjection.syncProjectProfileProjection,
    toFileUrl: hostUtils.toFileUrl,
  } as unknown as Parameters<typeof createLaboratoryProjectStateRuntime>[0];

  const projectState = createLaboratoryProjectStateRuntime(projectStateDeps);

  deps.setProjectStateRuntime(projectState);

  const sourceCompositionRuntime = requireSourceComposition();
  const processCompositionRecord = deps.toRecord(processComposition);
  const processDelegates = processCompositionRecord[
    "laboratoryProcessDelegatesRuntime"
  ] as LaboratoryProcessDelegatesRuntime | null;
  if (!processDelegates) throw new Error("laboratoryProcessDelegatesRuntime not initialized");

  const featureAdaptersDeps = {
    applyEditRecipePatch: mediaAnalysis.applyEditRecipePatch,
    applyProfilePresetPatch: projectRuntimes.mediaProfileState.applyProfilePresetPatch,
    asNonEmptyString: deps.asNonEmptyString,
    asNumber: preset.asNumber,
    audioFeatureId: deps.audioFeatureId,
    callRoomTools: io.callRoomTools,
    cancelJobById: projectRuntimes.jobRuntime.cancelJobById,
    cancelEditJobsForProject: projectRuntimes.jobRuntime.cancelEditJobsForProject,
    cancelFeatureProcess: processDelegates.cancelFeatureProcess,
    cancelJobsForProject: projectRuntimes.jobState.cancelJobsForProject,
    cancelProfileJobsForProject: projectRuntimes.jobRuntime.cancelProfileJobsForProject,
    clampNumber: hostUtils.clampNumber,
    clampProfileTranscriptSampleSeconds:
      projectRuntimes.mediaProfileState.clampProfileTranscriptSampleSeconds,
    clearJob: projectRuntimes.jobState.clearJob,
    createDefaultEditState: preset.createDefaultEditState,
    createDefaultToolEntry: bootstrap.createDefaultToolEntry,
    createProject: projectRuntimes.lifecycle.createProject,
    createRequestId: projectRuntimes.jobState.createRequestId,
    deleteProject: projectRuntimes.lifecycle.deleteProject,
    ensureHydrated: projectRuntimes.lifecycle.ensureHydrated,
    ensureProjectExists: projectRuntimes.lifecycle.ensureProjectExists,
    exportFeatureReport: processDelegates.exportFeatureReport,
    findEditPreset: mediaAnalysis.findEditPreset,
    findProfilePreset: preset.findProfilePreset,
    getActiveProject,
    getDefaultMode: preset.getDefaultMode,
    getDefaultSourceType: preset.getDefaultSourceType,
    getFeatureIdFromContext: bootstrap.getFeatureIdFromContext,
    getProfileModelDescriptorMap: profileModelState.readProfileModelDescriptorMap,
    getProjectEditDir,
    getProjectEditOutputDir,
    getProjectSourceDir,
    getRuntimeToolIds: bootstrap.getRuntimeToolIds,
    handleLocalPick: sourceCompositionRuntime.laboratorySourceDelegatesRuntime.handleLocalPick,
    handleUrlDownload: sourceCompositionRuntime.laboratorySourceDelegatesRuntime.handleUrlDownload,
    handleYoutubeDownload:
      sourceCompositionRuntime.laboratorySourceDelegatesRuntime.handleYoutubeDownload,
    handleYoutubeProbe:
      sourceCompositionRuntime.laboratorySourceDelegatesRuntime.handleYoutubeProbe,
    installProfileModel: projectRuntimes.mediaProfileModel.installProfileModel,
    loadContext: bootstrap.loadContext,
    markCloseoutAsStale: deps.markCloseoutAsStale,
    markProfileAsStale: projectRuntimes.mediaProfileState.markProfileAsStale,
    normalizeProfileArtifactPreferences:
      projectRuntimes.mediaProfileState.normalizeProfileArtifactPreferences,
    patchActiveProject: projectRuntimes.lifecycle.patchActiveProject,
    patchActiveProjectDrafts: projectRuntimes.lifecycle.patchActiveProjectDrafts,
    persistProfileModelState: runtimeStorage.persistProfileModelState,
    persistToolState: profileModelState.saveToolState,
    pushActionResult: projectRuntimes.snapshot.pushActionResult,
    pushJobState: projectRuntimes.snapshot.pushJobState,
    pushMediaState: projectRuntimes.snapshot.pushMediaState,
    readTextFile: io.readTextFile,
    refreshActiveProjectMetadata:
      sourceCompositionRuntime.mediaSourceMetadataRuntime.refreshActiveProjectMetadata,
    refreshProfileModelState: profileModelState.reloadProfileModelState,
    refreshToolStatus: projectRuntimes.lifecycle.refreshToolStatus,
    registerJob: projectRuntimes.jobState.registerJob,
    removeProfileModel: projectRuntimes.mediaProfileModel.removeProfileModel,
    resetEditForCurrentSource: mediaAnalysis.resetEditForCurrentSource,
    resetProfileForCurrentSource: projectRuntimes.mediaProfileState.resetProfileForCurrentSource,
    roomId: deps.roomId,
    runEditPipeline: mediaAnalysis.runEditPipeline,
    runFeatureProcess: processDelegates.runFeatureProcess,
    runProfilePreflight: mediaAnalysis.runProfilePreflight,
    sanitizeFileSegment: mediaAnalysis.sanitizeFileSegment,
    toRecord: deps.toRecord,
  } as unknown as Parameters<typeof createLaboratoryFeatureAdapters>[0];

  const featureAdapters = createLaboratoryFeatureAdapters(featureAdaptersDeps);

  return {
    featureAdapters,
    mediaAnalysis,
    processComposition,
    projectState,
    roomToolsProgress,
    runtimeStorage,
    sourceComposition: sourceCompositionRuntime,
  };
}
