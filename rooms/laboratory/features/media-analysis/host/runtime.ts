import { createMediaEditArtifactRuntime } from "./edit-artifacts.js";
import { createMediaEditSupportRuntime } from "./edit-support.js";
import { createMediaEditPipelineRuntime } from "./edit-pipeline.js";
import { createMediaProfilePreflightRuntime } from "./profile-preflight.js";
import { createLaboratoryVisualAnalysisRuntime } from "./visual-analysis-runtime.js";

type LaboratoryRecord = Record<string, unknown>;
type MediaEditSupportRuntimeDeps = Parameters<typeof createMediaEditSupportRuntime>[0];
type MediaEditArtifactRuntimeDeps = Parameters<typeof createMediaEditArtifactRuntime>[0];
type MediaEditPipelineRuntimeDeps = Parameters<typeof createMediaEditPipelineRuntime>[0];
type MediaProfilePreflightRuntimeDeps = Parameters<typeof createMediaProfilePreflightRuntime>[0];
type MediaEditPipelineRuntimeApi = ReturnType<typeof createMediaEditPipelineRuntime>;
type MediaProfilePreflightRuntimeApi = ReturnType<typeof createMediaProfilePreflightRuntime>;

type LaboratoryToolReadyRuntime = LaboratoryRecord & {
  toolState?: unknown;
};

type LaboratoryMediaAnalysisHostRuntimeDeps = MediaEditSupportRuntimeDeps &
  MediaEditArtifactRuntimeDeps &
  Omit<
    MediaEditPipelineRuntimeDeps,
    | "buildAuxiliaryArtifacts"
    | "buildEditCommand"
    | "buildEditOutputLabel"
    | "buildEditTargetPath"
    | "collectDerivedOutputMetadata"
    | "ensureEditToolReady"
    | "getDerivedMimeType"
    | "getEditRecipeSignature"
    | "getPreparedSourcePath"
    | "requirePreparedSource"
  > &
  Omit<MediaProfilePreflightRuntimeDeps, "ensureProfileToolReady" | "sanitizeFileSegment"> & {
    getCollectDerivedOutputMetadata: MediaEditPipelineRuntimeDeps["collectDerivedOutputMetadata"];
  };

export function createLaboratoryMediaAnalysisHostRuntime(
  deps: LaboratoryMediaAnalysisHostRuntimeDeps
) {
  const {
    asNonEmptyString,
    asNumber,
    audioFeatureId,
    buildSyntheticProfileSignal,
    callRoomTools,
    clearJob,
    clone,
    clampNumber,
    createDefaultEditState,
    createEmptyProfilePreflight,
    createProfileSignal,
    ensureEditJobSlotAvailable,
    ensureProfileJobSlotAvailable,
    ensureProjectDirectories,
    generateProfileFrameStrip,
    generateProfileMetadataArtifact,
    generateProfileSpectrogram,
    getActiveProject,
    getCollectDerivedOutputMetadata,
    getFocusRegionCrop,
    getProjectEditDir,
    getProjectEditOutputDir,
    getProjectEditPreviewDir,
    getProfileFrameDensityRuntimeConfig,
    getResizePresetMap,
    maybeRunTranscriptProfileSample,
    markCloseoutAsStale,
    markProfileAsStale,
    mergeObjects,
    normalizeEditOutput,
    normalizeProfileArtifactPreferences,
    normalizeSourceMetadata,
    patchActiveProject,
    pushJobState,
    registerJob,
    runAudioStructureProbe,
    runVideoStructureProbe,
    roomId,
    syncProjectFeatureProjections,
    toRecord,
  } = deps;

  function getFfmpegToolState(runtime: LaboratoryToolReadyRuntime) {
    return toRecord(toRecord(toRecord(runtime.toolState)["tools"])["ffmpeg"]);
  }

  const mediaEditSupportRuntime = createMediaEditSupportRuntime({
    asNonEmptyString,
    asNumber,
    clampNumber,
    createDefaultEditState,
    getFocusRegionCrop,
    getProjectEditOutputDir,
    getProjectEditPreviewDir,
    getResizePresetMap,
    markCloseoutAsStale,
    mergeObjects,
    normalizeSourceMetadata,
    toRecord,
  });
  const {
    applyEditRecipePatch,
    buildEditCommand,
    buildEditOutputLabel,
    buildEditTargetPath,
    findEditPreset,
    getDerivedMimeType,
    getEditRecipeSignature,
    getPreparedSourcePath,
    requirePreparedSource,
    resetEditForCurrentSource,
    sanitizeFileSegment,
  } = mediaEditSupportRuntime;

  function ensureEditToolReady(
    runtime: Parameters<MediaEditPipelineRuntimeDeps["ensureEditToolReady"]>[0]
  ) {
    const ffmpegState = getFfmpegToolState(runtime);
    if (ffmpegState["installed"] !== true) {
      throw new Error("Install FFmpeg in settings before using the edit stage.");
    }
  }

  const mediaEditArtifactRuntime = createMediaEditArtifactRuntime({
    asNonEmptyString,
    asNumber,
    callRoomTools,
    clampNumber,
    getProjectEditDir,
    getProjectEditOutputDir,
    getProjectEditPreviewDir,
    listDirectory: deps.listDirectory,
    roomId,
    toRecord,
  });

  const mediaEditPipelineRuntime = createMediaEditPipelineRuntime({
    audioFeatureId,
    buildAuxiliaryArtifacts: mediaEditArtifactRuntime.buildAuxiliaryArtifacts,
    buildEditCommand: buildEditCommand as MediaEditPipelineRuntimeDeps["buildEditCommand"],
    buildEditOutputLabel:
      buildEditOutputLabel as MediaEditPipelineRuntimeDeps["buildEditOutputLabel"],
    buildEditTargetPath: buildEditTargetPath as MediaEditPipelineRuntimeDeps["buildEditTargetPath"],
    callRoomTools,
    clearJob,
    collectDerivedOutputMetadata: getCollectDerivedOutputMetadata,
    ensureEditJobSlotAvailable,
    ensureEditToolReady,
    ensureProjectDirectories,
    getActiveProject,
    getDerivedMimeType: getDerivedMimeType as MediaEditPipelineRuntimeDeps["getDerivedMimeType"],
    getEditRecipeSignature:
      getEditRecipeSignature as MediaEditPipelineRuntimeDeps["getEditRecipeSignature"],
    getPreparedSourcePath:
      getPreparedSourcePath as MediaEditPipelineRuntimeDeps["getPreparedSourcePath"],
    getProjectEditDir,
    markCloseoutAsStale,
    markProfileAsStale,
    normalizeEditOutput,
    patchActiveProject,
    pushJobState,
    registerJob,
    requirePreparedSource:
      requirePreparedSource as MediaEditPipelineRuntimeDeps["requirePreparedSource"],
    roomId,
    toRecord,
  });

  function runEditPipeline(...args: Parameters<MediaEditPipelineRuntimeApi["runEditPipeline"]>) {
    return mediaEditPipelineRuntime.runEditPipeline(...args);
  }

  function ensureProfileToolReady(
    runtime: Parameters<MediaProfilePreflightRuntimeDeps["ensureProfileToolReady"]>[0]
  ) {
    const ffmpegState = getFfmpegToolState(runtime);
    if (ffmpegState["installed"] !== true) {
      throw new Error("Install FFmpeg in settings before using the profile stage.");
    }
  }

  const mediaProfilePreflightRuntime = createMediaProfilePreflightRuntime({
    asNonEmptyString,
    asNumber,
    buildSyntheticProfileSignal,
    clampNumber,
    clampProfileTranscriptSampleSeconds: deps.clampProfileTranscriptSampleSeconds,
    clearJob,
    clone,
    createEmptyProfilePreflight,
    createProfileSignal,
    ensureProfileJobSlotAvailable,
    ensureProfileToolReady,
    ensureProjectDirectories,
    generateProfileFrameStrip,
    generateProfileMetadataArtifact,
    generateProfileSpectrogram,
    getActiveProject,
    getProfileFrameDensityRuntimeConfig,
    maybeRunTranscriptProfileSample,
    normalizeProfileArtifactPreferences,
    normalizeSourceMetadata,
    patchActiveProject,
    pushJobState,
    registerJob,
    runAudioStructureProbe,
    runVideoStructureProbe,
    sanitizeFileSegment,
    syncProjectFeatureProjections,
    toRecord,
  });

  function runProfilePreflight(
    ...args: Parameters<MediaProfilePreflightRuntimeApi["runProfilePreflight"]>
  ) {
    return mediaProfilePreflightRuntime.runProfilePreflight(...args);
  }

  const visualAnalysisRuntime = createLaboratoryVisualAnalysisRuntime({
    asNonEmptyString,
    toRecord,
  });

  return {
    applyEditRecipePatch,
    buildEditCommand,
    buildEditOutputLabel,
    buildEditTargetPath,
    ensureEditToolReady,
    ensureProfileToolReady,
    findEditPreset,
    getDerivedMimeType,
    getEditRecipeSignature,
    getPreparedSourcePath,
    requirePreparedSource,
    resetEditForCurrentSource,
    runEditPipeline,
    runProfilePreflight,
    sanitizeFileSegment,
    visualAnalysisRuntime,
  };
}
