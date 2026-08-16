import { asLabRecord, asNonEmptyString } from "../domain/lab-types.js";
import type {
  LabGlobalProcessSummary,
  LabRun,
  LabMediaViewportState,
  LabSelection,
  LabSourceRetryBlockReason,
  LabFeatureStage,
  LabStoreState,
  LabRightPanelContext,
  LabWorkspaceDiff,
  LabWorkspaceLockState,
  PreflightSeverity,
  ReportFreshness,
  LabDrawerMode,
} from "../domain/lab-types.js";
import {
  CAPABILITY_FAMILIES,
  getAnalysisModuleRequirementMeta,
  getModuleIdsForCapabilityFamily,
} from "../domain/lab-types.js";
import {
  getCurrentFeatureReportRecord,
  getProjectSource,
} from "./selectors/lab-project-selectors.js";
import { getUserActions } from "./selectors/lab-activity-selectors.js";
import { isAnyHeavyWorkActive, isRunActive } from "./selectors/lab-processing-selectors.js";
import {
  getActiveROIRegions,
  getBookmarks,
  getEffectivePreviewAudioFocusSettings,
  getHypothesis,
  getInteractiveSettings,
  getPreviewVolume,
} from "./selectors/lab-workspace-media-selectors.js";
import {
  getActiveModule,
  getAudioVisualizationArtifact,
  getCurrentReports,
  getCurrentRun,
  getEditPreview,
  getRunSnapshotSummary,
  getSourceKind,
  getSourceMetadata,
  getSourceMode,
  getSourceProbeStatus,
  getToolState,
} from "./selectors/lab-source-selectors.js";
import {
  getCurrentPreflight,
  getReadySelectedAnalysisCapabilityIds,
  getSelectedCapabilities,
  getSourceReady,
} from "./selectors/lab-capability-selectors.js";
import {
  getActiveExecutionIntent,
  getActiveInspectionSnapshot,
  getActiveSelection,
  getActiveSuggestionPreview,
  getEffectiveActiveSelection,
  getInspectionMode,
  getInterpretationItems,
  getRoiFocusActive,
  getSelectionContextDurationMs,
  getSelectionContextSourceKind,
  getWorkspaceSurfaceSuggestions,
} from "./selectors/lab-execution-flow-selectors.js";
import { isFullSourceWorkspaceSelection } from "./lab-workspace-selection.js";

export {
  getAnalysisPreparationGroups,
  getAvailableCapabilities,
  getAvailableOperationCapabilities,
  getCapabilityWorkflowSummary,
  getCurrentPreflight,
  filterReadyAnalysisCapabilityIds,
  getReadyAnalysisPreparationGroups,
  getReadySelectedAnalysisCapabilityIds,
  getOperationSettings,
  getSelectedCapabilities,
  getSourceReady,
} from "./selectors/lab-capability-selectors.js";
export {
  buildExecutionDispatchId,
  buildExecutionResultInterpretation,
  getExecutionGoalEvaluation,
  __testOnlyBuildExecutionPatternKey,
  __testOnlyResetExecutionPatternRegistry,
} from "./selectors/lab-execution-result-selectors.js";
export type {
  LabExecutionGoalEvaluationInput,
  LabExecutionResultInterpretation,
  LabExecutionResultInterpretationInput,
} from "./selectors/lab-execution-result-selectors.js";
export {
  buildSuggestionPreview,
  getActiveExecutionAlternatives,
  getActiveExecutionCandidate,
  getActiveExecutionCommitment,
  getActiveExecutionGoalEvaluation,
  getActiveExecutionIntent,
  getActiveExecutionIntentId,
  getActiveExecutionPayloadPreview,
  getActiveExecutionPlan,
  getActiveExecutionReadiness,
  getActiveExecutionReflection,
  getActiveExecutionResult,
  getActiveExecutionResultInterpretation,
  getActiveExecutionSimulation,
  getActiveExecutionStaging,
  getActiveInspectionSnapshot,
  getActiveSelection,
  getActiveSuggestionPreview,
  getActiveSuggestionPreviewId,
  getEffectiveActiveSelection,
  getExecutionDispatchCandidate,
  getExecutionJourneyStep,
  getInspectionMode,
  getInterpretationItems,
  getRoiFocusActive,
  getSelectionContextDurationMs,
  getSelectionContextSourceKind,
  getSelectionDuration,
  getSelectionSuggestions,
  isSelectionValid,
} from "./selectors/lab-execution-flow-selectors.js";
export {
  getActiveOperationCount,
  getProcessingOverlayState,
  getRunElapsedSeconds,
  isAnyHeavyWorkActive,
  isRunActive,
} from "./selectors/lab-processing-selectors.js";
export {
  getActionOutputs,
  getGlobalActivityFeed,
  getHubUserActions,
  getProcessAnalysisScope,
  getRecentUserActions,
  getUserActions,
  getVisibleArtifacts,
  getVisibleEventOffset,
  getVisibleEvents,
  getVisibleLiveFindings,
  getVisibleRawLogs,
  hasMoreVisibleArtifacts,
  hasMoreVisibleEvents,
  hasMoreVisibleLiveFindings,
} from "./selectors/lab-activity-selectors.js";
export {
  getActiveROIRegions,
  getAudioFocusSettings,
  getBookmarks,
  getComparisonInteractiveSettings,
  getDualPreviewVolume,
  getEffectivePreviewAudioFocusSettings,
  getHypothesis,
  getInteractiveSettings,
  getInteractiveSettingsForComparisonSide,
  getPreviewVolume,
  getROIRegions,
  getSelectedDualPreviewAudioAsset,
  isDualPreviewActive,
  isDualPreviewAvailable,
} from "./selectors/lab-workspace-media-selectors.js";

export {
  getActiveProject,
  getCurrentFeatureId,
  getCurrentFeatureMeta,
  getCurrentFeatureProcessRecord,
  getCurrentFeatureReportRecord,
  getProjectEdit,
  getProjectProfile,
  getProjectSource,
  getProjects,
  getSnapshot,
} from "./selectors/lab-project-selectors.js";
export {
  getActiveEditOutput,
  getActiveModule,
  getActivePreviewArtifact,
  getAssetById,
  getAssets,
  getAssetsByRun,
  getAssetsBySource,
  getAssetsByType,
  getAudioVisualizationArtifact,
  getComparisonVariants,
  getCurrentReports,
  getCurrentRun,
  getCurrentSourceAsset,
  getEditOutputs,
  getEditPreview,
  getFeatureCompatibility,
  getLinkedAudioAssets,
  getParentSourceForAsset,
  getPreviewArtifacts,
  getProfileModelCatalog,
  getReportExports,
  getRunSnapshotSummary,
  getSelectedProfileModel,
  getSourceKind,
  getSourceMetadata,
  getSourceMode,
  getSourceProbeStatus,
  getSourceStatus,
  getToolState,
  getWorkbench,
} from "./selectors/lab-source-selectors.js";

export function getPrimaryActionLabel(state: LabStoreState) {
  const sourceProbeStatus = getSourceProbeStatus(state);

  if (hasReportPayload(state) && (state.ui.workspace.reportOverlayOpen || isRunComplete(state))) {
    return "Raporları Dışa Aktar";
  }
  if (isRunActive(state)) {
    return "Çalışmayı İptal Et";
  }
  if (getSourceReady(state)) {
    return asNonEmptyString(getEditPreview(state)["status"]) === "ready"
      ? "Önizlemeyi Yenile"
      : "Önizleme Üret";
  }
  return sourceProbeStatus === "completed" ? "Kaynağı Yenile" : "Kaynağı Hazırla";
}

// V2.3 workspace selectors

export function isLabWorkspaceSurfaceReady(state: LabStoreState) {
  if (state.bootReady) {
    return true;
  }
  if (state.snapshot === null) {
    return false;
  }
  return (
    state.projectIndex.activeProjectId !== null ||
    state.projectIndex.projects.length > 0 ||
    state.source !== null ||
    state.run !== null ||
    state.reports.user !== null ||
    state.reports.ai !== null
  );
}

export function getWorkspaceMode(
  state: LabStoreState
): import("../domain/lab-types.js").WorkspaceMode {
  if (!isLabWorkspaceSurfaceReady(state)) {
    return "loading";
  }
  const run = getCurrentRun(state);
  if (run && (run.state === "running" || run.state === "queued")) {
    return "analyzing";
  }
  if (
    run &&
    (run.state === "completed" ||
      run.state === "ready" ||
      run.state === "failed" ||
      run.state === "cancelled")
  ) {
    return "complete";
  }
  return "workspace";
}

function normalizeSourceModeToken(value: string | null) {
  return (value || "").replaceAll(/\s+/g, "").toLowerCase();
}

function isLocalSourceRouteLabel(routeLabel: string) {
  return routeLabel === "localcopy" || routeLabel === "assetreuse";
}

export function isLoadedSourceMatchingMode(source: Record<string, unknown>, mode: string) {
  const normalizedMode = normalizeSourceModeToken(mode);
  const routeLabel = normalizeSourceModeToken(asNonEmptyString(source["routeLabel"]));
  if (routeLabel !== "") {
    if (normalizedMode === "url") {
      return routeLabel === "directurl";
    }
    if (normalizedMode === "youtube") {
      return routeLabel === "youtube";
    }
    return isLocalSourceRouteLabel(routeLabel);
  }
  const sourceMode = normalizeSourceModeToken(asNonEmptyString(source["mode"]));
  return sourceMode !== "" && sourceMode === normalizedMode;
}

export function getWorkspaceLockState(state: LabStoreState): LabWorkspaceLockState {
  const heavy = isAnyHeavyWorkActive(state);
  return {
    source: heavy,
    timeline: heavy,
    roi: heavy,
    analysis: heavy,
    hypothesis: heavy,
    focusControls: false,
  };
}

export function getMediaViewportState(state: LabStoreState): LabMediaViewportState {
  const probeStatus = getSourceProbeStatus(state);
  if (probeStatus === "running") {
    return "loading";
  }
  if (probeStatus === "failed") {
    return "error";
  }
  const source = getProjectSource(state);
  if (getSourceReady(state) && isLoadedSourceMatchingMode(source, getSourceMode(state))) {
    return "active";
  }
  return "empty";
}

function getModuleProgress(run: LabRun | null) {
  if (run === null || Array.isArray(run.moduleOrder) !== true || run.moduleOrder.length === 0) {
    return {
      completedCount: 0,
      totalCount: 0,
    };
  }
  const completedCount = run.moduleOrder.filter(function (moduleId) {
    const status = run.modules[moduleId]?.status;
    return status === "completed" || status === "ready";
  }).length;
  return {
    completedCount,
    totalCount: run.moduleOrder.length,
  };
}

export function getLaboratoryProcessSummary(state: LabStoreState): LabGlobalProcessSummary {
  const run = getCurrentRun(state);
  const activeModule = getActiveModule(state);
  const runningAction = getUserActions(state).find(function (action) {
    return action.status === "running";
  });
  const moduleProgress = getModuleProgress(run);

  if (run !== null && (run.state === "running" || run.state === "queued")) {
    const activeTaskLabel =
      activeModule?.title || activeModule?.id || run.targetLabel || runningAction?.label || null;
    return {
      state: "analyzing",
      completedCount: moduleProgress.completedCount,
      totalCount: moduleProgress.totalCount,
      activeTaskLabel,
      progressLabel:
        moduleProgress.totalCount > 0
          ? `${String(moduleProgress.completedCount)} / ${String(moduleProgress.totalCount)}`
          : null,
      tone: "running",
    };
  }

  if (runningAction !== undefined || state.sourceProbeStatus === "running") {
    const activeTaskLabel = runningAction?.label || null;
    const activeTaskKey =
      runningAction?.label === undefined && state.sourceProbeStatus === "running"
        ? "sourcePreparation"
        : null;
    return {
      state: "processing",
      completedCount: 0,
      totalCount: 1,
      activeTaskKey,
      activeTaskLabel,
      progressKey: activeTaskLabel !== null || activeTaskKey !== null ? "oneActiveTask" : null,
      progressLabel: null,
      tone: "running",
    };
  }

  return {
    state: "idle",
    completedCount: 0,
    totalCount: 0,
    activeTaskLabel: null,
    progressLabel: null,
    tone: "neutral",
  };
}

function formatSelectionRangeLabel(selection: LabSelection | null) {
  if (selection === null || selection.endMs <= selection.startMs) {
    return null;
  }
  return `${String(Math.round(selection.startMs))} ms → ${String(Math.round(selection.endMs))} ms`;
}

export function getLaboratoryRightPanelContext(state: LabStoreState): LabRightPanelContext {
  const selection = getActiveSelection(state);
  const activeIntent = getActiveExecutionIntent(state);
  return {
    activeIntentLabel: activeIntent?.label || null,
    processSummary: getLaboratoryProcessSummary(state),
    selectionLabel: selection?.label || null,
    selectionRangeLabel: formatSelectionRangeLabel(selection),
  };
}

export function getTimelineSelection(state: LabStoreState) {
  const activeSelection = getActiveSelection(state);
  if (
    activeSelection !== null &&
    activeSelection.endMs > activeSelection.startMs &&
    !isFullSourceWorkspaceSelection(activeSelection)
  ) {
    return {
      startMs: activeSelection.startMs,
      endMs: activeSelection.endMs,
    };
  }
  return {
    startMs: state.ui.workspace.timelineStartMs,
    endMs: state.ui.workspace.timelineEndMs,
  };
}

export function getWaveformTimelineModel(state: LabStoreState) {
  const sourceKind = getSelectionContextSourceKind(state);
  const durationMs = getSelectionContextDurationMs(state);
  const effectiveSelection = getEffectiveActiveSelection(state);
  const selection = getTimelineSelection(state);
  const waveformContentDurationMs = durationMs;
  const waveformVisibleStartMs = 0;
  const waveformVisibleEndMs = durationMs;
  const waveformContentVisibleStartMs = 0;
  const waveformContentVisibleEndMs = waveformContentDurationMs;
  const waveformWindowDurationMs =
    durationMs > 0 ? Math.max(0, waveformVisibleEndMs - waveformVisibleStartMs) : 0;
  const waveformCropStartRatio =
    waveformContentDurationMs > 0
      ? Math.max(0, Math.min(1, waveformContentVisibleStartMs / waveformContentDurationMs))
      : 0;
  const waveformCropEndRatio =
    waveformContentDurationMs > 0
      ? Math.max(0, Math.min(1, waveformContentVisibleEndMs / waveformContentDurationMs))
      : 1;
  const hasSelectionInspectionLens =
    (sourceKind === "audio" || sourceKind === "video") &&
    selection.startMs !== null &&
    selection.endMs !== null &&
    selection.endMs > selection.startMs &&
    waveformContentDurationMs > 0;
  const waveformInspectionLensWindowStartMs =
    hasSelectionInspectionLens === true
      ? Math.max(waveformVisibleStartMs, selection.startMs ?? 0)
      : 0;
  const waveformInspectionLensWindowEndMs =
    hasSelectionInspectionLens === true
      ? Math.min(waveformVisibleEndMs, selection.endMs ?? waveformVisibleEndMs)
      : 0;
  const waveformInspectionLensDurationMs =
    hasSelectionInspectionLens === true
      ? Math.max(1, waveformInspectionLensWindowEndMs - waveformInspectionLensWindowStartMs)
      : 0;
  const waveformInspectionLensContentStartMs =
    hasSelectionInspectionLens === true ? Math.max(0, waveformInspectionLensWindowStartMs) : 0;
  const waveformInspectionLensContentEndMs =
    hasSelectionInspectionLens === true
      ? Math.max(
          waveformInspectionLensContentStartMs,
          Math.min(waveformContentDurationMs, waveformInspectionLensWindowEndMs)
        )
      : 0;
  const waveformInspectionLensCropStartRatio =
    hasSelectionInspectionLens === true && waveformContentDurationMs > 0
      ? Math.max(0, Math.min(1, waveformInspectionLensContentStartMs / waveformContentDurationMs))
      : 0;
  const waveformInspectionLensCropEndRatio =
    hasSelectionInspectionLens === true && waveformContentDurationMs > 0
      ? Math.max(
          waveformInspectionLensCropStartRatio,
          Math.min(1, waveformInspectionLensContentEndMs / waveformContentDurationMs)
        )
      : 1;

  return {
    activeExecutionIntent: getActiveExecutionIntent(state),
    activeSelection: effectiveSelection,
    activeInspectionSnapshot: getActiveInspectionSnapshot(state),
    activeSuggestionPreview: getActiveSuggestionPreview(state),
    audioFocus: getEffectivePreviewAudioFocusSettings(state),
    bookmarks: getBookmarks(state),
    durationMs,
    endMs: selection.endMs,
    inspectionMode: getInspectionMode(state),
    interpretationItems: getInterpretationItems(state),
    roiFocusActive: getRoiFocusActive(state),
    selectionLoopEnabled: state.ui.workspace.selectionLoopEnabled,
    selectionMicroZoomOpen: state.ui.workspace.selectionMicroZoomOpen,
    selectionSuggestions: getWorkspaceSurfaceSuggestions(state),
    lockState: getWorkspaceLockState(state),
    startMs: selection.startMs,
    sourceKind,
    timelineHighlight: null,
    transportVolume: getPreviewVolume(state),
    visualizationArtifact: getAudioVisualizationArtifact(state),
    visualizationMode: state.ui.workspace.audioFocus.visualizationMode,
    waveformContentDurationMs,
    waveformCropEndRatio,
    waveformCropStartRatio,
    waveformOffsetMs: 0,
    waveformSourceLabel:
      sourceKind === "audio"
        ? "Source audio"
        : sourceKind === "video"
          ? "Embedded audio"
          : "Waveform",
    waveformSyncLabel: "Preview and waveform share the same master axis.",
    waveformInspectionLens: {
      cropEndRatio: waveformInspectionLensCropEndRatio,
      cropStartRatio: waveformInspectionLensCropStartRatio,
      durationMs: waveformInspectionLensDurationMs,
      enabled: hasSelectionInspectionLens,
      sourceLabel:
        hasSelectionInspectionLens === true
          ? `Micro zoom · ${selection.endMs! - selection.startMs!} ms`
          : "Micro zoom",
      windowDurationMs: waveformInspectionLensDurationMs,
      windowStartMs: waveformInspectionLensWindowStartMs,
    },
    waveformWindowDurationMs:
      sourceKind === "audio" || sourceKind === "video" ? waveformWindowDurationMs : 0,
    waveformWindowStartMs:
      sourceKind === "audio" || sourceKind === "video" ? waveformVisibleStartMs : 0,
  };
}

export function getWorkspaceAnalysisInput(state: LabStoreState) {
  return {
    timeRange: getTimelineSelection(state),
    roiRegions: getActiveROIRegions(state),
    hypothesis: getHypothesis(state),
    selectedCapabilities: getSelectedCapabilities(state),
    interactiveSettings: getInteractiveSettings(state),
    bookmarks: getBookmarks(state),
  };
}

export function getWorkspaceDiff(state: LabStoreState): LabWorkspaceDiff | null {
  const snapshotSummary = getRunSnapshotSummary(state);
  if (!snapshotSummary) {
    return null;
  }

  const liveTimeline = getTimelineSelection(state);
  const liveHypothesis = getHypothesis(state).trim();

  const timelineChanged =
    liveTimeline.startMs !== snapshotSummary.timelineStartMs ||
    liveTimeline.endMs !== snapshotSummary.timelineEndMs;
  const hypothesisChanged = liveHypothesis !== (snapshotSummary.hypothesis || "");

  const changedKeys: LabWorkspaceDiff["changedKeys"] = [];
  if (timelineChanged) {
    changedKeys.push("timeline");
  }
  if (hypothesisChanged) {
    changedKeys.push("hypothesis");
  }
  return {
    timelineChanged,
    hypothesisChanged,
    workspaceDirty: changedKeys.length > 0,
    changedKeys,
  };
}

export function getReportOverlayOpen(state: LabStoreState): boolean {
  return state.ui.workspace.reportOverlayOpen;
}

// ---------------------------------------------------------------------------
// Condition-driven readiness selectors (replaces stage-based gating)
// ---------------------------------------------------------------------------

export function getSourceActionBlockReason(state: LabStoreState): string | null {
  const sourceMode = getSourceMode(state);
  const drafts = state.ui.sourceDrafts;
  if (sourceMode === "url" && drafts.urlInput.trim() === "") {
    return "Kaynak URL gerekli";
  }
  if (sourceMode === "youtube" && drafts.youtubeUrl.trim() === "") {
    return "YouTube URL gerekli";
  }
  return null;
}

export function getSourceRetryBlockReason(state: LabStoreState): LabSourceRetryBlockReason | null {
  if (isRunActive(state)) {
    return "active-run";
  }
  if (getSourceProbeStatus(state) !== "failed") {
    return "not-failed";
  }
  const sourceMode = getSourceMode(state);
  const drafts = state.ui.sourceDrafts;
  const source = getProjectSource(state);
  if (sourceMode === "url") {
    const sourceUrl =
      drafts.urlInput.trim() ||
      asNonEmptyString(source["sourceUrl"]) ||
      asNonEmptyString(source["url"]);
    return sourceUrl ? null : "missing-url";
  }
  if (sourceMode === "youtube") {
    const youtubeUrl =
      drafts.youtubeUrl.trim() ||
      asNonEmptyString(source["youtubeUrl"]) ||
      asNonEmptyString(source["sourceUrl"]) ||
      asNonEmptyString(source["url"]);
    if (!youtubeUrl) {
      return "missing-youtube-url";
    }
    const tools = asLabRecord(getToolState(state)["tools"]);
    const ytDlp = asLabRecord(tools["yt-dlp"]);
    if (ytDlp["installed"] !== true && asNonEmptyString(ytDlp["status"]) !== "installed") {
      return "missing-yt-dlp";
    }
    return null;
  }
  return "local-reselect-required";
}

export function getPreflightSeverity(state: LabStoreState): PreflightSeverity {
  const preflight = getCurrentPreflight(state);
  if (preflight.status === "blocked" && preflight.missingDependencies.length > 0) {
    return "will-fail";
  }
  if (preflight.status === "blocked" || preflight.status === "warning") {
    return "warning";
  }
  if (!preflight.stageReady && preflight.status !== "ready") {
    return "warning";
  }
  return "clear";
}

export function getPreflightWarnings(state: LabStoreState): string[] {
  const preflight = getCurrentPreflight(state);
  const msgs: string[] = [];
  if (preflight.missingDependencies.length > 0) {
    msgs.push(`Eksik dependency: ${preflight.missingDependencies.join(", ")}`);
  }
  preflight.warnings.forEach(function (w) {
    if (!msgs.includes(w)) msgs.push(w);
  });
  if (msgs.length === 0 && preflight.reason) {
    msgs.push(preflight.reason);
  }
  return msgs;
}

export function getAnalysisActionBlockReason(state: LabStoreState): string | null {
  if (getReadySelectedAnalysisCapabilityIds(state).length === 0) {
    return "En az bir analiz modülü seçilmelidir.";
  }
  return null;
}

export function getReportActionBlockReason(state: LabStoreState): string | null {
  const reports = getCurrentReports(state);
  const reportStatus = asNonEmptyString(getCurrentFeatureReportRecord(state)["status"]);
  if (
    reports.user !== null ||
    reports.ai !== null ||
    reportStatus === "ready" ||
    reportStatus === "stale"
  ) {
    return null;
  }
  return "Rapor henüz üretilmedi.";
}

export function getEditActionBlockReason(state: LabStoreState): string | null {
  const source = getProjectSource(state);
  const probeStatus = getSourceProbeStatus(state);
  if (Object.keys(source).length === 0) {
    return "Önce kaynak seçilmelidir.";
  }
  if (probeStatus === "running") {
    return "Kaynak probe işlemi tamamlanmadı.";
  }
  if (probeStatus === "failed") {
    return "Kaynak probe hata verdi.";
  }
  if (probeStatus !== "completed") {
    return "Kaynak probe tamamlanmalı.";
  }
  return null;
}

export function isRunComplete(state: LabStoreState): boolean {
  const run = getCurrentRun(state);
  return (
    run !== null &&
    (run.state === "completed" ||
      run.state === "ready" ||
      run.state === "failed" ||
      run.state === "cancelled")
  );
}

export function hasReportPayload(state: LabStoreState): boolean {
  const reports = getCurrentReports(state);
  const reportStatus = asNonEmptyString(getCurrentFeatureReportRecord(state)["status"]);
  return (
    reports.user !== null ||
    reports.ai !== null ||
    reportStatus === "ready" ||
    reportStatus === "stale"
  );
}

export function getToolRelevanceFilter(state: LabStoreState) {
  const sourceMode = getSourceMode(state);
  const sourceKind = getSourceKind(state);
  const wsMode = getWorkspaceMode(state);
  const moduleToggles = asLabRecord(asLabRecord(state.workbench)["moduleToggles"]);

  const requiredToolIds = new Set<string>();
  const optionalToolIds = new Set<string>();
  const selectedCapabilities = getSelectedCapabilities(state);
  selectedCapabilities.forEach(function (capabilityId) {
    const family = CAPABILITY_FAMILIES.find(function (entry) {
      return entry.id === capabilityId;
    });
    family?.requiredTools.forEach(function (toolId) {
      requiredToolIds.add(toolId);
    });
    getModuleIdsForCapabilityFamily(capabilityId).forEach(function (moduleId) {
      if (
        Object.prototype.hasOwnProperty.call(moduleToggles, moduleId) &&
        moduleToggles[moduleId] !== true
      ) {
        return;
      }
      const moduleMeta = getAnalysisModuleRequirementMeta(capabilityId, moduleId);
      moduleMeta.requiredToolIds.forEach(function (toolId) {
        requiredToolIds.add(toolId);
      });
      moduleMeta.optionalToolIds.forEach(function (toolId) {
        optionalToolIds.add(toolId);
      });
    });
  });

  return {
    sourceMode,
    sourceKind,
    selectedCapabilities,
    workspaceMode: wsMode,
    requiredToolIds: Array.from(requiredToolIds),
    optionalToolIds: Array.from(optionalToolIds),
  };
}

// ---------------------------------------------------------------------------
// Condition-driven freshness & dirty selectors (IFL §4h, §5c)
// ---------------------------------------------------------------------------

export function getReportFreshness(state: LabStoreState): ReportFreshness | null {
  const reports = getCurrentReports(state);
  const reportStatus = asNonEmptyString(getCurrentFeatureReportRecord(state)["status"]);
  const hasReport =
    reports.user !== null ||
    reports.ai !== null ||
    reportStatus === "ready" ||
    reportStatus === "stale";
  if (!hasReport) {
    return null;
  }
  const workspaceDirty = getWorkspaceDiff(state)?.workspaceDirty === true;
  if (reportStatus === "stale") {
    return {
      state: "stale",
      workspaceDirty,
    };
  }
  const run = getCurrentRun(state);
  if (!run) {
    return {
      state: "previous-run",
      workspaceDirty,
    };
  }
  if (run.state === "running" || run.state === "queued") {
    return {
      state: "previous-run",
      workspaceDirty,
    };
  }
  if (run.state === "completed" || run.state === "ready") {
    return {
      state: "current",
      workspaceDirty,
    };
  }
  // failed or cancelled
  return {
    state: "stale",
    workspaceDirty,
  };
}

export function isWorkspaceDirty(state: LabStoreState): boolean {
  return getWorkspaceDiff(state)?.workspaceDirty === true;
}

export function resolveDrawerMode(state: LabStoreState): LabDrawerMode {
  if (isRunActive(state)) return "running";
  const run = getCurrentRun(state);
  if (!getSourceReady(state)) return "setup";
  if (!hasReportPayload(state)) {
    if (isRunComplete(state) && asNonEmptyString(run?.emptyReason) !== null) {
      return "explore";
    }
    return "setup";
  }
  if (state.ui.workspace.drawerModeOverride === "setup") {
    return "setup";
  }
  if (state.ui.workspace.drawerModeOverride === "result") {
    return "result";
  }
  const freshness = getReportFreshness(state);
  if (freshness?.state === "current" && state.ui.workspace.userExploreToggle !== true) {
    return "result";
  }
  return "explore";
}

export function getDrawerCollapsed(state: LabStoreState): boolean {
  return state.ui.workspace.drawerCollapsed === true;
}

function formatMsAsTime(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function buildAnalysisPreviewSentence(state: LabStoreState): string {
  const selectedCapabilities = getReadySelectedAnalysisCapabilityIds(state);
  if (selectedCapabilities.length === 0) return "";
  const timelineSelection = getTimelineSelection(state);
  const metadata = getSourceMetadata(state);
  const durationSeconds =
    typeof metadata["durationSeconds"] === "number" ? metadata["durationSeconds"] : 0;
  const durationMs = Math.round(durationSeconds * 1000);
  const isFullRange =
    (timelineSelection.startMs === null || timelineSelection.startMs <= 0) &&
    (timelineSelection.endMs === null || timelineSelection.endMs >= durationMs - 500);
  const scopeLabel = isFullRange
    ? `tüm kaynak (${formatMsAsTime(durationMs)})`
    : `${formatMsAsTime(timelineSelection.startMs ?? 0)} \u2013 ${formatMsAsTime(timelineSelection.endMs ?? durationMs)}`;
  const selectedLabels = selectedCapabilities
    .map(function (id) {
      return (
        CAPABILITY_FAMILIES.find(function (family) {
          return family.id === id;
        })?.label || id
      );
    })
    .join(", ");
  const hypothesis = getHypothesis(state).trim();
  const hypothesisAppend = hypothesis.length > 0 ? ` Hipotez: \u201C${hypothesis}\u201D` : "";
  return `Bu analiz ${scopeLabel} üzerinde ${selectedLabels} modüllerini çalıştıracak.${hypothesisAppend}`;
}

export function getToolLifecycleStage(state: LabStoreState): LabFeatureStage {
  if (state.ui.workspace.reportOverlayOpen && hasReportPayload(state)) {
    return "report";
  }
  if (isRunComplete(state) && hasReportPayload(state)) {
    return "report";
  }
  if (isRunActive(state)) {
    return "process";
  }
  if (getSourceReady(state)) {
    return "edit";
  }
  return "source";
}
