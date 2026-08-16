import {
  asLabRecord,
  asNonEmptyString,
  clampPercent,
  normalizeLabFeatureId,
} from "../../domain/lab-types.js";
import type {
  LabEventFeedItem,
  LabProjectImportMethod,
  LabProjectImportReviewFocus,
  LabSourceDrafts,
  LabStoreState,
  LabUserActionEvent,
} from "../../domain/lab-types.js";
import { normalizeLabPreflight } from "../../services/preflight-service.js";
import { getWorkspaceSourceSelectionResetKey } from "../lab-workspace-selection.js";
import {
  LAB_USER_ACTION_HISTORY_LIMIT,
  getTrackedLabUserActionDefinition,
  isTrackedLabUserAction,
} from "../lab-user-actions.js";
import { normalizeStoreAssets } from "./lab-store-assets.js";
import {
  cloneSourceDrafts,
  createDefaultProjectImportState,
  createEmptyReports,
  createIdlePreflight,
  createIdleYoutubeImportState,
} from "./lab-store-defaults.js";
import {
  normalizeUserActionResultAssetIds,
  toReportsFromRecord,
  toRunFromProcessRecord,
} from "./lab-store-host-records.js";
import {
  chooseDefaultYoutubeFormats,
  normalizeProjectImportKind,
  normalizeProjectImportUrlCheckKind,
  normalizeSourceDraftPatch,
  normalizeYoutubeFormatSelection,
  normalizeYoutubeImportFormats,
  normalizeYoutubeImportPreview,
} from "./lab-store-import-state.js";
import {
  ensurePendingRun,
  prepareRunForHostEvent,
  shouldKeepPendingRunDuringSnapshot,
} from "./lab-store-run-sync.js";
import { resetWorkspaceForSourceActivation } from "./lab-store-source-reset.js";
import { replaceAnalysisPreparationModuleToggles } from "./lab-store-workspace-state.js";

function syncDraftsFromSnapshot(state: LabStoreState, snapshot: Record<string, unknown>) {
  const activeProject = asLabRecord(snapshot["activeProject"]);
  const activeProjectId = asNonEmptyString(activeProject["id"]);
  if (activeProjectId === null) {
    state.ui.lastHydratedProjectId = null;
    return state;
  }

  const source = asLabRecord(activeProject["source"]);
  const sourceDrafts = asLabRecord(source["drafts"]);
  if (state.ui.sourceDraftDirty !== true || state.ui.lastHydratedProjectId !== activeProjectId) {
    const captureMode = asNonEmptyString(sourceDrafts["youtubeCaptureMode"]);
    state.ui.sourceDrafts = {
      urlInput: asNonEmptyString(sourceDrafts["urlInput"]) || "",
      youtubeUrl: asNonEmptyString(sourceDrafts["youtubeUrl"]) || "",
      youtubePreset: asNonEmptyString(sourceDrafts["youtubePreset"]),
      youtubeCustom: asLabRecord(sourceDrafts["youtubeCustom"]),
      youtubeCaptureMode:
        captureMode === "audio-only" || captureMode === "video-only" ? captureMode : "video+audio",
    };
    syncProjectImportDraftFromSourceDrafts(state, source["kind"], {
      force: state.ui.lastHydratedProjectId !== activeProjectId,
    });
  }

  const edit = asLabRecord(activeProject["edit"]);
  const recipeCommon = asLabRecord(asLabRecord(edit["recipe"])["common"]);
  if (state.ui.editDraftDirty !== true || state.ui.lastHydratedProjectId !== activeProjectId) {
    state.ui.editDrafts = {
      ...state.ui.editDrafts,
      outputNameHint: asNonEmptyString(recipeCommon["outputNameHint"]) || "",
      notes: asNonEmptyString(recipeCommon["notes"]) || "",
      activeSourceRef:
        asNonEmptyString(asLabRecord(edit["preview"])["status"]) === "ready" &&
        asNonEmptyString(edit["handoffMode"]) === "derived"
          ? "preview"
          : "original",
    };
  }

  const profile = asLabRecord(activeProject["profile"]);
  if (state.ui.profileDraftDirty !== true || state.ui.lastHydratedProjectId !== activeProjectId) {
    state.ui.profileDrafts = {
      sensitivity:
        typeof profile["sensitivity"] === "number" ? (profile["sensitivity"] as number) : null,
      transcriptSampleSeconds:
        typeof profile["transcriptSampleSeconds"] === "number"
          ? (profile["transcriptSampleSeconds"] as number)
          : null,
      depth: asNonEmptyString(profile["depth"]) || "balanced",
      frameSampleDensity: asNonEmptyString(profile["frameSampleDensity"]) || "balanced",
    };
  }

  state.ui.lastHydratedProjectId = activeProjectId;
  return state;
}

export function pushUserAction(state: LabStoreState, actionEvent: LabUserActionEvent) {
  const normalizedResultAssetIds = normalizeUserActionResultAssetIds(actionEvent.resultAssetIds);
  state.userActions = state.userActions.filter(function (entry) {
    return entry.id !== actionEvent.id;
  });
  state.userActions.unshift({
    ...actionEvent,
    ...(normalizedResultAssetIds === undefined ? {} : { resultAssetIds: normalizedResultAssetIds }),
  });
  if (state.userActions.length > LAB_USER_ACTION_HISTORY_LIMIT) {
    state.userActions.length = LAB_USER_ACTION_HISTORY_LIMIT;
  }
}

export function patchUserAction(
  state: LabStoreState,
  id: string,
  patch: Partial<LabUserActionEvent>
): LabUserActionEvent | null {
  const target = state.userActions.find(function (entry) {
    return entry.id === id;
  });
  if (!target) {
    return null;
  }
  const nextPatch: Partial<LabUserActionEvent> = {
    ...patch,
  };
  if (Object.prototype.hasOwnProperty.call(patch, "resultAssetIds")) {
    const normalizedResultAssetIds = normalizeUserActionResultAssetIds(patch.resultAssetIds);
    if (normalizedResultAssetIds === undefined) {
      delete nextPatch.resultAssetIds;
    } else {
      nextPatch.resultAssetIds = normalizedResultAssetIds;
    }
  }
  Object.assign(target, nextPatch);
  return target;
}

function syncUserActionsFromHostEvent(state: LabStoreState, event: LabEventFeedItem) {
  const cancelledMessage = "İşlem iptal edildi.";
  const requestId = asNonEmptyString(event.requestId);
  if (requestId === null) {
    return;
  }

  const matchedAction = state.userActions.find(function (entry) {
    return entry.requestId === requestId;
  });
  if (!matchedAction || isTrackedLabUserAction(matchedAction.sourceAction) !== true) {
    return;
  }

  const sourceAction = matchedAction.sourceAction || event.action || null;
  const trackedDefinition = getTrackedLabUserActionDefinition(sourceAction);
  if (trackedDefinition === null) {
    return;
  }

  const jobId = asNonEmptyString(event.jobId);
  if (event.kind === "request-result") {
    if (matchedAction.jobId !== null && matchedAction.jobId !== undefined) {
      return;
    }
    if (event.stage === "cancelled") {
      patchUserAction(state, matchedAction.id, {
        status: "idle",
        finishedAt: event.timestamp || Date.now(),
        message: cancelledMessage,
        projectId: asNonEmptyString(event.projectId) || matchedAction.projectId || null,
        progress: null,
      });
    } else if (event.stage === "failed") {
      patchUserAction(state, matchedAction.id, {
        status: "error",
        finishedAt: event.timestamp || Date.now(),
        message: trackedDefinition.errorMessage,
        projectId: asNonEmptyString(event.projectId) || matchedAction.projectId || null,
      });
    }
    return;
  }

  const basePatch: Partial<LabUserActionEvent> = {
    jobId: jobId || matchedAction.jobId || null,
    projectId: asNonEmptyString(event.projectId) || matchedAction.projectId || null,
    sourceAction,
  };

  if (event.stage === "queued" || event.stage === "running") {
    patchUserAction(state, matchedAction.id, {
      ...basePatch,
      progress: typeof event.percent === "number" ? clampPercent(event.percent) : null,
      status: "running",
    });
    return;
  }

  if (event.stage === "completed") {
    const normalizedResultAssetIds = normalizeUserActionResultAssetIds(event.resultAssetIds);
    patchUserAction(state, matchedAction.id, {
      ...basePatch,
      status: "success",
      finishedAt: event.timestamp || Date.now(),
      message: trackedDefinition.successMessage,
      progress: 100,
      ...(normalizedResultAssetIds === undefined
        ? {}
        : { resultAssetIds: normalizedResultAssetIds }),
    });
    return;
  }

  if (event.stage === "cancelled") {
    patchUserAction(state, matchedAction.id, {
      ...basePatch,
      status: "idle",
      finishedAt: event.timestamp || Date.now(),
      message: cancelledMessage,
      progress: null,
    });
    return;
  }

  if (event.stage === "failed") {
    patchUserAction(state, matchedAction.id, {
      ...basePatch,
      status: "error",
      finishedAt: event.timestamp || Date.now(),
      message: trackedDefinition.errorMessage,
      progress: null,
    });
  }
}

function isSourceAction(action: string | null) {
  return (action || "").startsWith("source-");
}

function isProjectImportSourceAction(action: string | null) {
  return (
    action === "source-pick-local" ||
    action === "source-download-url" ||
    action === "source-download-youtube"
  );
}

export function resetProjectImportState(
  state: LabStoreState,
  options: {
    keepTracking?: boolean;
    markSourceDraftDirty?: boolean;
    reviewFocus?: LabProjectImportReviewFocus;
  } = {}
) {
  const previousImport = state.ui.projectImport;
  const nextImport = createDefaultProjectImportState();
  if (options.keepTracking === true) {
    nextImport.lastAction = previousImport.lastAction;
    nextImport.lastRequestId = previousImport.lastRequestId;
    nextImport.reviewFocus = options.reviewFocus || previousImport.reviewFocus;
  }
  state.ui.projectImport = nextImport;
  state.ui.youtubeImport = createIdleYoutubeImportState();
  state.ui.sourceDrafts = cloneSourceDrafts(nextImport.drafts[nextImport.activeKind]);
  state.ui.sourceDraftDirty = options.markSourceDraftDirty === false ? false : true;
}

function completeTrackedProjectImport(state: LabStoreState, event: LabEventFeedItem) {
  const action = event.action;
  if (
    event.stage !== "completed" ||
    isProjectImportSourceAction(action) !== true ||
    state.ui.projectImport.lastRequestId === null ||
    event.requestId !== state.ui.projectImport.lastRequestId ||
    state.ui.projectImport.lastAction !== action
  ) {
    return;
  }

  resetProjectImportState(state, { keepTracking: true, reviewFocus: "completed" });
  state.ui.activeWorkspaceAssetId = null;
  state.ui.activePreviewArtifactId = null;
  state.ui.activeDocumentOverlayAssetId = null;
  state.ui.workspace = {
    ...state.ui.workspace,
    drawerModeOverride: "setup",
    reportOverlayOpen: false,
    sourceIntakeCollapsed: true,
    userExploreToggle: false,
  };
}

function syncSourceProbeFromHostEvent(state: LabStoreState, event: LabEventFeedItem) {
  if (isSourceAction(event.action) !== true) {
    return;
  }
  if (event.stage === "completed") {
    state.sourceProbeStatus = "completed";
    completeTrackedProjectImport(state, event);
    return;
  }
  if (event.stage === "failed" || event.stage === "cancelled") {
    state.sourceProbeStatus = "failed";
    return;
  }
  if (
    event.stage === "queued" ||
    event.stage === "running" ||
    event.stage === "downloading" ||
    event.stage === "stdout" ||
    event.stage === "stderr"
  ) {
    state.sourceProbeStatus = "running";
  }
}

function syncProjectImportUrlCheckFromHostEvent(state: LabStoreState, event: LabEventFeedItem) {
  if (event.action !== "project-import-check-url") {
    return;
  }
  if (event.stage === "failed" || event.stage === "cancelled") {
    state.ui.projectImport = {
      ...state.ui.projectImport,
      urlCheck: {
        status: "error",
        url: state.ui.projectImport.urlCheck.url,
        isYoutube: null,
        kind: null,
        error: event.detail || event.message || "URL check failed.",
      },
      reviewFocus: "draft",
    };
    state.ui.youtubeImport = {
      ...state.ui.youtubeImport,
      status: "error",
      preview: null,
      formats: [],
      selectedVideoFormatId: null,
      selectedAudioFormatId: null,
    };
    return;
  }
  if (event.stage !== "completed") {
    return;
  }

  const result = asLabRecord(event.result);
  const url = asNonEmptyString(result["url"]) || state.ui.projectImport.urlCheck.url;
  const kind = normalizeProjectImportUrlCheckKind(result["kind"]) || "video";
  const isYoutube = result["isYoutube"] === true;
  const method: LabProjectImportMethod = isYoutube ? "youtube" : "url";
  const currentDraft = state.ui.projectImport.drafts[kind];
  const nextDraft = normalizeSourceDraftPatch(
    {
      urlInput: url || currentDraft.urlInput,
      youtubeUrl: isYoutube ? url || currentDraft.youtubeUrl : currentDraft.youtubeUrl,
    },
    currentDraft
  );

  state.ui.projectImport = {
    ...state.ui.projectImport,
    activeKind: kind,
    methods: {
      ...state.ui.projectImport.methods,
      [kind]: method,
    },
    drafts: {
      ...state.ui.projectImport.drafts,
      [kind]: nextDraft,
    },
    urlCheck: {
      status: "ready",
      url,
      isYoutube,
      kind,
      error: null,
    },
    reviewFocus: "draft",
  };
  state.ui.sourceDrafts = cloneSourceDrafts(nextDraft);
  state.ui.sourceDraftDirty = true;

  if (isYoutube) {
    const formats = normalizeYoutubeImportFormats(result["formats"]);
    const selectedDefaults = chooseDefaultYoutubeFormats(formats);
    state.ui.youtubeImport = {
      ...state.ui.youtubeImport,
      url,
      status: "ready",
      preview: normalizeYoutubeImportPreview(result["preview"]),
      formats,
      selectedVideoFormatId:
        normalizeYoutubeFormatSelection(result["selectedVideoFormatId"], formats) ||
        selectedDefaults.videoFormatId,
      selectedAudioFormatId:
        normalizeYoutubeFormatSelection(result["selectedAudioFormatId"], formats) ||
        selectedDefaults.audioFormatId,
    };
    return;
  }

  state.ui.youtubeImport = createIdleYoutubeImportState();
}

function syncPreviewFromHostEvent(state: LabStoreState, event: LabEventFeedItem) {
  if (event.action !== "edit-preview" && event.action !== "edit-apply") {
    return;
  }
  if (!state.editConfig) {
    return;
  }
  const preview = asLabRecord(state.editConfig["preview"]);
  if (event.stage === "completed") {
    preview["status"] = "ready";
    preview["percent"] = 100;
  } else if (event.stage === "failed" || event.stage === "cancelled") {
    preview["status"] = "failed";
  } else if (event.stage === "queued" || event.stage === "running") {
    preview["status"] = "running";
  } else {
    return;
  }
  state.editConfig = {
    ...state.editConfig,
    preview,
  };
}

function syncPreflightFromHostEvent(state: LabStoreState, event: LabEventFeedItem) {
  if (event.action !== "profile-run-preflight") {
    return;
  }
  if (event.stage === "completed") {
    state.preflight = normalizeLabPreflight(state.profileConfig);
    return;
  }
  if (event.stage === "failed" || event.stage === "cancelled") {
    state.preflight = {
      ...(state.preflight || createIdlePreflight()),
      status: "blocked",
      rawStatus: "failed",
      stageReady: false,
      reason: event.detail || "Ön kontrol tamamlanamadı.",
    };
    return;
  }
  if (event.stage === "queued" || event.stage === "running") {
    state.preflight = {
      ...(state.preflight || createIdlePreflight()),
      status: "idle",
      rawStatus: "running",
      reason: event.detail || "Ön kontrol çalışıyor.",
    };
  }
}

function syncRunStateFromHostEvent(state: LabStoreState, event: LabEventFeedItem) {
  if (event.action !== "process-run" && event.action !== "audio-process-run") {
    return;
  }
  if (prepareRunForHostEvent(state, event) !== true) {
    return;
  }
  if (
    state.run?.state === "cancelled" &&
    (event.stage === "completed" || event.stage === "failed")
  ) {
    return;
  }
  const isRunLevelEvent = event.moduleId == null;
  if (
    isRunLevelEvent !== true &&
    (event.stage === "failed" || event.stage === "cancelled" || event.stage === "completed")
  ) {
    return;
  }
  if (event.stage === "failed") {
    const run = ensurePendingRun(state, event.action, event);
    run.state = "failed";
    run.error = event.detail || run.error;
    state.ui.analysisCancelPending = false;
    state.ui.analysisCancelRequestId = null;
    if (isRunLevelEvent) {
      clearAnalysisPreparationSelection(state);
    }
    return;
  }
  if (event.stage === "cancelled") {
    const run = ensurePendingRun(state, event.action, event);
    run.state = "cancelled";
    run.endedAt = run.endedAt || Date.now();
    state.ui.analysisCancelPending = false;
    state.ui.analysisCancelRequestId = null;
    if (isRunLevelEvent) {
      clearAnalysisPreparationSelection(state);
    }
    return;
  }
  if (event.stage === "completed") {
    const run = ensurePendingRun(state, event.action, event);
    run.state = "completed";
    run.endedAt = run.endedAt || Date.now();
    state.ui.analysisCancelPending = false;
    state.ui.analysisCancelRequestId = null;
    if (isRunLevelEvent) {
      clearAnalysisPreparationSelection(state);
    }
    return;
  }
  if (event.stage === "queued" || event.stage === "running") {
    ensurePendingRun(state, event.action, event).state = "running";
    state.ui.workspace.userExploreToggle = false;
    state.ui.workspace.drawerModeOverride = null;
  }
}

export function clearAnalysisPreparationSelection(state: LabStoreState) {
  state.ui.workspace = {
    ...state.ui.workspace,
    analysisPrepExpandedCapabilityIds: [],
  };
  state.workbench = replaceAnalysisPreparationModuleToggles(state.workbench, []);
  state.selectedCapabilities = [];
}

function syncAnalysisCancelPendingFromHostEvent(state: LabStoreState, event: LabEventFeedItem) {
  if (event.action !== "process-cancel" && event.action !== "audio-process-cancel") {
    return;
  }
  if (event.stage === "failed") {
    const pendingRequestId = asNonEmptyString(state.ui.analysisCancelRequestId);
    const eventRequestId = asNonEmptyString(event.requestId);
    if (pendingRequestId !== null && eventRequestId !== pendingRequestId) {
      return;
    }
    state.ui.analysisCancelPending = false;
    state.ui.analysisCancelRequestId = null;
  }
}

export function syncCanonicalStateFromHostEvent(state: LabStoreState, event: LabEventFeedItem) {
  syncProjectImportUrlCheckFromHostEvent(state, event);
  syncSourceProbeFromHostEvent(state, event);
  syncPreviewFromHostEvent(state, event);
  syncPreflightFromHostEvent(state, event);
  syncRunStateFromHostEvent(state, event);
  syncAnalysisCancelPendingFromHostEvent(state, event);
  syncUserActionsFromHostEvent(state, event);
}

function deriveProbeStatus(
  source: Record<string, unknown>,
  fallback: LabStoreState["sourceProbeStatus"]
) {
  const status = asNonEmptyString(source["status"]);
  if (status === "ready" || asNonEmptyString(source["storedPath"]) !== null) {
    return "completed";
  }
  if (status === "error") {
    return "failed";
  }
  if (fallback === "running") {
    return "running";
  }
  return "idle";
}

function normalizeWorkspaceSourceModeToken(value: string | null) {
  return (value || "").replaceAll(/\s+/g, "").toLowerCase();
}

function isWorkspaceLocalSourceRouteLabel(routeLabel: string) {
  return routeLabel === "localcopy" || routeLabel === "assetreuse";
}

function isWorkspaceSourceMatchingMode(source: Record<string, unknown>, mode: string | null) {
  const routeLabel = normalizeWorkspaceSourceModeToken(asNonEmptyString(source["routeLabel"]));
  if (routeLabel === "") {
    return false;
  }
  if (mode === "url") {
    return routeLabel === "directurl";
  }
  if (mode === "youtube") {
    return routeLabel === "youtube";
  }
  return isWorkspaceLocalSourceRouteLabel(routeLabel);
}

function isWorkspaceSourceReady(source: Record<string, unknown> | null) {
  if (!source) {
    return false;
  }
  const sourceRecord = asLabRecord(source);
  const mode = asNonEmptyString(sourceRecord["mode"]) || "local";
  if (asNonEmptyString(sourceRecord["storedPath"]) === null) {
    return false;
  }
  return isWorkspaceSourceMatchingMode(sourceRecord, mode);
}

export function clampPreviewVolume(value: unknown) {
  if (typeof value !== "number" || Number.isFinite(value) !== true) {
    return 1.0;
  }
  return Math.max(0, Math.min(1, value));
}

export function syncCanonicalStateFromSnapshot(
  state: LabStoreState,
  snapshot: Record<string, unknown>,
  options: { preserveFeatureId?: boolean } = {}
) {
  const previousActiveProjectId = state.projectIndex.activeProjectId;
  const previousSourceReady = isWorkspaceSourceReady(state.source);
  const previousSourceSelectionKey = getWorkspaceSourceSelectionResetKey(state.source);
  state.snapshot = snapshot;
  state.bootReady = snapshot["ready"] === true || state.bootReady;
  if (options.preserveFeatureId !== true) {
    state.featureId = normalizeLabFeatureId(snapshot["featureId"], state.featureId);
  }

  state.projectIndex = {
    activeProjectId: asNonEmptyString(snapshot["activeProjectId"]),
    projects: Array.isArray(snapshot["projects"])
      ? (snapshot["projects"] as unknown[]).map(asLabRecord)
      : [],
  };
  state.workbench = asLabRecord(snapshot["workbench"]);
  state.ui.activePreviewArtifactId = asNonEmptyString(state.workbench["activePreviewArtifactId"]);
  state.ui.activeDocumentOverlayAssetId = null;
  state.ui.analysisControlsCollapsed = state.workbench["controlsCollapsed"] === true;
  state.ui.liveFindingsExpanded =
    asNonEmptyString(state.workbench["activeLiveFindingsStreamId"]) !== null;
  state.profileModels = Array.isArray(snapshot["profileModels"])
    ? (snapshot["profileModels"] as unknown[]).map(asLabRecord)
    : [];
  state.toolState = asLabRecord(snapshot["toolState"]);

  const activeProject = asLabRecord(snapshot["activeProject"]);
  if (Object.keys(activeProject).length === 0) {
    state.source = null;
    state.editConfig = null;
    state.profileConfig = null;
    state.preflight = null;
    state.run = null;
    state.reports = createEmptyReports();
    state.reportExports = [];
    state.assets = [];
    state.sourceProbeStatus = state.sourceProbeStatus === "running" ? "running" : "idle";
    state.ui.lastHydratedProjectId = null;
    resetWorkspaceForSourceActivation(state, { sourceIntakeCollapsed: false });
    return state;
  }

  state.source = asLabRecord(activeProject["source"]);
  state.editConfig = asLabRecord(activeProject["edit"]);
  state.profileConfig = asLabRecord(activeProject["profile"]);
  state.preflight =
    Object.keys(asLabRecord(asLabRecord(state.profileConfig)["preflight"])).length > 0
      ? normalizeLabPreflight(state.profileConfig)
      : createIdlePreflight();
  state.sourceProbeStatus = deriveProbeStatus(state.source, state.sourceProbeStatus);

  const processRecord = asLabRecord(asLabRecord(activeProject["process"])["records"])[
    state.featureId
  ];
  const nextRun = toRunFromProcessRecord(asLabRecord(processRecord));
  if (shouldKeepPendingRunDuringSnapshot(state, nextRun)) {
    // Keep the pending local run alive until the host creates the process record
  } else {
    state.run = nextRun;
  }
  if (state.run === null || (state.run.state !== "running" && state.run.state !== "queued")) {
    state.ui.analysisCancelPending = false;
    state.ui.analysisCancelRequestId = null;
  }

  const reportRecord = asLabRecord(
    asLabRecord(asLabRecord(activeProject["report"])["records"])[state.featureId]
  );
  state.reports = toReportsFromRecord(reportRecord);
  state.reportExports = Array.isArray(reportRecord["exports"])
    ? (reportRecord["exports"] as unknown[]).map(asLabRecord)
    : [];
  state.assets = normalizeStoreAssets(activeProject["assets"]);

  const nextActiveProjectId = state.projectIndex.activeProjectId;
  const nextSourceReady = isWorkspaceSourceReady(state.source);
  const nextSourceSelectionKey = getWorkspaceSourceSelectionResetKey(state.source);
  if (
    previousActiveProjectId !== nextActiveProjectId ||
    previousSourceSelectionKey !== nextSourceSelectionKey
  ) {
    resetWorkspaceForSourceActivation(state, {
      sourceIntakeCollapsed:
        previousActiveProjectId !== nextActiveProjectId ? nextSourceReady : undefined,
    });
  }
  if (previousActiveProjectId !== nextActiveProjectId) {
    resetProjectImportState(state, { markSourceDraftDirty: false });
    state.ui.workspace = {
      ...state.ui.workspace,
      sourceIntakeCollapsed: nextSourceReady,
      drawerModeOverride: null,
    };
  } else if (previousSourceReady !== nextSourceReady) {
    state.ui.workspace = {
      ...state.ui.workspace,
      sourceIntakeCollapsed: nextSourceReady,
      drawerModeOverride: null,
    };
  }

  syncDraftsFromSnapshot(state, snapshot);
  return state;
}

function getProjectImportActiveDraft(state: LabStoreState) {
  return state.ui.projectImport.drafts[state.ui.projectImport.activeKind];
}

export function syncSourceDraftsFromProjectImport(state: LabStoreState) {
  state.ui.sourceDrafts = cloneSourceDrafts(getProjectImportActiveDraft(state));
}

function isPristineSourceDraft(draft: LabSourceDrafts) {
  return (
    draft.urlInput === "" &&
    draft.youtubeUrl === "" &&
    draft.youtubePreset === null &&
    Object.keys(asLabRecord(draft.youtubeCustom)).length === 0 &&
    draft.youtubeCaptureMode === "video+audio"
  );
}

export function syncProjectImportDraftFromSourceDrafts(
  state: LabStoreState,
  sourceKind: unknown,
  options: { force?: boolean } = {}
) {
  const kind = normalizeProjectImportKind(sourceKind, state.ui.projectImport.activeKind);
  if (options.force !== true && !isPristineSourceDraft(state.ui.projectImport.drafts[kind])) {
    return;
  }
  state.ui.projectImport = {
    ...state.ui.projectImport,
    drafts: {
      ...state.ui.projectImport.drafts,
      [kind]: cloneSourceDrafts(state.ui.sourceDrafts),
    },
  };
}

export function updateTrackedProjectImportProbe(
  state: LabStoreState,
  action: string,
  focus: LabProjectImportReviewFocus
) {
  if (
    state.ui.projectImport.lastRequestId === null ||
    state.ui.projectImport.lastAction !== action
  ) {
    return;
  }
  state.ui.projectImport = {
    ...state.ui.projectImport,
    reviewFocus: focus,
    lastAction: action,
  };
}
