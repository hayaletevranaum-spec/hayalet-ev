import { asLabRecord, asNonEmptyString, CAPABILITY_FAMILIES } from "../domain/lab-types.js";
import type {
  CapabilityFamilyId,
  LabAsset,
  LabComparisonSide,
  LabFeatureId,
  LabFocusLayer,
  LabComparisonViewMode,
  LabSelectionROI,
  LabStoreState,
  LabStoreEvent,
} from "../domain/lab-types.js";
import {
  getAnalysisActionBlockReason,
  getCurrentRun,
  getEditActionBlockReason,
  getReadySelectedAnalysisCapabilityIds,
  getSourceReady,
  getToolLifecycleStage,
  getWorkbench,
  hasReportPayload,
  isAnyHeavyWorkActive,
  isRunActive,
  isRunComplete,
} from "./lab-selectors.js";
import type { createLabEventBus } from "./lab-event-bus.js";
import type { createLabStore } from "./lab-store.js";
import {
  buildUiEvent,
  deriveFeatureSelectionFromCapabilities,
  isTextControl,
  toStringValue,
} from "./controller/lab-controller-helpers.js";
import { applyAnalysisScopeField } from "./controller/lab-analysis-scope-controller.js";
import {
  closeLabAssetMenusForClick,
  openLabAssetContextMenu,
} from "./controller/lab-asset-context-menu-controller.js";
import { createLabAssetActionController } from "./controller/lab-asset-action-controller.js";
import { createLabFormActionController } from "./controller/lab-form-action-controller.js";
import { createLabMediaActionController } from "./controller/lab-media-action-controller.js";
import { getLabPrimaryActionState } from "./controller/lab-primary-action-state.js";
import { createLabTimelinePlaybackController } from "./controller/lab-timeline-playback-controller.js";
import { createLabWorkspaceSettingsController } from "./controller/lab-workspace-settings-controller.js";
import { createLabSourceActionController } from "./controller/lab-source-action-controller.js";
import { createLabWorkspaceOperationController } from "./controller/lab-workspace-operation-controller.js";
import {
  isTimelineAction,
  normalizeWorkspaceControlTab,
} from "./controller/lab-timeline-controller-helpers.js";
import { DEFAULT_AUDIO_FOCUS_SETTINGS } from "./lab-audio-focus-normalization.js";
import { isFullSourceWorkspaceSelection } from "./lab-workspace-selection.js";
import { inferLabAssetSourceKind } from "../shared/lab-asset-kind.js";

type LabRoomApi = {
  close?: () => boolean;
  onHostMessage?: (listener: (message: unknown) => void) => void;
  ready?: (payload: { feature: string; room: string; stage: string }) => void;
  sendEvent?: (eventName: string, payload: Record<string, unknown>) => void;
};

type ControllerWindow = Window & {
  roomAPI?: LabRoomApi;
};

type ReportOverlayExportFormat = "json" | "pdf";

type LabAnalysisScopeOverlayModel = {
  endMs: number | null;
  hasRoi: boolean;
  hasTimeRange: boolean;
  startMs: number | null;
};

type LabAnalysisScopeOverlayPort = {
  hide: () => void;
  isOpen: () => boolean;
  show: (model: LabAnalysisScopeOverlayModel) => boolean;
};

type LabWorkspaceAudioVisualizerPort = {
  sync: () => void;
};

type LabRunControllerDeps = {
  analysisScopeOverlay?: LabAnalysisScopeOverlayPort;
  documentRef: Document;
  eventBus: ReturnType<typeof createLabEventBus>;
  store: ReturnType<typeof createLabStore>;
  windowRef: ControllerWindow;
  workspaceAudioVisualizer?: LabWorkspaceAudioVisualizerPort;
};

const NOOP_ANALYSIS_SCOPE_OVERLAY: LabAnalysisScopeOverlayPort = {
  hide() {},
  isOpen() {
    return false;
  },
  show() {
    return false;
  },
};

const NOOP_WORKSPACE_AUDIO_VISUALIZER: LabWorkspaceAudioVisualizerPort = {
  sync() {},
};

export function createLabRunController(deps: LabRunControllerDeps) {
  type AnalysisScopeChoice = "selected" | "full" | "cancel";
  type AnalysisScopeRequest = AnalysisScopeChoice | "pending";
  type LabControllerState = ReturnType<typeof deps.store.getState>;

  let attached = false;
  const analysisScopeOverlay = deps.analysisScopeOverlay ?? NOOP_ANALYSIS_SCOPE_OVERLAY;
  const workspaceAudioVisualizer = deps.workspaceAudioVisualizer ?? NOOP_WORKSPACE_AUDIO_VISUALIZER;

  function dispatch(event: Parameters<ReturnType<typeof createLabStore>["dispatch"]>[0]) {
    deps.eventBus.emit(event);
  }

  function readSelectionRoi(value: unknown): LabSelectionROI | null {
    const roi = asLabRecord(value);
    const x = typeof roi["x"] === "number" && Number.isFinite(roi["x"]) ? roi["x"] : null;
    const y = typeof roi["y"] === "number" && Number.isFinite(roi["y"]) ? roi["y"] : null;
    const width =
      typeof roi["width"] === "number" && Number.isFinite(roi["width"]) ? roi["width"] : null;
    const height =
      typeof roi["height"] === "number" && Number.isFinite(roi["height"]) ? roi["height"] : null;
    if (x === null || y === null || width === null || height === null) {
      return null;
    }
    return { height, width, x, y };
  }

  function normalizeComparisonViewMode(value: unknown): LabComparisonViewMode | null {
    switch (asNonEmptyString(value)) {
      case "side-by-side":
      case "stacked":
      case "split":
      case "difference":
      case "roi-detail":
        return asNonEmptyString(value) as LabComparisonViewMode;
      default:
        return null;
    }
  }

  function getComparisonFindingMetadata(state: LabControllerState, findingKey: string) {
    const key = findingKey.trim();
    if (key === "") {
      return null;
    }
    const manifestAsset =
      state.assets.find(function (asset) {
        const metadata = asLabRecord(asset.metadata);
        return (
          asNonEmptyString(metadata["artifactKind"]) === "comparison-finding-manifest" &&
          (asset.id === key || asNonEmptyString(metadata["findingId"]) === key)
        );
      }) || null;
    if (manifestAsset === null) {
      return null;
    }
    return asLabRecord(manifestAsset.metadata);
  }

  function focusComparisonFinding(findingKey: string, state: LabControllerState) {
    const metadata = getComparisonFindingMetadata(state, findingKey);
    if (metadata === null) {
      dispatch({
        type: "push-event",
        event: buildUiEvent("Karşılaştırma bulgusu bulunamadı.", "warning"),
      });
      return;
    }
    const captureContext = asLabRecord(metadata["captureContext"]);
    const comparisonRois =
      Object.keys(asLabRecord(metadata["comparisonRois"])).length > 0
        ? asLabRecord(metadata["comparisonRois"])
        : asLabRecord(captureContext["comparisonRois"]);
    const primaryAssetId =
      asNonEmptyString(metadata["primaryAssetId"]) ||
      asNonEmptyString(captureContext["primaryAssetId"]) ||
      asNonEmptyString(metadata["snapshotAssetId"]);
    const referenceAssetId =
      asNonEmptyString(metadata["referenceAssetId"]) ||
      asNonEmptyString(captureContext["referenceAssetId"]);
    const viewMode = normalizeComparisonViewMode(
      metadata["comparisonViewMode"] || captureContext["comparisonViewMode"]
    );
    const splitPercent =
      typeof captureContext["splitPercent"] === "number" &&
      Number.isFinite(captureContext["splitPercent"])
        ? Math.max(5, Math.min(95, Math.round(captureContext["splitPercent"])))
        : null;
    const primaryRoi =
      readSelectionRoi(comparisonRois["primary"]) ||
      readSelectionRoi(captureContext["primaryNormalizedRoi"]);
    const referenceRoi =
      readSelectionRoi(comparisonRois["reference"]) ||
      readSelectionRoi(captureContext["referenceNormalizedRoi"]);
    const activeSide =
      asNonEmptyString(comparisonRois["activeSide"]) === "primary" ? "primary" : "reference";

    if (primaryAssetId !== null) {
      dispatch({ type: "workspace-asset-selected", assetId: primaryAssetId });
    }
    dispatch({ type: "workspace-comparison-reference-set", assetId: referenceAssetId });
    if (viewMode !== null || splitPercent !== null) {
      dispatch({
        type: "workspace-comparison-updated",
        patch: {
          ...(viewMode === null ? {} : { comparisonViewMode: viewMode }),
          ...(splitPercent === null ? {} : { comparisonSplitPercent: splitPercent }),
        },
      });
    }
    const roiUpdates =
      activeSide === "primary"
        ? [
            { comparisonSide: "reference" as const, roi: referenceRoi },
            { comparisonSide: "primary" as const, roi: primaryRoi },
          ]
        : [
            { comparisonSide: "primary" as const, roi: primaryRoi },
            { comparisonSide: "reference" as const, roi: referenceRoi },
          ];
    roiUpdates.forEach(function (entry) {
      if (entry.roi !== null) {
        dispatch({
          type: "selection-roi-updated",
          comparisonSide: entry.comparisonSide,
          roi: entry.roi,
        });
      }
    });
    if (state.ui.workspace.activeIconRailSlot !== "image-comparison") {
      dispatch({ type: "icon-rail-slot-selected", slotId: "image-comparison" });
    }
  }

  const mediaActions = createLabMediaActionController({
    dispatch,
    store: deps.store,
    windowRef: deps.windowRef,
  });
  const {
    cancelTrackedOperation,
    createActionRequestId,
    getRoomApi,
    handleBusEvent: handleMediaActionBusEvent,
    sendMediaAction,
    startTrackedReportExport,
  } = mediaActions;

  function setLabFocusLayer(layer: LabFocusLayer) {
    if (deps.store.getState().ui.labFocusLayer === layer) {
      return;
    }
    dispatch({ type: "lab-focus-layer-changed", layer });
  }

  const timelinePlayback = createLabTimelinePlaybackController({
    dispatch,
    documentRef: deps.documentRef,
    setLabFocusLayer,
    store: deps.store,
  });
  const {
    addCurrentTimelineBookmark,
    centerTimelineTarget,
    getTimelineSyncMedia,
    handleMouseDown,
    handleTimelineMouseMove,
    handleTimelineMouseUp,
    isWorkspaceMutationLocked,
    playSelectedTimelineRange,
    pushLockedWorkspaceEvent,
    seekTimelineToMs,
    setTimelineSelectionBoundary,
    shiftTimelinePlayhead,
    syncTimelinePlaybackUiFromState,
    syncTimelineTransportVolume,
    toggleTimelinePlayback,
    updateTimelinePlaybackUi,
  } = timelinePlayback;

  const sourceActions = createLabSourceActionController({
    dispatch,
    pushLockedWorkspaceEvent,
    sendMediaAction,
    store: deps.store,
    updateWorkbench,
    windowRef: deps.windowRef,
  });
  const {
    deleteActiveProject,
    handleSourceClickAction,
    persistSourceDraftField,
    runSourcePrimaryAction,
    saveActiveProjectCheckpoint,
    selectProjectByValue,
    startCleanProjectSession,
  } = sourceActions;

  const assetActions = createLabAssetActionController({
    dispatch,
    documentRef: deps.documentRef,
    sendMediaAction,
    store: deps.store,
    windowRef: deps.windowRef,
  });
  const { downloadAsset, focusSourcePreview, removeAssetsWithConfirmation } = assetActions;

  const workspaceOperations = createLabWorkspaceOperationController({
    dispatch,
    getActiveSelectionOperationPayload: mediaActions.getActiveSelectionOperationPayload,
    getCurrentRunContextPayload: mediaActions.getCurrentRunContextPayload,
    isWorkspaceMutationLocked,
    pushLockedWorkspaceEvent,
    startTrackedOperationForUiAction: mediaActions.startTrackedOperationForUiAction,
    store: deps.store,
  });
  const {
    exportAudioCleanup,
    exportBandPassVoice,
    exportBeforeAfterVariant,
    captureComparisonMoment,
    exportEnhancedFrame,
    exportImageComparison,
    saveComparisonFinding,
    exportSelectionRoi,
    exportStabilizedSegment,
    exportStemSeparation,
    exportTimelineClip,
    exportWorkspaceRoi,
    extractTimelineAudio,
    grabTimelineFrame,
  } = workspaceOperations;

  function isInsideWorkspacePreview(target: Element) {
    return (
      typeof target.closest === "function" && target.closest(".labx-workspace-preview") !== null
    );
  }

  function isInsideWorkspaceInspector(target: Element) {
    return (
      typeof target.closest === "function" &&
      target.closest("[data-lab-workspace-inspector='true']") !== null
    );
  }

  const analysisLockedWorkspaceActions = new Set([
    "workspace-toggle-source-intake",
    "workspace-controls-drawer-toggle",
    "workspace-controls-tab-select",
    "workspace-roi-toggle",
    "workspace-roi-remove",
    "workspace-comparison-moment-capture",
    "workspace-comparison-finding-save",
    "workspace-comparison-finding-focus",
    "timeline-toggle-micro-zoom",
    "timeline-toggle-selection-loop",
    "timeline-play-selection",
    "timeline-toggle-playback",
    "timeline-shift-playhead",
    "workspace-asset-select",
    "workspace-content-open",
    "workspace-comparison-reference-set",
    "focus-source-preview",
    "asset-download",
    "asset-remove",
    "workspace-setting-adjust",
    "operation-settings-reset",
    "workspace-image-analysis",
    "workspace-reset-controls",
    "workspace-reset-audio-focus",
    "timeline-add-bookmark",
    "timeline-remove-bookmark",
    "timeline-seek",
    "timeline-set-selection-boundary",
    "timeline-finetune",
    "timeline-clear",
    "inspector-pin-toggle",
    "icon-rail-slot-select",
  ]);

  function guardActiveAnalysisWorkspaceAction(action: string) {
    if (
      !analysisLockedWorkspaceActions.has(action) ||
      isRunActive(deps.store.getState()) !== true
    ) {
      return false;
    }
    pushLockedWorkspaceEvent("Çalışma alanı aktif analiz sırasında kilitli.");
    return true;
  }

  function getToolEntryRecord(state: LabStoreState, toolId: string) {
    const tools = asLabRecord(asLabRecord(state.toolState)["tools"]);
    return asLabRecord(tools[toolId]);
  }

  function getRoomManagedToolIds(state: LabStoreState): string[] {
    const snapshot = asLabRecord(state.snapshot);
    const registry = Array.isArray(snapshot["toolRegistry"])
      ? (snapshot["toolRegistry"] as unknown[])
      : [];
    const toolIds =
      registry.length > 0
        ? registry.map(function (entry) {
            return asNonEmptyString(asLabRecord(entry)["toolId"]);
          })
        : Object.keys(asLabRecord(asLabRecord(state.toolState)["tools"]));

    return Array.from(
      new Set(
        toolIds.filter(function (toolId): toolId is string {
          return toolId !== null && toolId !== "transcript-runtime";
        })
      )
    );
  }

  function getInstalledRoomManagedToolIds(state: LabStoreState): string[] {
    return getRoomManagedToolIds(state).filter(function (toolId) {
      return getToolEntryRecord(state, toolId)["installed"] === true;
    });
  }

  function getUpdateAvailableRoomManagedToolIds(state: LabStoreState): Set<string> {
    return new Set(
      getRoomManagedToolIds(state).filter(function (toolId) {
        return getToolEntryRecord(state, toolId)["updateAvailable"] === true;
      })
    );
  }

  function getSelectedToolUpdateIds(state: LabStoreState): string[] {
    const availableIds = getUpdateAvailableRoomManagedToolIds(state);
    const selectedIds = Array.from(
      deps.documentRef.querySelectorAll<HTMLInputElement>("[data-lab-update-choice]:checked")
    )
      .map(function (input) {
        return input.value.trim();
      })
      .filter(function (toolId) {
        return toolId !== "" && availableIds.has(toolId);
      });

    return Array.from(new Set(selectedIds));
  }

  function sendHostContext(payload: Record<string, unknown>) {
    const roomApi = getRoomApi();
    if (!roomApi || typeof roomApi.sendEvent !== "function") {
      return;
    }
    roomApi.sendEvent("host-context", payload);
  }

  function syncCurrentWorkbenchToHost() {
    const state = deps.store.getState();
    sendHostContext({
      ...state.context,
      workbench: getWorkbench(state),
    });
  }

  function updateWorkbench(
    update: (currentWorkbench: Record<string, unknown>) => Record<string, unknown>
  ) {
    const state = deps.store.getState();
    const currentWorkbench = {
      ...getWorkbench(state),
    };
    const nextWorkbench = update(currentWorkbench);
    dispatch({
      type: "workbench-updated",
      workbench: nextWorkbench,
    });
    sendHostContext({
      ...state.context,
      workbench: nextWorkbench,
    });
  }

  const workspaceSettings = createLabWorkspaceSettingsController({
    dispatch,
    pushLockedWorkspaceEvent,
    store: deps.store,
    updateWorkbench,
  });
  const {
    applyWorkspaceSettingAdjustment,
    patchAnalysisModuleSetting,
    patchAudioFocusSetting,
    patchInteractiveSetting,
    patchOperationSetting,
    readControlValue,
    resetInteractiveSettings,
    resetAnalysisModuleSettings,
    resetOperationSettings,
  } = workspaceSettings;

  function updateAnalysisScopeField(field: string, value: unknown) {
    updateWorkbench(function (workbench) {
      return applyAnalysisScopeField(workbench, field, value);
    });
  }

  const formActions = createLabFormActionController({
    dispatch,
    isInsideWorkspaceInspector,
    isWorkspaceMutationLocked,
    patchAnalysisModuleSetting,
    patchAudioFocusSetting,
    patchInteractiveSetting,
    patchOperationSetting,
    persistSourceDraftField,
    pushLockedWorkspaceEvent,
    readControlValue,
    seekTimelineToMs,
    selectProjectByValue,
    sendMediaAction,
    setLabFocusLayer,
    store: deps.store,
    syncTimelineTransportVolume,
    updateAnalysisScopeField,
    updateTimelinePlaybackUi,
  });
  const { handleChange, handleInput } = formActions;

  function activateFeature(featureId: string) {
    dispatch({
      type: "feature-changed",
      featureId: featureId as LabFeatureId,
    });
    updateWorkbench(function (workbench) {
      const selectedModuleIds = Array.isArray(workbench["selectedModuleIds"])
        ? (workbench["selectedModuleIds"] as unknown[]).filter(
            (entry): entry is string => typeof entry === "string"
          )
        : [];
      return {
        ...workbench,
        activeModuleId: featureId,
        selectedModuleIds: selectedModuleIds.includes(featureId)
          ? selectedModuleIds
          : [featureId].concat(selectedModuleIds),
      };
    });
  }

  function toggleFeature(featureId: string) {
    updateWorkbench(function (workbench) {
      const selectedModuleIds = Array.isArray(workbench["selectedModuleIds"])
        ? (workbench["selectedModuleIds"] as unknown[]).filter(
            (entry): entry is string => typeof entry === "string"
          )
        : [];
      const activeModuleId = asNonEmptyString(workbench["activeModuleId"]) || featureId;
      const nextSelected = selectedModuleIds.includes(featureId)
        ? selectedModuleIds.filter(function (entry) {
            return entry !== featureId;
          })
        : selectedModuleIds.concat(featureId);
      const safeSelected = nextSelected.length > 0 ? nextSelected : [featureId];
      return {
        ...workbench,
        activeModuleId: safeSelected.includes(activeModuleId) ? activeModuleId : safeSelected[0],
        selectedModuleIds: safeSelected,
      };
    });
  }

  function syncCapabilities(nextCapabilities: string[]) {
    const normalizedCapabilities = Array.from(
      new Set(
        nextCapabilities.filter(function (entry) {
          return entry.trim() !== "";
        })
      )
    );
    const { activeFeatureId, featureIds } =
      deriveFeatureSelectionFromCapabilities(normalizedCapabilities);
    dispatch({
      type: "capability-set",
      capabilities: normalizedCapabilities as import("../domain/lab-types.js").CapabilityFamilyId[],
    });
    dispatch({
      type: "feature-changed",
      featureId: activeFeatureId,
    });
    updateWorkbench(function (workbench) {
      return {
        ...workbench,
        activeModuleId: activeFeatureId,
        selectedModuleIds: featureIds,
        selectedCapabilityIds: normalizedCapabilities,
      };
    });
  }

  function parseAnalysisPreparationModuleValue(value: string) {
    const [capabilityId, moduleId] = value.split("::");
    const knownCapabilityId = CAPABILITY_FAMILIES.some(function (capability) {
      return capability.id === capabilityId;
    });
    if (!knownCapabilityId || typeof moduleId !== "string" || moduleId.trim() === "") {
      return null;
    }
    return {
      capabilityId: capabilityId as CapabilityFamilyId,
      moduleId,
    };
  }

  function readFiniteNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function getSourceDimensions(state: LabControllerState) {
    const metadata = asLabRecord(asLabRecord(state.source)["metadata"]);
    const width = readFiniteNumber(metadata["width"]);
    const height = readFiniteNumber(metadata["height"]);
    return width !== null && height !== null && width > 0 && height > 0 ? { width, height } : null;
  }

  function resolveAnalysisRoiRegion(state: LabControllerState, roi: LabSelectionROI | null) {
    const dimensions = roi === null ? null : getSourceDimensions(state);
    if (roi === null || dimensions === null) {
      return null;
    }
    const x = Math.max(0, Math.min(1, roi.x));
    const y = Math.max(0, Math.min(1, roi.y));
    const width = Math.max(1, Math.round(Math.max(0, Math.min(1, roi.width)) * dimensions.width));
    const height = Math.max(
      1,
      Math.round(Math.max(0, Math.min(1, roi.height)) * dimensions.height)
    );
    return {
      x: Math.min(Math.max(0, dimensions.width - width), Math.round(x * dimensions.width)),
      y: Math.min(Math.max(0, dimensions.height - height), Math.round(y * dimensions.height)),
      width,
      height,
    };
  }

  function getWorkspaceAnalysisSelection(state: LabControllerState) {
    const sourceKind = asNonEmptyString(asLabRecord(state.source)["kind"]);
    const ws = state.ui.workspace;
    const selection = ws.activeSelection;
    const startMs = ws.timelineStartMs ?? selection?.startMs ?? null;
    const endMs = ws.timelineEndMs ?? selection?.endMs ?? null;
    const hasExplicitTimelineRange =
      ws.timelineStartMs !== null &&
      ws.timelineEndMs !== null &&
      ws.timelineEndMs > ws.timelineStartMs;
    const hasSelectionTimeRange =
      !isFullSourceWorkspaceSelection(selection) &&
      startMs !== null &&
      endMs !== null &&
      endMs > startMs;
    const hasTimeRange =
      sourceKind !== "image" && (hasExplicitTimelineRange || hasSelectionTimeRange);
    const roi = selection?.roi ?? null;
    return {
      endMs,
      hasRoi: roi !== null,
      hasTimeRange,
      region: resolveAnalysisRoiRegion(state, roi),
      roi,
      startMs,
    };
  }

  function parseAnalysisScopeChoice(value: string | null): AnalysisScopeChoice {
    if (value === null) {
      return "cancel";
    }
    const normalized = value.trim().toLocaleLowerCase("tr-TR");
    if (
      normalized === "1" ||
      normalized === "s" ||
      normalized === "seçili" ||
      normalized === "secili" ||
      normalized === "selected"
    ) {
      return "selected";
    }
    if (
      normalized === "2" ||
      normalized === "t" ||
      normalized === "tamamı" ||
      normalized === "tamami" ||
      normalized === "full" ||
      normalized === "all"
    ) {
      return "full";
    }
    if (
      normalized === "3" ||
      normalized === "i" ||
      normalized === "iptal" ||
      normalized === "cancel"
    ) {
      return "cancel";
    }
    return "cancel";
  }

  function removeAnalysisScopeOverlay() {
    analysisScopeOverlay.hide();
  }

  function showAnalysisScopeOverlay(state: LabControllerState) {
    const selection = getWorkspaceAnalysisSelection(state);
    return analysisScopeOverlay.show({
      endMs: selection.endMs,
      hasRoi: selection.hasRoi,
      hasTimeRange: selection.hasTimeRange,
      startMs: selection.startMs,
    });
  }

  function cancelAnalysisScopeOverlay() {
    removeAnalysisScopeOverlay();
    dispatch({
      type: "push-event",
      event: buildUiEvent("Analiz başlatılmadı.", "warning"),
    });
  }

  function startAnalysisFromScopeOverlay(choice: AnalysisScopeChoice) {
    removeAnalysisScopeOverlay();
    if (choice === "cancel") {
      cancelAnalysisScopeOverlay();
      return;
    }
    const state = deps.store.getState();
    const blockReason = getAnalysisActionBlockReason(state);
    if (blockReason !== null) {
      dispatch({
        type: "push-event",
        event: buildUiEvent(blockReason, "warning"),
      });
      return;
    }
    startDeepAnalysis(state, choice);
  }

  function requestAnalysisScopeChoice(state: LabControllerState): AnalysisScopeRequest {
    const selection = getWorkspaceAnalysisSelection(state);
    if (!selection.hasTimeRange && !selection.hasRoi) {
      return "selected";
    }
    if (showAnalysisScopeOverlay(state)) {
      return "pending";
    }
    return "selected";
  }

  function getPathLeaf(path: string | null) {
    if (path === null) {
      return null;
    }
    return path.split(/[\\/]/).pop() || path;
  }

  function getAnalysisComparisonAsset(state: LabControllerState, assetId: string | null) {
    return assetId === null
      ? null
      : state.assets.find(function (asset) {
          return asset.id === assetId;
        }) || null;
  }

  function buildAssetComparisonTarget(asset: LabAsset, side: LabComparisonSide) {
    const localPath = asNonEmptyString(asset.localPath);
    const url = asNonEmptyString(asset.url);
    const sourceKind = inferLabAssetSourceKind(asset);
    const fileName = getPathLeaf(localPath) || getPathLeaf(url) || asset.name;
    return {
      side,
      assetId: asset.id,
      name: asset.name,
      label: asset.name,
      ...(fileName ? { fileName } : {}),
      ...(localPath === null ? {} : { localPath, path: localPath }),
      ...(url === null ? {} : { url }),
      ...(asNonEmptyString(asset.sourceId) === null ? {} : { sourceId: asset.sourceId }),
      ...(sourceKind === null ? {} : { sourceKind }),
      type: asset.type,
      ...(asset.metadata && Object.keys(asset.metadata).length > 0
        ? { metadata: asset.metadata }
        : {}),
    };
  }

  function buildSourceComparisonTarget(state: LabControllerState, side: LabComparisonSide) {
    const sourceRecord = asLabRecord(state.source);
    const localPath = asNonEmptyString(sourceRecord["storedPath"]);
    const url =
      asNonEmptyString(sourceRecord["previewUrl"]) || asNonEmptyString(sourceRecord["url"]);
    const fileName =
      asNonEmptyString(sourceRecord["storedFileName"]) ||
      getPathLeaf(localPath) ||
      getPathLeaf(url) ||
      asNonEmptyString(sourceRecord["name"]);
    const sourceKind = asNonEmptyString(sourceRecord["kind"]);
    return {
      side,
      ...(asNonEmptyString(sourceRecord["id"]) === null
        ? {}
        : { sourceId: asNonEmptyString(sourceRecord["id"]) }),
      ...(fileName === null ? {} : { fileName, name: fileName, label: fileName }),
      ...(localPath === null ? {} : { localPath, path: localPath }),
      ...(url === null ? {} : { url }),
      ...(sourceKind === "video" || sourceKind === "audio" || sourceKind === "image"
        ? { sourceKind }
        : {}),
      type: "source",
      ...(Object.keys(asLabRecord(sourceRecord["metadata"])).length > 0
        ? { metadata: asLabRecord(sourceRecord["metadata"]) }
        : {}),
    };
  }

  function getComparisonTargetSourceKind(target: Record<string, unknown>) {
    const sourceKind = asNonEmptyString(target["sourceKind"]);
    return sourceKind === "video" || sourceKind === "audio" || sourceKind === "image"
      ? sourceKind
      : null;
  }

  function getComparisonTargetDimensions(target: Record<string, unknown>) {
    const metadata = asLabRecord(target["metadata"]);
    const width = readFiniteNumber(metadata["width"]);
    const height = readFiniteNumber(metadata["height"]);
    return width !== null && height !== null && width > 0 && height > 0 ? { width, height } : null;
  }

  function resolveComparisonRoiRegion(
    roi: LabSelectionROI | null,
    target: Record<string, unknown>
  ) {
    const dimensions = roi === null ? null : getComparisonTargetDimensions(target);
    if (roi === null || dimensions === null) {
      return null;
    }
    const x = Math.max(0, Math.min(1, roi.x));
    const y = Math.max(0, Math.min(1, roi.y));
    const width = Math.max(1, Math.round(Math.max(0, Math.min(1, roi.width)) * dimensions.width));
    const height = Math.max(
      1,
      Math.round(Math.max(0, Math.min(1, roi.height)) * dimensions.height)
    );
    return {
      x: Math.min(Math.max(0, dimensions.width - width), Math.round(x * dimensions.width)),
      y: Math.min(Math.max(0, dimensions.height - height), Math.round(y * dimensions.height)),
      width,
      height,
    };
  }

  function getAnalysisComparisonScopeFromWorkspace(state: LabControllerState) {
    const referenceAssetId = asNonEmptyString(state.ui.workspace.comparisonReferenceAssetId);
    const referenceAsset = getAnalysisComparisonAsset(state, referenceAssetId);
    if (referenceAsset === null) {
      return null;
    }
    const primaryAssetId = asNonEmptyString(state.ui.activeWorkspaceAssetId);
    const primaryAsset = getAnalysisComparisonAsset(state, primaryAssetId);
    const primary =
      primaryAsset === null
        ? buildSourceComparisonTarget(state, "primary")
        : buildAssetComparisonTarget(primaryAsset, "primary");
    const reference = buildAssetComparisonTarget(referenceAsset, "reference");
    if (
      getComparisonTargetSourceKind(primary) !== "image" ||
      getComparisonTargetSourceKind(reference) !== "image"
    ) {
      return null;
    }
    const comparisonRois = state.ui.workspace.comparisonRois;
    const primaryRoiRegion = resolveComparisonRoiRegion(comparisonRois.primary, primary);
    const referenceRoiRegion = resolveComparisonRoiRegion(comparisonRois.reference, reference);
    return {
      activeSide: comparisonRois.activeSide,
      primary,
      reference,
      rois: {
        activeSide: comparisonRois.activeSide,
        primary: primaryRoiRegion,
        reference: referenceRoiRegion,
      },
      splitPercent: state.ui.workspace.comparisonSplitPercent,
      viewMode: state.ui.workspace.comparisonViewMode,
    };
  }

  function updateAnalysisScopeFromWorkspace(
    state: LabControllerState,
    choice: AnalysisScopeChoice
  ) {
    const selection = getWorkspaceAnalysisSelection(state);
    const ws = state.ui.workspace;
    updateWorkbench(function (workbench) {
      const nextScope: Record<string, unknown> = {};
      const hypothesis = ws.hypothesis.trim();
      if (hypothesis !== "") {
        nextScope["hypothesis"] = hypothesis;
      } else {
        delete nextScope["hypothesis"];
      }

      delete nextScope["frameRange"];
      if (choice === "selected" && selection.hasTimeRange) {
        nextScope["timeRange"] = {
          endMs: Math.round(selection.endMs || 0),
          startMs: Math.round(selection.startMs || 0),
        };
      } else {
        delete nextScope["timeRange"];
      }

      if (choice === "selected" && selection.region !== null) {
        nextScope["region"] = selection.region;
      } else {
        delete nextScope["region"];
      }

      const comparisonScope = getAnalysisComparisonScopeFromWorkspace(state);
      if (comparisonScope !== null) {
        nextScope["comparison"] = comparisonScope;
      } else {
        delete nextScope["comparison"];
      }

      const hasScopeContent = [
        "focus",
        "hypothesis",
        "timeRange",
        "frameRange",
        "region",
        "comparison",
        "lifecycle",
      ].some(function (key) {
        return nextScope[key] !== undefined;
      });

      return {
        ...workbench,
        analysisScope: hasScopeContent ? nextScope : null,
      };
    });
  }

  function getProcessRunWorkspacePayload(state: LabControllerState) {
    const workbench = getWorkbench(state);
    const workspaceTargetAssetId = asNonEmptyString(state.ui.activeWorkspaceAssetId);
    const comparisonReferenceAssetId = asNonEmptyString(
      state.ui.workspace.comparisonReferenceAssetId
    );
    return {
      ...(workbench["analysisScope"] === undefined
        ? {}
        : { analysisScope: workbench["analysisScope"] }),
      ...(workspaceTargetAssetId === null ? {} : { workspaceTargetAssetId }),
      ...(comparisonReferenceAssetId === null ? {} : { comparisonReferenceAssetId }),
    };
  }

  function startDeepAnalysis(state: LabControllerState, scopeChoice: AnalysisScopeChoice) {
    const selectedCapabilities = getReadySelectedAnalysisCapabilityIds(state);
    const { activeFeatureId } = deriveFeatureSelectionFromCapabilities(selectedCapabilities);

    syncCapabilities(selectedCapabilities);
    updateAnalysisScopeFromWorkspace(state, scopeChoice);

    const sourceRecord = asLabRecord(state.source);
    if (asNonEmptyString(sourceRecord["previewUrl"]) === null) {
      sendMediaAction("edit-preview");
    }
    const runPayload = getProcessRunWorkspacePayload(deps.store.getState());
    if (state.ui.workspace.preflightAutoRunEnabled !== false) {
      sendMediaAction("profile-run-preflight", runPayload);
    }
    const runAction = activeFeatureId === "audio-analysis" ? "audio-process-run" : "process-run";
    const runRequestId = createActionRequestId(runAction);
    dispatch({
      type: "run-started",
      action: runAction,
      projectId: deps.store.getState().projectIndex.activeProjectId,
      requestId: runRequestId,
    });
    const sentRunRequestId = sendMediaAction(runAction, runPayload, { requestId: runRequestId });
    if (sentRunRequestId === null) {
      dispatch({
        type: "run-failed",
        action: runAction,
        detail: "Room API bridge is not connected.",
      });
    }
  }

  function requestAnalysisCancel(state: LabControllerState) {
    const cancelAction =
      state.featureId === "audio-analysis" ? "audio-process-cancel" : "process-cancel";
    const roomApi = getRoomApi();
    if (!roomApi || typeof roomApi.sendEvent !== "function") {
      sendMediaAction(cancelAction);
      return;
    }
    const cancelRequestId = createActionRequestId(cancelAction);
    dispatch({ type: "analysis-cancel-requested", requestId: cancelRequestId });
    sendMediaAction(cancelAction, {}, { requestId: cancelRequestId });
  }

  function requestDeepAnalysis(state: LabControllerState) {
    const scopeChoice = requestAnalysisScopeChoice(state);
    if (scopeChoice === "cancel" || scopeChoice === "pending") {
      return;
    }
    startDeepAnalysis(deps.store.getState(), scopeChoice);
  }

  function requestReportExport(format: ReportOverlayExportFormat) {
    startTrackedReportExport({ format, reportView: deps.store.getState().ui.reportView });
  }

  function runPrimaryAction() {
    const state = deps.store.getState();

    if (hasReportPayload(state) && (state.ui.workspace.reportOverlayOpen || isRunComplete(state))) {
      startTrackedReportExport();
      return;
    }

    if (isRunActive(state)) {
      if (state.ui.analysisCancelPending === true) {
        return;
      }
      requestAnalysisCancel(state);
      return;
    }
    if (getSourceReady(state) && getAnalysisActionBlockReason(state) === null) {
      requestDeepAnalysis(state);
      return;
    }

    if (getSourceReady(state) && getEditActionBlockReason(state) === null) {
      sendMediaAction("edit-preview");
      return;
    }

    runSourcePrimaryAction();
  }

  function handleFocusSurfacePointer(event: Event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }
    if (isInsideWorkspaceInspector(target)) {
      setLabFocusLayer("inspector");
      return;
    }
    if (isInsideWorkspacePreview(target)) {
      setLabFocusLayer("preview");
      return;
    }
    if (target.closest(".labx-timeline") !== null) {
      setLabFocusLayer("timeline");
    }
  }

  function handleFocusIn(event: Event) {
    handleFocusSurfacePointer(event);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && analysisScopeOverlay.isOpen()) {
      event.preventDefault();
      cancelAnalysisScopeOverlay();
      return;
    }
    if (event.ctrlKey !== true || event.key.toLowerCase() !== "b") {
      return;
    }
    if (isTextControl(event.target)) {
      return;
    }
    event.preventDefault();
    dispatch({ type: "drawer-collapsed-toggled" });
  }

  function handleClick(event: Event) {
    closeLabAssetMenusForClick(event, deps.documentRef);
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    const actionButton = target.closest<HTMLElement>("[data-lab-action]");
    if (!actionButton) {
      return;
    }

    const action = toStringValue(actionButton.dataset["labAction"]);
    const value = toStringValue(actionButton.dataset["labValue"]);
    const state = deps.store.getState();
    if (isInsideWorkspaceInspector(target)) {
      setLabFocusLayer("inspector");
    } else if (isTimelineAction(action)) {
      setLabFocusLayer("timeline");
    }
    if (handleSourceClickAction(action, value)) {
      return;
    }
    if (guardActiveAnalysisWorkspaceAction(action)) {
      return;
    }
    switch (action) {
      case "room-close":
        deps.windowRef.roomAPI?.close?.();
        return;
      case "primary-action":
        runPrimaryAction();
        return;
      case "workspace-toggle-source-intake":
        dispatch({ type: "workspace-source-intake-toggled" });
        return;
      case "workspace-controls-drawer-toggle":
        dispatch({ type: "workspace-controls-drawer-toggled" });
        return;
      case "workspace-controls-tab-select": {
        const tab = normalizeWorkspaceControlTab(value);
        if (tab !== null && state.ui.workspace.controlsDrawerTab !== tab) {
          dispatch({ type: "workspace-controls-tab-selected", tab });
        } else if (tab !== null && state.ui.workspace.controlsDrawerOpen !== true) {
          dispatch({ type: "workspace-controls-drawer-toggled", force: true });
        }
        return;
      }
      case "toggle-tool-manager":
        dispatch({ type: "tool-manager-toggled" });
        return;
      case "drawer-collapsed-toggled":
        dispatch({ type: "drawer-collapsed-toggled" });
        return;
      case "drawer-explore-toggled":
        dispatch({ type: "drawer-explore-toggled" });
        return;
      case "topbar-pill-selection":
        dispatch({
          type: "selection-tab-toggled",
          active: !state.ui.workspace.selectionTabActive,
        });
        return;
      case "topbar-pill-source":
        if (state.ui.workspace.selectionTabActive) {
          dispatch({ type: "selection-tab-toggled", active: false });
        }
        if (isRunActive(state) !== true) {
          dispatch({ type: "drawer-mode-requested", mode: "setup" });
        }
        return;
      case "topbar-pill-analyze":
        if (state.ui.workspace.selectionTabActive) {
          dispatch({ type: "selection-tab-toggled", active: false });
        }
        if (isRunActive(state)) {
          dispatch({ type: "drawer-mode-requested", mode: null });
        }
        return;
      case "topbar-pill-results":
        if (hasReportPayload(state)) {
          dispatch({ type: "drawer-mode-requested", mode: "result" });
        }
        return;
      case "close-tool-manager":
      case "dismiss-tool-manager":
        dispatch({ type: "tool-manager-toggled", open: false });
        return;
      case "tools-refresh":
        sendMediaAction("tools-refresh");
        return;
      case "tool-check-all-updates":
        sendMediaAction("tool-check-all-updates", {
          featureStage: getToolLifecycleStage(state),
          actionFamily: "tool-lifecycle",
        });
        return;
      case "tool-update-selected": {
        const toolIds = getSelectedToolUpdateIds(state);
        if (toolIds.length === 0) {
          dispatch({
            type: "push-event",
            event: buildUiEvent("Güncellenecek araç seçilmedi.", "warning"),
          });
          return;
        }
        sendMediaAction("tool-update-selected", {
          toolIds,
          featureStage: getToolLifecycleStage(state),
          actionFamily: "tool-lifecycle",
        });
        return;
      }
      case "tool-update-all":
        sendMediaAction("tool-update-all", {
          toolIds: getInstalledRoomManagedToolIds(state),
          featureStage: getToolLifecycleStage(state),
          actionFamily: "tool-lifecycle",
        });
        return;
      case "tool-install-review":
        if (value.trim() !== "") {
          dispatch({ type: "tool-install-review-requested", toolId: value });
        }
        return;
      case "tool-install-dismiss":
        dispatch({ type: "tool-install-review-dismissed" });
        return;
      case "tool-install-confirm":
        if (value.trim() === "") {
          return;
        }
        dispatch({ type: "tool-install-review-dismissed" });
        sendMediaAction("tool-install", {
          toolId: value,
          featureStage: getToolLifecycleStage(state),
          actionFamily: "tool-lifecycle",
        });
        return;
      case "tool-job-cancel":
        if (value.trim() !== "") {
          sendMediaAction("job-cancel", {
            jobId: value,
            actionFamily: "tool-lifecycle",
          });
        }
        return;
      case "tool-install":
      case "tool-update":
      case "tool-check-updates":
        if (value.trim() === "") {
          return;
        }
        sendMediaAction(action, {
          toolId: value,
          featureStage: getToolLifecycleStage(state),
          actionFamily: "tool-lifecycle",
        });
        return;
      case "feature-activate":
        activateFeature(value);
        return;
      case "feature-toggle":
        toggleFeature(value);
        return;
      case "capability-select":
        syncCapabilities(
          deps.store
            .getState()
            .selectedCapabilities.concat(
              value as import("../domain/lab-types.js").CapabilityFamilyId
            )
        );
        return;
      case "capability-deselect":
        syncCapabilities(
          deps.store.getState().selectedCapabilities.filter(function (entry) {
            return entry !== value;
          })
        );
        return;
      case "capability-toggle": {
        const caps = deps.store.getState().selectedCapabilities;
        syncCapabilities(
          caps.includes(value as import("../domain/lab-types.js").CapabilityFamilyId)
            ? caps.filter(function (entry) {
                return entry !== value;
              })
            : caps.concat(value as import("../domain/lab-types.js").CapabilityFamilyId)
        );
        return;
      }
      case "module-toggle":
        if (isWorkspaceMutationLocked("analysis")) {
          pushLockedWorkspaceEvent("Analiz modülleri aktif analiz sırasında kilitli.");
          return;
        }
        {
          const parsed = parseAnalysisPreparationModuleValue(value);
          if (parsed) {
            dispatch({
              type: "analysis-prep-module-toggled",
              capabilityId: parsed.capabilityId,
              moduleId: parsed.moduleId,
            });
            syncCurrentWorkbenchToHost();
          }
        }
        return;
      case "edit-mode":
        sendMediaAction("edit-set-mode", { mode: value });
        return;
      case "profile-mode":
        sendMediaAction("profile-set-mode", { mode: value });
        return;
      case "report-view":
        dispatch({
          type: "report-view-changed",
          view: value === "ai" ? "ai" : "user",
        });
        return;
      case "toggle-artifacts":
        dispatch({ type: "toggle-artifacts" });
        return;
      case "toggle-event-feed":
        dispatch({ type: "toggle-event-feed" });
        return;
      case "event-feed-next":
        dispatch({ type: "advance-event-feed" });
        return;
      case "event-feed-reset":
        dispatch({ type: "reset-event-feed" });
        return;
      case "toggle-live-findings":
        dispatch({ type: "live-findings-expanded" });
        return;
      case "toggle-analysis-controls":
        dispatch({ type: "analysis-controls-collapsed" });
        return;
      case "toggle-edit-side-panel":
        dispatch({ type: "edit-side-panel-toggled" });
        return;
      case "toggle-raw-log":
        dispatch({ type: "raw-log-toggled" });
        return;
      case "show-more-artifacts":
        dispatch({ type: "show-more-artifacts" });
        return;
      case "preview-artifact":
        dispatch({
          type: "preview-artifact-activated",
          artifactId: value.trim() !== "" ? value : null,
        });
        return;
      case "new-run-from-report": {
        const run = getCurrentRun(state);
        if (run?.analysisScope) {
          updateWorkbench(function (workbench) {
            return {
              ...workbench,
              forkedFromRunId: run.id,
              analysisScope: {
                ...run.analysisScope,
                lifecycle: {
                  mutable: true,
                  processId: null,
                  frozenAt: null,
                },
              },
            };
          });
        }
        dispatch({ type: "preview-artifact-activated", artifactId: null });
        dispatch({ type: "report-overlay-toggled", open: false });
        return;
      }
      case "save-project": {
        saveActiveProjectCheckpoint();
        return;
      }
      case "analysis-scope-choice":
        startAnalysisFromScopeOverlay(parseAnalysisScopeChoice(value));
        return;
      case "analysis-scope-cancel":
        cancelAnalysisScopeOverlay();
        return;
      case "run-deep-analysis": {
        const blockReason = getAnalysisActionBlockReason(state);
        if (blockReason !== null) {
          dispatch({
            type: "push-event",
            event: buildUiEvent(blockReason, "warning"),
          });
          return;
        }
        requestDeepAnalysis(state);
        return;
      }
      case "preflight-auto-run-toggle":
        dispatch({ type: "analysis-preflight-auto-run-toggled" });
        syncCurrentWorkbenchToHost();
        return;
      case "cancel-analysis": {
        const run = getCurrentRun(state);
        if (
          run &&
          (run.state === "running" || run.state === "queued") &&
          state.ui.analysisCancelPending !== true
        ) {
          requestAnalysisCancel(state);
        }
        return;
      }
      case "project-select": {
        selectProjectByValue(value);
        return;
      }
      case "project-create": {
        startCleanProjectSession();
        return;
      }
      case "project-delete": {
        deleteActiveProject();
        return;
      }
      case "workspace-roi-toggle":
        if (isWorkspaceMutationLocked("roi")) {
          pushLockedWorkspaceEvent("ROI düzenleme aktif analiz sırasında kilitli.");
          return;
        }
        if (value.trim() !== "") {
          dispatch({ type: "workspace-roi-toggled", regionId: value });
        }
        return;
      case "workspace-roi-remove":
        if (isWorkspaceMutationLocked("roi")) {
          pushLockedWorkspaceEvent("ROI düzenleme aktif analiz sırasında kilitli.");
          return;
        }
        if (value.trim() !== "") {
          dispatch({ type: "workspace-roi-removed", regionId: value });
        }
        return;
      case "workspace-roi-export": {
        exportWorkspaceRoi(value);
        return;
      }
      case "workspace-selection-roi-export": {
        exportSelectionRoi();
        return;
      }
      case "workspace-enhanced-frame-export": {
        exportEnhancedFrame();
        return;
      }
      case "workspace-before-after-export": {
        exportBeforeAfterVariant();
        return;
      }
      case "workspace-image-comparison-export": {
        exportImageComparison();
        return;
      }
      case "workspace-comparison-moment-capture": {
        captureComparisonMoment();
        return;
      }
      case "workspace-comparison-finding-save": {
        saveComparisonFinding();
        return;
      }
      case "workspace-comparison-finding-focus": {
        focusComparisonFinding(value, state);
        return;
      }
      case "timeline-export-clip": {
        exportTimelineClip();
        return;
      }
      case "timeline-stabilize-segment": {
        exportStabilizedSegment();
        return;
      }
      case "timeline-grab-frame": {
        grabTimelineFrame();
        return;
      }
      case "timeline-extract-audio":
        extractTimelineAudio();
        return;
      case "workspace-audio-cleanup-export":
        exportAudioCleanup();
        return;
      case "workspace-band-pass-voice-export":
        exportBandPassVoice();
        return;
      case "workspace-stem-separation-export":
        exportStemSeparation();
        return;
      case "timeline-toggle-micro-zoom":
        dispatch({ type: "workspace-selection-micro-zoom-toggled" });
        return;
      case "timeline-toggle-selection-loop":
        if (isWorkspaceMutationLocked("timeline")) {
          return;
        }
        dispatch({ type: "workspace-selection-loop-toggled" });
        return;
      case "timeline-play-selection":
        if (isWorkspaceMutationLocked("timeline")) {
          return;
        }
        playSelectedTimelineRange();
        return;
      case "timeline-toggle-playback":
        if (isWorkspaceMutationLocked("timeline")) {
          return;
        }
        toggleTimelinePlayback();
        return;
      case "timeline-shift-playhead":
        if (isWorkspaceMutationLocked("timeline")) {
          return;
        }
        shiftTimelinePlayhead(value);
        return;
      case "workspace-asset-select":
        dispatch({
          type: "workspace-asset-selected",
          assetId: value.trim() !== "" ? value : null,
        });
        return;
      case "workspace-content-open":
        dispatch({
          type: "workspace-content-opened",
          assetId: value.trim() !== "" ? value : null,
        });
        return;
      case "workspace-comparison-reference-set":
        dispatch({
          type: "workspace-comparison-reference-set",
          assetId: value.trim() !== "" ? value : null,
        });
        return;
      case "open-document-overlay":
        if (value.trim() !== "") {
          dispatch({
            type: "document-overlay-opened",
            assetId: value,
          });
        }
        return;
      case "focus-source-preview":
        if (value.trim() !== "") {
          focusSourcePreview();
        }
        return;
      case "asset-download":
        if (value.trim() !== "") {
          downloadAsset(value);
        }
        return;
      case "asset-remove":
        removeAssetsWithConfirmation([value]);
        return;
      case "analysis-prep-group-drawer-toggle":
        if (value.trim() !== "") {
          const capabilityId = value.trim() as CapabilityFamilyId;
          const expandedCapabilityIds = state.ui.workspace.analysisPrepExpandedCapabilityIds;
          dispatch({
            type: "analysis-prep-group-expanded",
            capabilityIds: expandedCapabilityIds.includes(capabilityId)
              ? expandedCapabilityIds.filter(function (entry) {
                  return entry !== capabilityId;
                })
              : expandedCapabilityIds.concat(capabilityId),
          });
        }
        return;
      case "analysis-prep-group-toggle":
        if (isWorkspaceMutationLocked("analysis")) {
          pushLockedWorkspaceEvent("Analiz modülleri aktif analiz sırasında kilitli.");
          return;
        }
        if (value.trim() !== "") {
          dispatch({
            type: "analysis-prep-group-toggled",
            capabilityId: value as import("../domain/lab-types.js").CapabilityFamilyId,
          });
          syncCurrentWorkbenchToHost();
        }
        return;
      case "workspace-process-view-toggled":
        if (isRunActive(state)) {
          return;
        }
        dispatch({ type: "workspace-process-view-toggled" });
        return;
      case "workspace-setting-adjust":
        applyWorkspaceSettingAdjustment(actionButton);
        return;
      case "operation-cancel":
        cancelTrackedOperation(value);
        return;
      case "operation-settings-reset":
        resetOperationSettings(value);
        return;
      case "analysis-settings-reset":
        resetAnalysisModuleSettings(value);
        return;
      case "workspace-image-analysis":
        dispatch({ type: "workspace-image-analysis-requested" });
        sendMediaAction("edit-preview");
        return;
      case "workspace-reset-controls":
        resetInteractiveSettings();
        return;
      case "workspace-reset-audio-focus":
        dispatch({
          type: "workspace-audio-updated",
          patch: DEFAULT_AUDIO_FOCUS_SETTINGS,
        });
        return;
      case "timeline-add-bookmark":
        addCurrentTimelineBookmark();
        return;
      case "timeline-remove-bookmark":
        if (value.trim() !== "") {
          dispatch({ type: "workspace-bookmark-removed", bookmarkId: value });
        }
        return;
      case "timeline-seek":
        if (isWorkspaceMutationLocked("timeline")) {
          return;
        }
        if (value.trim() !== "") {
          const timeMs = Number(value);
          if (Number.isFinite(timeMs) !== true) {
            return;
          }
          seekTimelineToMs(timeMs);
          centerTimelineTarget(actionButton);
        }
        return;
      case "timeline-set-selection-boundary":
        if (isWorkspaceMutationLocked("timeline")) {
          pushLockedWorkspaceEvent("Zaman aralığı aktif analiz sırasında kilitli.");
          return;
        }
        setTimelineSelectionBoundary(value);
        return;
      case "timeline-interact":
      case "timeline-drag-start":
      case "timeline-drag-end":
      case "timeline-drag-body":
        return;
      case "timeline-finetune": {
        if (isWorkspaceMutationLocked("timeline")) {
          pushLockedWorkspaceEvent("Zaman aralığı aktif analiz sırasında kilitli.");
          return;
        }
        const parts = value.split(":");
        if (parts.length === 2) {
          const prefix = parts[0];
          const delta = Number(parts[1]);
          if ((prefix === "start" || prefix === "end") && Number.isFinite(delta)) {
            const currentStart = state.ui.workspace.timelineStartMs;
            const currentEnd = state.ui.workspace.timelineEndMs;
            const timelineEl = target.closest<HTMLElement>(".labx-timeline");
            const finetuneDurationMs = timelineEl ? Number(timelineEl.dataset["duration"] || 0) : 0;
            if (prefix === "start" && currentStart !== null) {
              const next = Math.max(
                0,
                Math.min(currentEnd ?? finetuneDurationMs, currentStart + delta)
              );
              dispatch({ type: "workspace-timeline-updated", startMs: next, endMs: currentEnd });
            } else if (prefix === "end" && currentEnd !== null) {
              const maxMs = finetuneDurationMs || currentEnd + Math.abs(delta);
              const next = Math.max(currentStart ?? 0, Math.min(maxMs, currentEnd + delta));
              dispatch({ type: "workspace-timeline-updated", startMs: currentStart, endMs: next });
            }
          }
        }
        return;
      }
      case "timeline-clear": {
        if (isWorkspaceMutationLocked("timeline")) {
          pushLockedWorkspaceEvent("Zaman aralığı aktif analiz sırasında kilitli.");
          return;
        }
        dispatch({ type: "workspace-timeline-updated", startMs: null, endMs: null });
        return;
      }
      case "toggle-report-view":
        dispatch({ type: "document-overlay-cleared" });
        dispatch({ type: "report-overlay-toggled", open: true });
        return;
      case "open-report-overlay":
        dispatch({ type: "document-overlay-cleared" });
        if (value === "ai" || value === "user") {
          dispatch({
            type: "report-view-changed",
            view: value,
          });
        }
        dispatch({ type: "report-overlay-toggled", open: true });
        return;
      case "close-report-overlay":
        dispatch({ type: "report-overlay-toggled", open: false });
        return;
      case "report-tab-switch":
        dispatch({
          type: "report-view-changed",
          view: value === "ai" ? "ai" : "user",
        });
        return;
      case "report-export-json":
        requestReportExport("json");
        return;
      case "report-export-pdf":
        requestReportExport("pdf");
        return;
      case "source-panel-toggle":
        dispatch({ type: "source-panel-toggled" });
        return;
      case "inspector-pin-toggle":
        dispatch({ type: "inspector-pin-toggle" });
        return;
      case "icon-rail-slot-select":
        dispatch({
          type: "icon-rail-slot-selected",
          slotId:
            value.trim() !== ""
              ? (value as import("../domain/lab-types.js").LabIconRailSlotId)
              : null,
        });
        return;
      default:
        return;
    }
  }

  function attach() {
    if (attached) {
      return;
    }
    attached = true;
    deps.documentRef.addEventListener("click", handleClick);
    deps.documentRef.addEventListener("contextmenu", openLabAssetContextMenu);
    deps.documentRef.addEventListener("input", handleInput);
    deps.documentRef.addEventListener("change", handleChange);
    deps.documentRef.addEventListener("focusin", handleFocusIn);
    deps.documentRef.addEventListener("mousedown", handleMouseDown);
    deps.documentRef.addEventListener("pointerdown", handleFocusSurfacePointer);
    deps.documentRef.addEventListener("keydown", handleKeyDown as EventListener);
    deps.windowRef.addEventListener("mousemove", handleTimelineMouseMove as EventListener);
    deps.windowRef.addEventListener("mouseup", handleTimelineMouseUp as EventListener);
    let prevHeavyWorkActive = isAnyHeavyWorkActive(deps.store.getState());
    deps.store.subscribe(function () {
      syncTimelinePlaybackUiFromState();
      workspaceAudioVisualizer.sync();
      const currentHeavy = isAnyHeavyWorkActive(deps.store.getState());
      if (currentHeavy && !prevHeavyWorkActive) {
        const media = getTimelineSyncMedia();
        if (media !== null && media.paused === false) {
          media.pause?.();
        }
      }
      prevHeavyWorkActive = currentHeavy;
    });
    queueMicrotask(function () {
      syncTimelinePlaybackUiFromState();
      workspaceAudioVisualizer.sync();
    });
  }

  function getPrimaryActionState() {
    return getLabPrimaryActionState(deps.store.getState());
  }

  function handleBusEvent(event: LabStoreEvent) {
    handleMediaActionBusEvent();
    if (event.type === "workspace-selection-suggestion-queued") {
      syncCurrentWorkbenchToHost();
      return;
    }
    if (event.type !== "workspace-selection-suggestion-accepted") {
      return;
    }
    syncCurrentWorkbenchToHost();
  }

  deps.eventBus.subscribe(handleBusEvent);

  return {
    attach,
    getPrimaryActionState,
  };
}
