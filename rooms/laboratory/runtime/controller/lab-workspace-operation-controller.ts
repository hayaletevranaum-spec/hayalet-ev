import { asLabRecord, normalizeLabOperationSettings } from "../../domain/lab-types.js";
import type { LabComparisonSide } from "../../domain/lab-types.js";
import type { createLabStore } from "../lab-store.js";
import { buildUiEvent } from "./lab-controller-helpers.js";

type LabStoreState = ReturnType<ReturnType<typeof createLabStore>["getState"]>;

type LabWorkspaceOperationControllerDeps = {
  dispatch: ReturnType<typeof createLabStore>["dispatch"];
  getActiveSelectionOperationPayload: (
    state?: LabStoreState,
    options?: {
      comparisonRoiTarget?: "active-side" | "primary" | "reference";
      comparisonTarget?: "active-side" | "primary" | "reference";
    }
  ) => Record<string, unknown>;
  getCurrentRunContextPayload: (state?: LabStoreState) => Record<string, unknown>;
  isWorkspaceMutationLocked: (
    area: "source" | "timeline" | "roi" | "analysis" | "hypothesis"
  ) => boolean;
  pushLockedWorkspaceEvent: (message: string) => void;
  startTrackedOperationForUiAction: (
    uiActionId: string,
    payload?: Record<string, unknown>
  ) => string | null;
  store: ReturnType<typeof createLabStore>;
};

export function createLabWorkspaceOperationController(deps: LabWorkspaceOperationControllerDeps) {
  function getComparisonReplacementTargets(state: LabStoreState, requireRoi: boolean) {
    if (state.ui.workspace.comparisonReferenceAssetId === null) {
      return [];
    }
    return (["primary", "reference"] as const).filter(function (side) {
      return requireRoi !== true || state.ui.workspace.comparisonRois[side] !== null;
    });
  }

  function startComparisonReplacementOperations(input: {
    batchPrefix: string;
    regionPrefix?: string;
    state: LabStoreState;
    targets: LabComparisonSide[];
    uiActionId: string;
  }) {
    const batchId =
      input.targets.length > 1
        ? `${input.batchPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        : null;
    input.targets.forEach(function (side) {
      deps.startTrackedOperationForUiAction(input.uiActionId, {
        ...(input.regionPrefix === undefined ? {} : { regionId: `${input.regionPrefix}-${side}` }),
        ...deps.getActiveSelectionOperationPayload(input.state, {
          comparisonRoiTarget: side,
          comparisonTarget: side,
        }),
        allowParallelWorkspaceOperation: input.targets.length > 1,
        ...(batchId === null
          ? {}
          : {
              workspaceOperationBatchId: batchId,
              workspaceOperationBatchSize: input.targets.length,
            }),
        workspaceResultMode: "replace-workspace-media",
        workspaceResultTargetSide: side,
      });
    });
  }

  function exportWorkspaceRoi(regionId: string) {
    const state = deps.store.getState();
    const roiRegion =
      state.ui.workspace.roiRegions.find(function (entry) {
        return entry.id === regionId;
      }) || null;
    if (roiRegion === null) {
      return;
    }
    deps.startTrackedOperationForUiAction("workspace-selection-roi-export", {
      regionId: roiRegion.id,
      x: roiRegion.x,
      y: roiRegion.y,
      width: roiRegion.width,
      height: roiRegion.height,
      ...deps.getCurrentRunContextPayload(state),
    });
  }

  function exportSelectionRoi() {
    const state = deps.store.getState();
    const comparisonTargets = getComparisonReplacementTargets(state, true);

    if (comparisonTargets.length > 0) {
      startComparisonReplacementOperations({
        batchPrefix: "roi-crop",
        regionPrefix: "selection",
        state,
        targets: comparisonTargets,
        uiActionId: "workspace-selection-roi-export",
      });
      return;
    }

    const selection = state.ui.workspace.activeSelection;
    if (selection?.roi === undefined) {
      deps.dispatch({
        type: "push-event",
        event: buildUiEvent("ROI çıktısı için önce görüntü üzerinde bölge seç.", "warning"),
      });
      return;
    }
    deps.startTrackedOperationForUiAction("workspace-selection-roi-export", {
      regionId: "selection",
      ...deps.getActiveSelectionOperationPayload(state),
      workspaceResultMode: "replace-workspace-media",
      workspaceResultTargetSide: "single",
    });
  }

  function exportEnhancedFrame() {
    const state = deps.store.getState();
    const comparisonTargets = getComparisonReplacementTargets(state, false);
    if (comparisonTargets.length > 0) {
      startComparisonReplacementOperations({
        batchPrefix: "enhanced-frame",
        state,
        targets: comparisonTargets,
        uiActionId: "workspace-enhanced-frame-export",
      });
      return;
    }
    deps.startTrackedOperationForUiAction("workspace-enhanced-frame-export", {
      ...deps.getActiveSelectionOperationPayload(state),
      workspaceResultMode: "replace-workspace-media",
      workspaceResultTargetSide: "single",
    });
  }

  function exportBeforeAfterVariant() {
    const state = deps.store.getState();
    deps.startTrackedOperationForUiAction(
      "workspace-before-after-export",
      deps.getActiveSelectionOperationPayload(state)
    );
  }

  function exportImageComparison() {
    const state = deps.store.getState();
    deps.startTrackedOperationForUiAction(
      "workspace-image-comparison-export",
      deps.getActiveSelectionOperationPayload(state, { comparisonTarget: "primary" })
    );
  }

  function getComparisonCapturePayload(captureKind: "moment" | "finding") {
    const state = deps.store.getState();
    const operationSettings = asLabRecord(asLabRecord(state.workbench)["operationSettings"]);
    const imageComparisonSettings = normalizeLabOperationSettings(
      "image-comparison",
      operationSettings["image-comparison"]
    );
    return {
      ...deps.getActiveSelectionOperationPayload(state, { comparisonTarget: "primary" }),
      captureKind,
      comparisonViewMode: state.ui.workspace.comparisonViewMode,
      comparisonSplitPercent: state.ui.workspace.comparisonSplitPercent,
      findingNote: state.ui.workspace.comparisonFindingNote,
      operationSettings: imageComparisonSettings,
    };
  }

  function captureComparisonMoment() {
    deps.startTrackedOperationForUiAction(
      "workspace-comparison-moment-capture",
      getComparisonCapturePayload("moment")
    );
  }

  function saveComparisonFinding() {
    deps.startTrackedOperationForUiAction(
      "workspace-comparison-finding-save",
      getComparisonCapturePayload("finding")
    );
  }

  function exportTimelineClip() {
    if (deps.isWorkspaceMutationLocked("timeline")) {
      deps.pushLockedWorkspaceEvent("Zaman aralığı dışa aktarımı aktif analiz sırasında kilitli.");
      return;
    }
    const state = deps.store.getState();
    const ws = state.ui.workspace;
    if (ws.timelineStartMs !== null && ws.timelineEndMs !== null) {
      deps.startTrackedOperationForUiAction("timeline-export-clip", {
        ...deps.getActiveSelectionOperationPayload(state),
        startMs: ws.timelineStartMs,
        endMs: ws.timelineEndMs,
      });
    }
  }

  function exportStabilizedSegment() {
    if (deps.isWorkspaceMutationLocked("timeline")) {
      deps.pushLockedWorkspaceEvent("Stabilizasyon aktif analiz sırasında kilitli.");
      return;
    }
    const state = deps.store.getState();
    const ws = state.ui.workspace;
    if (ws.timelineStartMs !== null && ws.timelineEndMs !== null) {
      deps.startTrackedOperationForUiAction("timeline-stabilize-segment", {
        ...deps.getActiveSelectionOperationPayload(state),
        startMs: ws.timelineStartMs,
        endMs: ws.timelineEndMs,
      });
    }
  }

  function grabTimelineFrame() {
    const state = deps.store.getState();
    const ws = state.ui.workspace;
    const seekMs = ws.timelineStartMs !== null ? ws.timelineStartMs : 0;
    deps.startTrackedOperationForUiAction("timeline-grab-frame", {
      ...deps.getActiveSelectionOperationPayload(state),
      seekMs,
    });
  }

  function extractTimelineAudio() {
    const state = deps.store.getState();
    deps.startTrackedOperationForUiAction("timeline-extract-audio", {
      ...deps.getActiveSelectionOperationPayload(state),
    });
  }

  function exportAudioCleanup() {
    deps.startTrackedOperationForUiAction(
      "workspace-audio-cleanup-export",
      deps.getActiveSelectionOperationPayload(deps.store.getState())
    );
  }

  function exportBandPassVoice() {
    deps.startTrackedOperationForUiAction(
      "workspace-band-pass-voice-export",
      deps.getActiveSelectionOperationPayload(deps.store.getState())
    );
  }

  function exportStemSeparation() {
    deps.startTrackedOperationForUiAction(
      "workspace-stem-separation-export",
      deps.getActiveSelectionOperationPayload(deps.store.getState())
    );
  }

  return {
    exportAudioCleanup,
    exportBandPassVoice,
    exportBeforeAfterVariant,
    exportEnhancedFrame,
    captureComparisonMoment,
    exportImageComparison,
    saveComparisonFinding,
    exportSelectionRoi,
    exportStabilizedSegment,
    exportStemSeparation,
    exportTimelineClip,
    exportWorkspaceRoi,
    extractTimelineAudio,
    grabTimelineFrame,
  };
}
