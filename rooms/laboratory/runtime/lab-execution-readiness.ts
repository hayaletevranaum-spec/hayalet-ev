import type {
  LabAudioFocusSettings,
  LabExecutionPlan,
  LabExecutionReadiness,
  LabExecutionSimulation,
  LabInspectionMode,
  LabSelection,
} from "../domain/lab-types.js";
import {
  clampLabConfidence as clampConfidence,
  getLabSelectionDurationMs as getSelectionDurationMs,
  getLabSelectionRoiArea as getRoiArea,
  getLabSelectionRoiAspectRatio as getRoiAspectRatio,
  pushUniqueString as pushUnique,
} from "./lab-execution-metrics.js";

type LabExecutionReadinessInput = {
  activeSelection: LabSelection;
  audioFocus?: LabAudioFocusSettings | null;
  executionPlan: LabExecutionPlan;
  executionSimulation: LabExecutionSimulation;
  inspectionMode: LabInspectionMode;
  sourceKind: string;
};

function createReadinessId(input: LabExecutionReadinessInput) {
  return `readiness:${input.executionPlan.id}`;
}

function getActionType(input: LabExecutionReadinessInput) {
  return input.executionPlan.actionType || "unknown-action";
}

function isAudioCapableSource(sourceKind: string) {
  return sourceKind === "audio" || sourceKind === "video";
}

function isVisualSource(sourceKind: string) {
  return sourceKind === "image" || sourceKind === "video";
}

function buildConfidence(
  input: LabExecutionReadinessInput,
  status: LabExecutionReadiness["status"],
  blockers: string[],
  notes: string[]
) {
  let confidence =
    input.executionSimulation.metrics?.confidence ?? input.executionPlan.confidence ?? 0.66;

  if (status === "ready") {
    confidence += 0.03;
  } else if (status === "needs-review") {
    confidence -= 0.08;
  } else {
    confidence -= 0.18;
  }

  confidence -= Math.min(0.12, blockers.length * 0.04);
  confidence -= Math.min(0.1, notes.length * 0.02);

  return clampConfidence(confidence);
}

export function buildExecutionReadiness(input: LabExecutionReadinessInput): LabExecutionReadiness {
  const blockers: string[] = [];
  const notes: string[] = [];
  const actionType = getActionType(input);
  const durationMs = getSelectionDurationMs(input.activeSelection);
  const roiArea = getRoiArea(input.activeSelection);
  const roiAspectRatio = getRoiAspectRatio(input.activeSelection);
  const playbackRate = input.audioFocus?.playbackRate ?? 1;
  const gain = input.audioFocus?.gain ?? 1;
  const simulationRisk = input.executionSimulation.metrics?.risk ?? "low";
  const simulationConfidence =
    input.executionSimulation.metrics?.confidence ?? input.executionPlan.confidence ?? 0.66;

  if (durationMs <= 0) {
    pushUnique(blockers, "A valid selection window is required before this path can be assessed.");
  }

  if (durationMs > 15000) {
    pushUnique(notes, "A wider selection may dilute precision across the forecast.");
  }

  if (roiArea > 0 && roiArea < 0.01) {
    pushUnique(
      blockers,
      "The active region is too small to support a stable readiness assessment."
    );
  } else if (roiArea >= 0.01 && roiArea < 0.03) {
    pushUnique(notes, "The active region is very tight and may need a wider comparison view.");
  } else if (roiArea > 0.6) {
    pushUnique(notes, "The active region is broad enough that it may dilute focal detail.");
  }

  if (roiAspectRatio !== null && roiAspectRatio > 3.5 && Number.isFinite(roiAspectRatio)) {
    pushUnique(
      notes,
      "The region framing is unusually narrow and should be reviewed for context balance."
    );
  }

  if (simulationRisk === "high") {
    pushUnique(
      blockers,
      "The current simulation forecast still carries high risk for a stable execution-ready path."
    );
  } else if (simulationRisk === "medium") {
    pushUnique(
      notes,
      "The simulation forecast still carries moderate risk and should be reviewed."
    );
  }

  if (simulationConfidence < 0.4) {
    pushUnique(notes, "Forecast confidence is still low enough to merit review.");
  }

  for (const warning of input.executionSimulation.warnings ?? []) {
    pushUnique(notes, warning);
  }

  switch (actionType) {
    case "inspect-audio":
      if (!isAudioCapableSource(input.sourceKind)) {
        pushUnique(
          blockers,
          "Audio-focused review is not well aligned with the current source context."
        );
      }
      if (gain > 2.5) {
        pushUnique(
          blockers,
          "Preview gain is extreme enough that the path should not yet be treated as execution-ready."
        );
      } else if (gain > 2) {
        pushUnique(
          notes,
          "High preview gain should be reviewed before carrying this path forward."
        );
      }
      break;
    case "focus-region":
      if (!isVisualSource(input.sourceKind)) {
        pushUnique(
          blockers,
          "Region-focused review needs an image or video source to remain meaningful."
        );
      }
      if (input.activeSelection.roi === undefined) {
        pushUnique(
          blockers,
          "A defined region is still needed before this path can look execution-ready."
        );
      }
      break;
    case "inspect-motion":
      if (input.sourceKind !== "video") {
        pushUnique(
          blockers,
          "Motion inspection needs video timing context before it can look execution-ready."
        );
      }
      if (playbackRate > 2.4) {
        pushUnique(blockers, "Preview transport is too aggressive to keep motion review stable.");
      } else if (playbackRate > 1.75) {
        pushUnique(
          notes,
          "Fast preview transport should be reviewed before carrying a motion-focused path forward."
        );
      }
      break;
    case "enhance-visual":
    case "stabilize-segment":
      if (!isVisualSource(input.sourceKind)) {
        pushUnique(
          blockers,
          "This visual path is not well aligned with the current source context."
        );
      }
      break;
    case "analyze-segment":
      if (durationMs > 0 && durationMs < 200) {
        pushUnique(blockers, "This segment window is too short to keep anomaly review stable.");
      } else if (durationMs >= 200 && durationMs < 500) {
        pushUnique(
          notes,
          "This segment window is short enough that the analysis path should be reviewed first."
        );
      }
      if (input.inspectionMode === "motion" && input.sourceKind !== "video") {
        pushUnique(
          notes,
          "Motion-oriented inspection mode is less informative without video timing context."
        );
      }
      break;
    default:
      break;
  }

  const status: LabExecutionReadiness["status"] =
    blockers.length > 0
      ? "blocked"
      : notes.length > 0 || simulationRisk === "medium" || simulationConfidence < 0.65
        ? "needs-review"
        : "ready";
  const confidence = buildConfidence(input, status, blockers, notes);
  const summary =
    status === "ready"
      ? "This looks ready to carry forward as a preview-only execution candidate."
      : status === "needs-review"
        ? "This should be reviewed before any execution step."
        : "This is not yet in a safe execution-ready state.";

  return {
    id: createReadinessId(input),
    planId: input.executionPlan.id,
    status,
    summary,
    confidence,
    ...(blockers.length > 0 ? { blockers } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
}
