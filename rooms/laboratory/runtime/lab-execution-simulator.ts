import type {
  LabAudioFocusSettings,
  LabExecutionPlan,
  LabExecutionSimulation,
  LabInspectionMode,
  LabSelection,
} from "../domain/lab-types.js";
import {
  clampLabConfidence,
  getLabSelectionDurationMs as getSelectionDurationMs,
  getLabSelectionRoiArea as getRoiArea,
} from "./lab-execution-metrics.js";

type LabExecutionSimulationInput = {
  activeSelection: LabSelection;
  audioFocus?: LabAudioFocusSettings | null;
  executionPlan: LabExecutionPlan;
  inspectionMode: LabInspectionMode;
  sourceKind: string;
};

function createSimulationId(input: LabExecutionSimulationInput) {
  return `simulation:${input.executionPlan.id}`;
}

function getActionType(input: LabExecutionSimulationInput) {
  return input.executionPlan.actionType || "unknown-action";
}

function buildConfidence(input: LabExecutionSimulationInput) {
  let confidence = input.executionPlan.confidence ?? 0.68;
  const selectionDurationMs = getSelectionDurationMs(input.activeSelection);
  const roiArea = getRoiArea(input.activeSelection);
  const playbackRate = input.audioFocus?.playbackRate ?? 1;
  const gain = input.audioFocus?.gain ?? 1;
  const actionType = getActionType(input);

  if (selectionDurationMs > 0 && selectionDurationMs < 500) {
    confidence -= 0.08;
  }
  if (selectionDurationMs > 10000) {
    confidence -= 0.05;
  }
  if (roiArea > 0 && roiArea < 0.05) {
    confidence -= 0.07;
  }
  if (roiArea >= 0.08 && roiArea <= 0.45 && actionType === "focus-region") {
    confidence += 0.03;
  }
  if (playbackRate > 1.5 && actionType === "inspect-motion") {
    confidence -= 0.06;
  }
  if (gain > 1.5 && actionType === "inspect-audio") {
    confidence -= 0.04;
  }

  return clampLabConfidence(confidence, 0.3);
}

function buildWarnings(input: LabExecutionSimulationInput, actionType: string) {
  const warnings: string[] = [];
  const selectionDurationMs = getSelectionDurationMs(input.activeSelection);
  const roiArea = getRoiArea(input.activeSelection);
  const playbackRate = input.audioFocus?.playbackRate ?? 1;
  const gain = input.audioFocus?.gain ?? 1;
  const filterType = input.audioFocus?.filterType ?? "none";
  const filterFrequency = input.audioFocus?.filterFrequency ?? 1000;

  if (selectionDurationMs > 10000) {
    warnings.push("Wide selections would likely reduce precision across the observed outcome.");
  }
  if (selectionDurationMs > 0 && selectionDurationMs < 500) {
    warnings.push("Short selections may leave too little context for a confident forecast.");
  }
  if (roiArea > 0 && roiArea < 0.05) {
    warnings.push("A very small region would likely limit context around the observed result.");
  }
  if (roiArea > 0.6) {
    warnings.push("A very large region would likely dilute the focal detail of the outcome.");
  }

  if (actionType === "inspect-audio" && gain > 1.5) {
    warnings.push(
      "High preview gain could make the observed outcome feel harsher or more distorted."
    );
  }
  if (actionType === "inspect-motion" && playbackRate > 1.5) {
    warnings.push("Fast playback would make motion ambiguity more noticeable in the forecast.");
  }
  if (actionType === "focus-region" && input.activeSelection.roi === undefined) {
    warnings.push(
      "Without an active region, the simulated outcome stays segment-scoped rather than spatially focused."
    );
  }
  if (actionType === "inspect-audio" && filterType === "lowpass" && filterFrequency < 500) {
    warnings.push("A low cutoff would suppress high-frequency detail in the observed outcome.");
  }

  return warnings.length > 0 ? warnings : undefined;
}

function buildMetrics(
  input: LabExecutionSimulationInput,
  actionType: string,
  warnings: string[] | undefined
): NonNullable<LabExecutionSimulation["metrics"]> | undefined {
  const roiArea = getRoiArea(input.activeSelection);
  const playbackRate = input.audioFocus?.playbackRate ?? 1;
  const gain = input.audioFocus?.gain ?? 1;
  const warningCount = warnings?.length ?? 0;

  let intensity: "low" | "medium" | "high" = "medium";
  if (actionType === "extract-clip") {
    intensity = "low";
  } else if (actionType === "inspect-motion" || actionType === "analyze-segment") {
    intensity = "high";
  } else if (actionType === "focus-region" && roiArea > 0 && roiArea < 0.2) {
    intensity = "high";
  }

  let risk: "low" | "medium" | "high" = "low";
  if (warningCount > 0) {
    risk = "medium";
  }
  if (
    (actionType === "inspect-audio" && gain > 1.5) ||
    (actionType === "inspect-motion" && playbackRate > 1.5)
  ) {
    risk = "high";
  }

  return {
    intensity,
    risk,
    confidence: buildConfidence(input),
  };
}

function createSimulation(
  input: LabExecutionSimulationInput,
  summary: string,
  predictedEffects: string[]
): LabExecutionSimulation {
  const actionType = getActionType(input);
  const warnings = buildWarnings(input, actionType);
  const metrics = buildMetrics(input, actionType, warnings);
  return {
    id: createSimulationId(input),
    planId: input.executionPlan.id,
    summary,
    predictedEffects,
    ...(warnings ? { warnings } : {}),
    ...(metrics ? { metrics } : {}),
  };
}

export function buildExecutionSimulation(
  input: LabExecutionSimulationInput
): LabExecutionSimulation {
  const actionType = getActionType(input);
  const selectionDurationMs = getSelectionDurationMs(input.activeSelection);
  const durationLabel =
    selectionDurationMs <= 0
      ? "the current selection"
      : selectionDurationMs < 1000
        ? `${selectionDurationMs}ms`
        : `${(selectionDurationMs / 1000).toFixed(1)}s`;
  const hasRoi = input.activeSelection.roi !== undefined;
  const playbackRate = input.audioFocus?.playbackRate ?? 1;
  const filterType = input.audioFocus?.filterType ?? "none";
  const filterFrequency = input.audioFocus?.filterFrequency ?? 1000;

  switch (actionType) {
    case "analyze-segment":
      return createSimulation(
        input,
        `If applied, the system would surface a denser read of patterns inside ${durationLabel}.`,
        [
          "Temporal markers would become easier to compare across the selected span.",
          "Low-frequency irregularities would likely stand out more clearly in the observed outcome.",
          playbackRate < 0.75
            ? "Slower preview transport would make small timing anomalies easier to notice."
            : "The current preview transport would preserve the segment's overall motion rhythm.",
        ]
      );
    case "inspect-audio":
      return createSimulation(
        input,
        "If applied, the preview would emphasize how the active audio window separates into spectral and transient behavior.",
        [
          "Frequency bands would read as more distinct across the selected window.",
          "Transient points would appear more pronounced against the surrounding signal bed.",
          filterType === "lowpass" && filterFrequency < 1200
            ? "High-frequency detail would feel more subdued than the raw preview."
            : "Noise floor and tonal balance would remain easier to compare than the raw preview alone.",
        ]
      );
    case "extract-clip":
      return createSimulation(
        input,
        "If applied, the selected window would behave like a self-contained excerpt for review.",
        [
          "The chosen range would read as a tighter narrative unit than the full source.",
          "Boundary timing would become the main factor shaping the observed outcome.",
          "Follow-up review would likely concentrate on entry and exit continuity.",
        ]
      );
    case "focus-region":
      return createSimulation(
        input,
        hasRoi
          ? "If applied, the selected region would dominate the visual inspection surface."
          : "If applied, the outcome would stay anchored to the current segment until a region is defined.",
        [
          hasRoi
            ? "Detail density would appear higher inside the chosen region than in the surrounding frame."
            : "The simulated outcome would remain centered on the full visible frame.",
          "Peripheral visual noise would feel less influential than it does in the unfocused preview.",
          "Edge and contrast relationships would become easier to compare across repeated looks.",
        ]
      );
    case "inspect-motion":
      return createSimulation(
        input,
        "If applied, the observed outcome would make local movement direction and continuity easier to judge.",
        [
          "Frame-to-frame drift would be easier to compare across the active window.",
          hasRoi
            ? "The selected region would anchor movement reading around the most relevant subject area."
            : "Motion reading would stay distributed across the full visible subject area.",
          playbackRate > 1.5
            ? "Fast transport would exaggerate motion ambiguity in the observed result."
            : "Playback cadence would preserve movement transitions closely enough for comparison.",
        ]
      );
    case "enhance-visual":
      return createSimulation(
        input,
        "If applied, the preview would bias toward clarity and edge readability rather than raw scene balance.",
        [
          "Fine structure inside the active view would appear more legible than in the base preview.",
          hasRoi
            ? "Clarity gains would feel strongest inside the selected region."
            : "Clarity gains would be spread across the full visible frame.",
          "Contrast edges would become easier to compare against the source view.",
        ]
      );
    case "stabilize-segment":
      return createSimulation(
        input,
        "If applied, the selected window would read as more stable and easier to inspect for motion consistency.",
        [
          "Relative frame drift would appear reduced across the inspected span.",
          hasRoi
            ? "Stability would feel anchored around the selected region rather than the whole frame."
            : "Stability would be estimated from the full visible frame context.",
          "Jitter-like movement would be easier to distinguish from intentional motion.",
        ]
      );
    default:
      return createSimulation(
        input,
        "If applied, the system would produce a conservative review outcome around the current selection.",
        [
          "The selected range would receive a general-purpose inspection pass.",
          "Observed changes would likely stay broad rather than tool-specific.",
          "Any conclusions would remain limited to a cautious preview forecast.",
        ]
      );
  }
}
