import {
  asLabRecord,
  asNonEmptyString,
  createLabEventId,
  LAB_OPERATION_CAPABILITIES,
  normalizeLabOperationSettings,
} from "../../domain/lab-types.js";
import type {
  LabComparisonRoiState,
  LabComparisonSide,
  LabOperationCapabilityId,
  LabSelectionROI,
  LabStoreState,
  LabUserActionEvent,
} from "../../domain/lab-types.js";
import { getTrackedOperationActionId } from "../lab-operation-action-map.js";
import {
  getActionOutputs,
  getInteractiveSettingsForComparisonSide,
  getUserActions,
} from "../lab-selectors.js";
import type { createLabStore } from "../lab-store.js";
import {
  LAB_USER_ACTION_HUB_SUCCESS_WINDOW_MS,
  getTrackedLabUserActionDefinition,
} from "../lab-user-actions.js";
import { isFullSourceWorkspaceSelection } from "../lab-workspace-selection.js";
import { buildUiEvent } from "./lab-controller-helpers.js";

type LabRoomApi = {
  sendEvent?: (eventName: string, payload: Record<string, unknown>) => void;
};

type LabMediaActionWindow = {
  roomAPI?: LabRoomApi;
};

type LabReportExportFormat = "json" | "pdf";
type LabReportExportView = "user" | "ai";

type LabReportExportOptions = {
  format?: LabReportExportFormat;
  reportView?: LabReportExportView;
  targetDirectory?: string | null;
};

type LabMediaActionControllerDeps = {
  dispatch: ReturnType<typeof createLabStore>["dispatch"];
  store: ReturnType<typeof createLabStore>;
  windowRef: LabMediaActionWindow;
};

function createActionRequestId(action: string) {
  return `${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readPayloadNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function serializeSelectionRoi(roi: LabSelectionROI | null | undefined) {
  if (roi === null || roi === undefined) {
    return null;
  }
  return {
    height: roi.height,
    width: roi.width,
    x: roi.x,
    y: roi.y,
  };
}

function getComparisonRoisOperationPayload(
  comparisonRois: LabComparisonRoiState
): Record<string, unknown> {
  const primary = serializeSelectionRoi(comparisonRois.primary);
  const reference = serializeSelectionRoi(comparisonRois.reference);
  if (primary === null && reference === null) {
    return {};
  }
  return {
    comparisonRoiActiveSide: comparisonRois.activeSide,
    comparisonRois: {
      activeSide: comparisonRois.activeSide,
      primary,
      reference,
    },
    ...(primary === null ? {} : { primaryNormalizedRoi: primary }),
    ...(reference === null ? {} : { referenceNormalizedRoi: reference }),
  };
}

type ActiveSelectionOperationPayloadOptions = {
  comparisonRoiTarget?: "active-side" | LabComparisonSide;
  comparisonTarget?: "active-side" | LabComparisonSide;
};

type WorkspaceResultTargetSide = LabComparisonSide | "single";

export function createLabMediaActionController(deps: LabMediaActionControllerDeps) {
  const hubDismissTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingWorkspaceResultTargets = new Map<
    string,
    {
      side: WorkspaceResultTargetSide;
    }
  >();

  function getRoomApi() {
    return deps.windowRef.roomAPI;
  }

  function sendMediaAction(
    action: string,
    payload: Record<string, unknown> = {},
    options: { requestId?: string } = {}
  ) {
    const roomApi = getRoomApi();
    if (!roomApi || typeof roomApi.sendEvent !== "function") {
      deps.dispatch({
        type: "push-event",
        event: buildUiEvent("Room API bridge is not connected.", "error"),
      });
      return null;
    }

    const state = deps.store.getState();
    const requestId = options.requestId || createActionRequestId(action);
    roomApi.sendEvent("media-action", {
      requestId,
      action,
      payload: {
        featureId: state.featureId,
        ...payload,
      },
    });
    return requestId;
  }

  function startTrackedUserAction(action: string, payload: Record<string, unknown> = {}) {
    const definition = getTrackedLabUserActionDefinition(action);
    if (!definition) {
      return sendMediaAction(action, payload);
    }

    const state = deps.store.getState();
    const requestId = createActionRequestId(action);
    const sentRequestId = sendMediaAction(action, payload, { requestId });
    if (sentRequestId === null) {
      return null;
    }

    deps.dispatch({
      type: "user-action-added",
      actionEvent: {
        id: createLabEventId("user-action"),
        type: definition.type,
        label: definition.label,
        status: "running",
        startedAt: Date.now(),
        dismissedFromHubAt: null,
        projectId: state.projectIndex.activeProjectId,
        requestId: sentRequestId,
        sourceAction: action,
      } satisfies LabUserActionEvent,
    });
    return sentRequestId;
  }

  function getWorkspaceResultTargetSide(
    payload: Record<string, unknown>
  ): WorkspaceResultTargetSide | null {
    if (payload["workspaceResultMode"] !== "replace-workspace-media") {
      return null;
    }
    const side = asNonEmptyString(payload["workspaceResultTargetSide"]);
    return side === "primary" || side === "reference" || side === "single" ? side : "single";
  }

  function startTrackedReportExport(options: LabReportExportOptions = {}) {
    const state = deps.store.getState();
    const targetDirectory = asNonEmptyString(options.targetDirectory);
    const reportView =
      options.reportView === "ai" || options.reportView === "user"
        ? options.reportView
        : options.format === "json" || options.format === "pdf"
          ? state.ui.reportView
          : null;
    const payload: Record<string, unknown> = {
      ...(options.format === "json" || options.format === "pdf" ? { format: options.format } : {}),
      ...(reportView === null ? {} : { reportView }),
      ...(targetDirectory === null ? {} : { targetDirectory }),
    };
    return startTrackedUserAction(
      state.featureId === "audio-analysis" ? "audio-report-export" : "report-export",
      payload
    );
  }

  function getCurrentRunContextPayload(state = deps.store.getState()): Record<string, unknown> {
    const workspaceTargetAssetId = asNonEmptyString(state.ui.activeWorkspaceAssetId);
    const comparisonReferenceAssetId = asNonEmptyString(
      state.ui.workspace.comparisonReferenceAssetId
    );
    return {
      ...(workspaceTargetAssetId === null ? {} : { workspaceTargetAssetId }),
      ...(comparisonReferenceAssetId === null ? {} : { comparisonReferenceAssetId }),
    };
  }

  function getOperationCapabilityIdForUiAction(
    uiActionId: string
  ): LabOperationCapabilityId | null {
    return (
      LAB_OPERATION_CAPABILITIES.find(function (capability) {
        return capability.actionId === uiActionId;
      })?.id || null
    );
  }

  function getOperationSettingsPayload(
    capabilityId: LabOperationCapabilityId | null,
    state = deps.store.getState(),
    payload: Record<string, unknown> = {}
  ): Record<string, unknown> {
    if (capabilityId === null) {
      return {};
    }
    const operationSettings = asLabRecord(state.workbench["operationSettings"]);
    const normalizedSettings = {
      ...normalizeLabOperationSettings(capabilityId, operationSettings[capabilityId]),
    };
    const startMs = readPayloadNumber(payload["startMs"]);
    const endMs = readPayloadNumber(payload["endMs"]);
    const hasTimeRange = startMs !== null && endMs !== null && endMs > startMs;
    const normalizedRoi = asLabRecord(payload["normalizedRoi"]);
    const hasRoi =
      typeof normalizedRoi["x"] === "number" &&
      typeof normalizedRoi["y"] === "number" &&
      typeof normalizedRoi["width"] === "number" &&
      typeof normalizedRoi["height"] === "number";
    if (capabilityId === "clip-export" && hasRoi) {
      normalizedSettings["applyRoiCrop"] = true;
    }
    if (capabilityId === "audio-extract" && hasTimeRange) {
      normalizedSettings["timelineOnly"] = true;
    }
    const resultTargetSide = getWorkspaceResultTargetSide(payload);
    const previewSettingsSide =
      resultTargetSide === "primary" || resultTargetSide === "reference"
        ? resultTargetSide
        : undefined;
    return {
      operationSettings: normalizedSettings,
      ...(capabilityId === "enhanced-frame" && normalizedSettings["applyPreviewSettings"] === true
        ? { previewSettings: getInteractiveSettingsForComparisonSide(state, previewSettingsSide) }
        : {}),
    };
  }

  function getComparisonOptionSide(
    state: LabStoreState,
    option: "active-side" | LabComparisonSide | undefined
  ): LabComparisonSide {
    return option === "primary" || option === "reference"
      ? option
      : state.ui.workspace.comparisonRois.activeSide;
  }

  function getComparisonSideTargetPayload(input: {
    includeNullRoi?: boolean;
    roiSide: LabComparisonSide;
    sourceSide: LabComparisonSide;
    state: LabStoreState;
  }): Record<string, unknown> {
    const comparisonReferenceAssetId = asNonEmptyString(
      input.state.ui.workspace.comparisonReferenceAssetId
    );
    if (comparisonReferenceAssetId === null) {
      return {};
    }
    const targetAssetId =
      input.sourceSide === "reference"
        ? comparisonReferenceAssetId
        : asNonEmptyString(input.state.ui.activeWorkspaceAssetId);
    const roi = serializeSelectionRoi(input.state.ui.workspace.comparisonRois[input.roiSide]);
    return {
      ...(targetAssetId === null ? {} : { workspaceTargetAssetId: targetAssetId }),
      ...(roi === null
        ? input.includeNullRoi === true
          ? { normalizedRoi: null }
          : {}
        : { normalizedRoi: roi }),
    };
  }

  function getActiveSelectionOperationPayload(
    state = deps.store.getState(),
    options: ActiveSelectionOperationPayloadOptions = {}
  ) {
    const selection = state.ui.workspace.activeSelection;
    const selectionIsFullSource = isFullSourceWorkspaceSelection(selection);
    const startMs =
      state.ui.workspace.timelineStartMs ??
      (selectionIsFullSource ? null : (selection?.startMs ?? null));
    const endMs =
      state.ui.workspace.timelineEndMs ??
      (selectionIsFullSource ? null : (selection?.endMs ?? null));
    const hasTimeRange = startMs !== null && endMs !== null && endMs > startMs;
    const comparisonTargetPayload = getComparisonSideTargetPayload({
      includeNullRoi:
        options.comparisonRoiTarget === "primary" || options.comparisonRoiTarget === "reference",
      roiSide: getComparisonOptionSide(state, options.comparisonRoiTarget),
      sourceSide: getComparisonOptionSide(state, options.comparisonTarget),
      state,
    });
    const seekMs =
      state.ui.workspace.timelineStartMs !== null
        ? state.ui.workspace.timelineStartMs
        : selectionIsFullSource
          ? 0
          : (selection?.startMs ?? 0);
    return {
      seekMs,
      ...(hasTimeRange ? { startMs, endMs } : {}),
      ...(selection?.roi
        ? {
            normalizedRoi: {
              height: selection.roi.height,
              width: selection.roi.width,
              x: selection.roi.x,
              y: selection.roi.y,
            },
          }
        : {}),
      ...getComparisonRoisOperationPayload(state.ui.workspace.comparisonRois),
      ...getCurrentRunContextPayload(state),
      ...comparisonTargetPayload,
    };
  }

  function startTrackedOperationForUiAction(uiActionId: string, payload?: Record<string, unknown>) {
    const trackedActionId = getTrackedOperationActionId(uiActionId);
    if (trackedActionId === null) {
      return null;
    }
    const capabilityId = getOperationCapabilityIdForUiAction(uiActionId);
    const operationPayload = {
      ...(payload || {}),
      ...getOperationSettingsPayload(capabilityId, deps.store.getState(), payload || {}),
    };
    const requestId = startTrackedUserAction(trackedActionId, operationPayload);
    const resultTargetSide = getWorkspaceResultTargetSide(operationPayload);
    if (requestId !== null && resultTargetSide !== null) {
      pendingWorkspaceResultTargets.set(requestId, { side: resultTargetSide });
    }
    return requestId;
  }

  function isOperationCapabilityId(value: string): value is LabOperationCapabilityId {
    return LAB_OPERATION_CAPABILITIES.some(function (capability) {
      return capability.id === value;
    });
  }

  function cancelTrackedOperation(capabilityId: string) {
    if (!isOperationCapabilityId(capabilityId)) {
      return;
    }
    const state = deps.store.getState();
    const capability =
      LAB_OPERATION_CAPABILITIES.find(function (entry) {
        return entry.id === capabilityId;
      }) || null;
    const trackedActionId = getTrackedOperationActionId(capability?.actionId);
    if (trackedActionId === null) {
      return;
    }
    const activeAction =
      getUserActions(state).find(function (entry) {
        return entry.sourceAction === trackedActionId && entry.status === "running";
      }) || null;
    if (activeAction === null) {
      deps.dispatch({
        type: "push-event",
        event: buildUiEvent("İptal edilecek aktif işlem bulunamadı.", "warning"),
      });
      return;
    }

    deps.dispatch({
      type: "user-action-updated",
      id: activeAction.id,
      patch: {
        message: "İptal isteği gönderildi.",
        progress: null,
      },
    });
    sendMediaAction("job-cancel", {
      actionId: trackedActionId,
      jobId: activeAction.jobId || null,
      projectId: activeAction.projectId || state.projectIndex.activeProjectId || null,
      sourceRequestId: activeAction.requestId || null,
    });
  }

  function clearHubDismissTimer(actionId: string) {
    const timer = hubDismissTimers.get(actionId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    hubDismissTimers.delete(actionId);
  }

  function scheduleHubDismiss(actionId: string) {
    if (hubDismissTimers.has(actionId)) {
      return;
    }
    hubDismissTimers.set(
      actionId,
      setTimeout(function () {
        hubDismissTimers.delete(actionId);
        deps.dispatch({
          type: "user-action-hub-dismissed",
          id: actionId,
        });
      }, LAB_USER_ACTION_HUB_SUCCESS_WINDOW_MS)
    );
  }

  function syncUserActionHubTimers() {
    const state = deps.store.getState();
    const activeUserActionIds = new Set<string>();
    getUserActions(state).forEach(function (entry) {
      activeUserActionIds.add(entry.id);
      if (entry.status === "success" && entry.dismissedFromHubAt == null) {
        if (
          Array.isArray(entry.resultAssetIds) &&
          entry.resultAssetIds.length > 0 &&
          getActionOutputs(state, entry.id).length === 0
        ) {
          clearHubDismissTimer(entry.id);
          return;
        }
        scheduleHubDismiss(entry.id);
        return;
      }
      clearHubDismissTimer(entry.id);
    });
    Array.from(hubDismissTimers.keys()).forEach(function (actionId) {
      if (!activeUserActionIds.has(actionId)) {
        clearHubDismissTimer(actionId);
      }
    });
  }

  function syncWorkspaceResultTargets() {
    if (pendingWorkspaceResultTargets.size === 0) {
      return;
    }
    const state = deps.store.getState();
    Array.from(pendingWorkspaceResultTargets.entries()).forEach(function ([requestId, target]) {
      const action =
        getUserActions(state).find(function (entry) {
          return entry.requestId === requestId;
        }) || null;
      if (
        action === null ||
        action.status !== "success" ||
        Array.isArray(action.resultAssetIds) !== true
      ) {
        return;
      }
      const outputAssetId =
        action.resultAssetIds.find(function (assetId) {
          return state.assets.some(function (asset) {
            return asset.id === assetId;
          });
        }) || null;
      if (outputAssetId === null) {
        return;
      }
      pendingWorkspaceResultTargets.delete(requestId);
      deps.dispatch({
        type: "workspace-operation-output-applied",
        assetId: outputAssetId,
        comparisonSide: target.side,
      });
    });
  }

  function handleBusEvent() {
    syncWorkspaceResultTargets();
    syncUserActionHubTimers();
  }

  return {
    cancelTrackedOperation,
    createActionRequestId,
    getActiveSelectionOperationPayload,
    getCurrentRunContextPayload,
    getRoomApi,
    handleBusEvent,
    isOperationCapabilityId,
    sendMediaAction,
    startTrackedOperationForUiAction,
    startTrackedReportExport,
    syncUserActionHubTimers,
  };
}
