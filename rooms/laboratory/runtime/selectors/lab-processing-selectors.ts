import type {
  LabProcessingOverlayState,
  LabStoreState,
  LabUserActionEvent,
} from "../../domain/lab-types.js";
import { LAB_OPERATION_CAPABILITIES } from "../../domain/lab-types.js";
import { getTrackedOperationActionId } from "../lab-operation-action-map.js";
import { getUserActions } from "./lab-activity-selectors.js";
import { getCurrentRun } from "./lab-source-selectors.js";

export function getRunElapsedSeconds(state: LabStoreState): number {
  const run = getCurrentRun(state);
  if (!run) {
    return 0;
  }
  const start = run.startedAt;
  const end = run.endedAt || Date.now();
  const diff = end - start;
  return diff > 0 ? Math.round(diff / 1000) : 0;
}

export function isRunActive(state: LabStoreState): boolean {
  const run = getCurrentRun(state);
  return run !== null && (run.state === "running" || run.state === "queued");
}

export function getActiveOperationCount(state: LabStoreState): number {
  return getUserActions(state).filter(function (entry) {
    return entry.status === "running";
  }).length;
}

export function isAnyHeavyWorkActive(state: LabStoreState): boolean {
  return isRunActive(state) || getActiveOperationCount(state) > 0;
}

function getOperationCapabilityForTrackedAction(sourceAction: string | null | undefined) {
  if (!sourceAction) {
    return null;
  }
  return (
    LAB_OPERATION_CAPABILITIES.find(function (capability) {
      return getTrackedOperationActionId(capability.actionId) === sourceAction;
    }) || null
  );
}

function getRunningOperationAction(state: LabStoreState): {
  action: LabUserActionEvent;
  capabilityId: (typeof LAB_OPERATION_CAPABILITIES)[number]["id"];
} | null {
  const action =
    getUserActions(state).find(function (entry) {
      return (
        entry.status === "running" &&
        getOperationCapabilityForTrackedAction(entry.sourceAction) !== null
      );
    }) || null;
  if (action === null) {
    return null;
  }
  const capability = getOperationCapabilityForTrackedAction(action.sourceAction);
  if (capability === null) {
    return null;
  }
  return {
    action,
    capabilityId: capability.id,
  };
}

function getUserActionElapsedSeconds(action: LabUserActionEvent): number {
  const end = action.finishedAt || Date.now();
  const diff = end - action.startedAt;
  return diff > 0 ? Math.round(diff / 1000) : 0;
}

function normalizeProgressValue(progress: number | null | undefined): number | null {
  if (typeof progress !== "number" || Number.isFinite(progress) !== true) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export function getProcessingOverlayState(state: LabStoreState): LabProcessingOverlayState {
  const run = getCurrentRun(state);
  if (run !== null && (run.state === "running" || run.state === "queued")) {
    const progress = normalizeProgressValue(run.progress);
    return {
      active: true,
      label: run.targetLabel || "Processing...",
      progress,
      indeterminate: progress === null,
      elapsedSeconds: getRunElapsedSeconds(state),
      cancelAction: state.ui.analysisCancelPending === true ? null : "cancel-analysis",
      cancelValue: "",
    };
  }

  const runningOperation = getRunningOperationAction(state);
  if (runningOperation !== null) {
    const progress = normalizeProgressValue(runningOperation.action.progress);
    return {
      active: true,
      label: runningOperation.action.label,
      progress,
      indeterminate: progress === null,
      elapsedSeconds: getUserActionElapsedSeconds(runningOperation.action),
      cancelAction: "operation-cancel",
      cancelValue: runningOperation.capabilityId,
    };
  }

  return {
    active: false,
    label: "",
    progress: null,
    indeterminate: true,
    elapsedSeconds: 0,
    cancelAction: null,
    cancelValue: "",
  };
}
