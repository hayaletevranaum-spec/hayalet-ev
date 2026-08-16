import { createMediaActionRuntime } from "../../features/media-analysis/host/action-handlers.js";
import { createLaboratoryHostActionRuntime } from "./action-runtime.js";
import { createLaboratoryToolMutationRuntime } from "./tool-mutations.js";

type LaboratoryRecord = Record<string, unknown>;
type UnknownFn = (...args: unknown[]) => unknown;

type LaboratoryHostActionRuntime = ReturnType<typeof createLaboratoryHostActionRuntime>;
type LaboratoryHostActionRuntimeDeps = Parameters<typeof createLaboratoryHostActionRuntime>[0];
type LaboratoryToolMutationRuntime = ReturnType<typeof createLaboratoryToolMutationRuntime>;
type LaboratoryToolMutationRuntimeDeps = Parameters<typeof createLaboratoryToolMutationRuntime>[0];
type LaboratoryMediaActionRuntime = ReturnType<typeof createMediaActionRuntime>;

type LaboratoryMediaActionRuntimeDeps = {
  applyEditRecipePatch: UnknownFn;
  applyProfilePresetPatch: UnknownFn;
  asNonEmptyString: (value: unknown) => string | null;
  asNumber: (value: unknown) => number | null;
  audioFeatureId: string;
  callRoomTools: UnknownFn;
  cancelJobById: UnknownFn;
  cancelEditJobsForProject: UnknownFn;
  cancelFeatureProcess: UnknownFn;
  cancelJobsForProject: UnknownFn;
  cancelProfileJobsForProject: UnknownFn;
  clearJob: UnknownFn;
  clampNumber: UnknownFn;
  clampProfileTranscriptSampleSeconds: UnknownFn;
  createDefaultEditState: UnknownFn;
  createEmptyProfilePreflight: UnknownFn;
  createProject: UnknownFn;
  deleteProject: UnknownFn;
  ensureProjectExists: UnknownFn;
  exportFeatureReport: UnknownFn;
  findEditPreset: UnknownFn;
  findProfilePreset: UnknownFn;
  getActiveProject: UnknownFn;
  getDefaultMode: UnknownFn;
  getDefaultSourceType: UnknownFn;
  getProfileModelDescriptorMap: UnknownFn;
  getProjectEditDir: UnknownFn;
  getProjectEditOutputDir: UnknownFn;
  getProjectSourceDir: UnknownFn;
  handleLocalPick: UnknownFn;
  handleUrlDownload: UnknownFn;
  handleYoutubeDownload: UnknownFn;
  handleYoutubeProbe: UnknownFn;
  installProfileModel: UnknownFn;
  markCloseoutAsStale: UnknownFn;
  markProfileAsStale: UnknownFn;
  normalizeProfileArtifactPreferences: UnknownFn;
  patchActiveProject: UnknownFn;
  patchActiveProjectDrafts: UnknownFn;
  pushJobState: UnknownFn;
  refreshActiveProjectMetadata: UnknownFn;
  refreshToolStatus: UnknownFn;
  registerJob: UnknownFn;
  removeProfileModel: UnknownFn;
  resetEditForCurrentSource: UnknownFn;
  resetProfileForCurrentSource: UnknownFn;
  runEditPipeline: UnknownFn;
  runFeatureProcess: UnknownFn;
  runProfilePreflight: UnknownFn;
  toRecord: (value: unknown) => LaboratoryRecord;
};

type LaboratoryActionCompositionDeps = Omit<
  LaboratoryHostActionRuntimeDeps,
  "mediaActionRuntime" | "toolMutationRuntime"
> &
  LaboratoryToolMutationRuntimeDeps &
  LaboratoryMediaActionRuntimeDeps;

export function createLaboratoryActionCompositionRuntime(deps: LaboratoryActionCompositionDeps) {
  let laboratoryHostActionRuntime: LaboratoryHostActionRuntime | null = null;

  const laboratoryToolMutationRuntimeDeps = {
    callRoomTools: deps.callRoomTools,
    clearJob: deps.clearJob,
    createDefaultToolEntry: deps.createDefaultToolEntry,
    getRuntimeToolIds: deps.getRuntimeToolIds,
    persistToolState: deps.persistToolState,
    pushJobState: deps.pushJobState,
    refreshProfileModelState: deps.refreshProfileModelState,
    registerJob: deps.registerJob,
    roomId: deps.roomId,
    toRecord: deps.toRecord,
  };
  const laboratoryToolMutationRuntime: LaboratoryToolMutationRuntime =
    createLaboratoryToolMutationRuntime(laboratoryToolMutationRuntimeDeps);

  const mediaActionRuntimeDeps = {
    applyEditRecipePatch: deps.applyEditRecipePatch,
    applyProfilePresetPatch: deps.applyProfilePresetPatch,
    asNonEmptyString: deps.asNonEmptyString,
    asNumber: deps.asNumber,
    audioFeatureId: deps.audioFeatureId,
    callRoomTools: deps.callRoomTools,
    cancelJobById: deps.cancelJobById,
    cancelEditJobsForProject: deps.cancelEditJobsForProject,
    cancelFeatureProcess: deps.cancelFeatureProcess,
    cancelJobsForProject: deps.cancelJobsForProject,
    cancelProfileJobsForProject: deps.cancelProfileJobsForProject,
    clearJob: deps.clearJob,
    checkAllToolUpdates(...args: Parameters<LaboratoryToolMutationRuntime["checkAllToolUpdates"]>) {
      return laboratoryToolMutationRuntime.checkAllToolUpdates(...args);
    },
    checkToolUpdates(...args: Parameters<LaboratoryToolMutationRuntime["checkToolUpdates"]>) {
      return laboratoryToolMutationRuntime.checkToolUpdates(...args);
    },
    clampNumber: deps.clampNumber,
    clampProfileTranscriptSampleSeconds: deps.clampProfileTranscriptSampleSeconds,
    createEmptyProfilePreflight: deps.createEmptyProfilePreflight,
    createDefaultEditState: deps.createDefaultEditState,
    createProject: deps.createProject,
    deleteProject: deps.deleteProject,
    ensureProjectExists: deps.ensureProjectExists,
    exportFeatureReport: deps.exportFeatureReport,
    findEditPreset: deps.findEditPreset,
    findProfilePreset: deps.findProfilePreset,
    getProfileModelDescriptorMap: deps.getProfileModelDescriptorMap,
    getActiveProject: deps.getActiveProject,
    getDefaultMode: deps.getDefaultMode,
    getDefaultSourceType: deps.getDefaultSourceType,
    getProjectEditDir: deps.getProjectEditDir,
    getProjectEditOutputDir: deps.getProjectEditOutputDir,
    getProjectSourceDir: deps.getProjectSourceDir,
    handleLocalPick: deps.handleLocalPick,
    handleToolMutation(...args: Parameters<LaboratoryHostActionRuntime["handleToolMutation"]>) {
      const hostAction = laboratoryHostActionRuntime;
      if (!hostAction) {
        throw new Error("Laboratory host action runtime is not initialized");
      }
      return hostAction.handleToolMutation(...args);
    },
    handleUrlDownload: deps.handleUrlDownload,
    handleYoutubeDownload: deps.handleYoutubeDownload,
    handleYoutubeProbe: deps.handleYoutubeProbe,
    installProfileModel: deps.installProfileModel,
    markCloseoutAsStale: deps.markCloseoutAsStale,
    markProfileAsStale: deps.markProfileAsStale,
    normalizeProfileArtifactPreferences: deps.normalizeProfileArtifactPreferences,
    patchActiveProject: deps.patchActiveProject,
    patchActiveProjectDrafts: deps.patchActiveProjectDrafts,
    pushJobState: deps.pushJobState,
    refreshActiveProjectMetadata: deps.refreshActiveProjectMetadata,
    refreshToolStatus: deps.refreshToolStatus,
    registerJob: deps.registerJob,
    removeProfileModel: deps.removeProfileModel,
    resetEditForCurrentSource: deps.resetEditForCurrentSource,
    resetProfileForCurrentSource: deps.resetProfileForCurrentSource,
    runFeatureProcess: deps.runFeatureProcess,
    runEditPipeline: deps.runEditPipeline,
    runProfilePreflight: deps.runProfilePreflight,
    toRecord: deps.toRecord,
    updateSelectedTools(...args: Parameters<LaboratoryToolMutationRuntime["updateSelectedTools"]>) {
      return laboratoryToolMutationRuntime.updateSelectedTools(...args);
    },
    updateAllTools(...args: Parameters<LaboratoryToolMutationRuntime["updateAllTools"]>) {
      return laboratoryToolMutationRuntime.updateAllTools(...args);
    },
  };
  const mediaActionRuntime: LaboratoryMediaActionRuntime = createMediaActionRuntime(
    mediaActionRuntimeDeps as unknown as Parameters<typeof createMediaActionRuntime>[0]
  );

  const toolMutationRuntime: LaboratoryHostActionRuntimeDeps["toolMutationRuntime"] = {
    handleToolMutation(api, runtime, requestId, action, toolId, featureStage) {
      return laboratoryToolMutationRuntime.handleToolMutation(
        api,
        runtime as Parameters<LaboratoryToolMutationRuntime["handleToolMutation"]>[1],
        requestId,
        action,
        toolId,
        featureStage
      );
    },
  };

  const laboratoryHostActionRuntimeDeps = {
    asNonEmptyString: deps.asNonEmptyString,
    createRequestId: deps.createRequestId,
    ensureHydrated: deps.ensureHydrated,
    getFeatureIdFromContext: deps.getFeatureIdFromContext,
    loadContext: deps.loadContext,
    mediaActionRuntime,
    persistProfileModelState: deps.persistProfileModelState,
    persistToolState: deps.persistToolState,
    pushActionResult: deps.pushActionResult,
    pushMediaState: deps.pushMediaState,
    toRecord: deps.toRecord,
    toolMutationRuntime,
  };
  laboratoryHostActionRuntime = createLaboratoryHostActionRuntime(laboratoryHostActionRuntimeDeps);

  const hostActionRuntime = laboratoryHostActionRuntime;

  return {
    handleMediaAction: hostActionRuntime.handleMediaAction,
    handleToolMutation: hostActionRuntime.handleToolMutation,
    laboratoryHostActionRuntime: hostActionRuntime,
    laboratoryToolMutationRuntime,
    mediaActionRuntime,
  };
}
