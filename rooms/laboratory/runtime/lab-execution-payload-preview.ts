import type {
  LabExecutionPayloadPreview,
  LabExecutionPlan,
  LabExecutionReadiness,
  LabExecutionSimulation,
  LabInspectionMode,
  LabSelection,
} from "../domain/lab-types.js";
import {
  getLabRoiArea as getRoiArea,
  getLabSelectionDurationMs as getSelectionDurationMs,
} from "./lab-execution-metrics.js";

type LabExecutionPayloadPreviewInput = {
  activeSelection: LabSelection;
  executionPlan: LabExecutionPlan;
  executionReadiness: LabExecutionReadiness;
  executionSimulation: LabExecutionSimulation;
  inspectionMode: LabInspectionMode;
  sourceKind: string;
};

export type LabExecutionPayloadPreviewResolvedInput = {
  activeSelection: LabSelection | null;
  executionPlan: LabExecutionPlan | null;
  executionReadiness: LabExecutionReadiness | null;
  executionSimulation: LabExecutionSimulation | null;
  inspectionMode: LabInspectionMode;
  sourceKind: string;
};

function formatDurationBucket(durationMs: number) {
  if (durationMs < 500) {
    return "short";
  }
  if (durationMs > 10000) {
    return "wide";
  }
  return "focused";
}

function createPayloadId(input: LabExecutionPayloadPreviewInput) {
  return `payload:${input.executionPlan.id}`;
}

function createSelectionInput(input: LabExecutionPayloadPreviewInput): Record<string, unknown> {
  const roi = input.activeSelection.roi;
  return {
    endMs: input.activeSelection.endMs,
    inspectionMode: input.inspectionMode,
    sourceKind: input.sourceKind || "unknown",
    startMs: input.activeSelection.startMs,
    ...(roi
      ? {
          roi: {
            height: Number(roi.height.toFixed(4)),
            width: Number(roi.width.toFixed(4)),
            x: Number(roi.x.toFixed(4)),
            y: Number(roi.y.toFixed(4)),
          },
        }
      : {}),
  };
}

function getReadinessParameter(input: LabExecutionPayloadPreviewInput) {
  return input.executionReadiness.status === "ready"
    ? "standard"
    : input.executionReadiness.status === "needs-review"
      ? "review-biased"
      : "conservative";
}

function getSimulationRisk(input: LabExecutionPayloadPreviewInput) {
  return input.executionSimulation.metrics?.risk ?? "low";
}

function createBaseNotes(input: LabExecutionPayloadPreviewInput, extraNotes: string[] = []) {
  const notes: string[] = [];
  notes.push(`Readiness signal: ${input.executionReadiness.status}.`);
  for (const blocker of input.executionReadiness.blockers ?? []) {
    notes.push(`Readiness blocker: ${blocker}`);
  }
  for (const note of input.executionReadiness.notes ?? []) {
    notes.push(`Review note: ${note}`);
  }
  for (const warning of input.executionSimulation.warnings ?? []) {
    notes.push(`Simulation warning: ${warning}`);
  }
  for (const note of extraNotes) {
    notes.push(note);
  }
  return notes.length > 0 ? notes : undefined;
}

function createPayloadPreview(
  input: LabExecutionPayloadPreviewInput,
  summary: string,
  previewInput: Record<string, unknown>,
  previewParameters: Record<string, unknown>,
  previewExpectedOutputs: string[],
  extraNotes: string[] = []
): LabExecutionPayloadPreview {
  const notes = createBaseNotes(input, extraNotes);
  return {
    id: createPayloadId(input),
    planId: input.executionPlan.id,
    actionType: input.executionPlan.actionType || "unknown-action",
    summary,
    dryRunShape: {
      previewInput,
      previewParameters,
      previewExpectedOutputs,
    },
    readinessStatus: input.executionReadiness.status,
    readinessPassesPreview: input.executionReadiness.status === "ready",
    ...(notes ? { notes } : {}),
  };
}

function buildAnalyzeSegmentPayload(
  input: LabExecutionPayloadPreviewInput
): LabExecutionPayloadPreview {
  const durationMs = getSelectionDurationMs(input.activeSelection);
  const durationBucket = formatDurationBucket(durationMs);
  return createPayloadPreview(
    input,
    "The dry-run bridge would package the active segment as a pattern review candidate.",
    createSelectionInput(input),
    {
      sensitivity:
        input.executionReadiness.status === "ready" && durationBucket === "focused"
          ? "balanced"
          : "conservative",
      windowSizeMs: durationMs < 1000 ? 250 : durationMs > 10000 ? 1000 : 500,
      riskProfile: getSimulationRisk(input),
      reviewMode: getReadinessParameter(input),
    },
    ["patternMarkers", "anomalyFlags", "confidenceSummary"]
  );
}

function buildInspectAudioPayload(
  input: LabExecutionPayloadPreviewInput
): LabExecutionPayloadPreview {
  return createPayloadPreview(
    input,
    "The dry-run bridge would describe the selected audio window as a spectral inspection candidate.",
    {
      audioWindow: createSelectionInput(input),
    },
    {
      bandFocus: input.sourceKind === "audio" ? "full-spectrum" : "embedded-audio",
      transientScan: "enabled",
      riskProfile: getSimulationRisk(input),
      reviewMode: getReadinessParameter(input),
    },
    ["frequencyClusters", "transientPeaks", "noiseFloorEstimate"]
  );
}

function buildExtractClipPayload(
  input: LabExecutionPayloadPreviewInput
): LabExecutionPayloadPreview {
  return createPayloadPreview(
    input,
    "The dry-run bridge would frame the selected range as a clip-like handoff candidate.",
    {
      clipWindow: createSelectionInput(input),
    },
    {
      boundaryMode: "selection-range",
      packageMode: "preview-only",
      reviewMode: getReadinessParameter(input),
    },
    ["clipTiming", "segmentMetadata"],
    ["This preview does not create an asset or prepare an export job."]
  );
}

function buildFocusRegionPayload(
  input: LabExecutionPayloadPreviewInput
): LabExecutionPayloadPreview {
  const roi = input.activeSelection.roi;
  const roiArea = getRoiArea(roi);
  return createPayloadPreview(
    input,
    roi
      ? "The dry-run bridge would package the selected region as a focused visual candidate."
      : "The dry-run bridge would keep this as a segment-level visual candidate until a region exists.",
    createSelectionInput(input),
    {
      detailPass: roi ? "region-local" : "segment-wide",
      reviewMode: getReadinessParameter(input),
      zoomLevel: roiArea > 0 && roiArea < 0.12 ? "close" : "balanced",
    },
    ["regionDetails", "clarityNotes"],
    roi ? [] : ["No active ROI is available, so the dry-run shape remains segment-scoped."]
  );
}

function buildInspectMotionPayload(
  input: LabExecutionPayloadPreviewInput
): LabExecutionPayloadPreview {
  return createPayloadPreview(
    input,
    "The dry-run bridge would package the selected time window for local motion comparison.",
    {
      motionWindow: createSelectionInput(input),
    },
    {
      motionSensitivity: input.inspectionMode === "motion" ? "focused" : "balanced",
      referenceFrameMode: input.activeSelection.roi ? "roi-anchored" : "full-frame",
      reviewMode: getReadinessParameter(input),
    },
    ["motionVectors", "continuityNotes"]
  );
}

function buildVisualPayload(
  input: LabExecutionPayloadPreviewInput,
  mode: "enhance" | "stabilize"
): LabExecutionPayloadPreview {
  return createPayloadPreview(
    input,
    mode === "enhance"
      ? "The dry-run bridge would package the visual area for clarity-oriented review."
      : "The dry-run bridge would package the selected span for stability-oriented review.",
    createSelectionInput(input),
    {
      detailPass: mode === "enhance" ? "clarity" : "stability",
      referenceScope: input.activeSelection.roi ? "roi" : "frame",
      reviewMode: getReadinessParameter(input),
    },
    mode === "enhance" ? ["clarityDeltas", "edgeDetailNotes"] : ["stabilityMarkers", "jitterNotes"]
  );
}

function buildFallbackPayload(input: LabExecutionPayloadPreviewInput): LabExecutionPayloadPreview {
  return createPayloadPreview(
    input,
    "The dry-run bridge would package the current selection as a generic review candidate.",
    createSelectionInput(input),
    {
      reviewMode: getReadinessParameter(input),
      scope: input.activeSelection.roi ? "time-and-region" : "time-range",
    },
    ["generalObservations", "limitedConfidenceNotes"],
    ["The action type is not recognized by the preview bridge, so this shape stays generic."]
  );
}

export function buildExecutionPayloadPreview(
  input: LabExecutionPayloadPreviewInput
): LabExecutionPayloadPreview {
  switch (input.executionPlan.actionType) {
    case "analyze-segment":
      return buildAnalyzeSegmentPayload(input);
    case "inspect-audio":
    case "clean-audio":
    case "separate-stems":
      return buildInspectAudioPayload(input);
    case "extract-clip":
      return buildExtractClipPayload(input);
    case "focus-region":
    case "crop-region":
    case "ocr-region":
    case "detect-objects":
      return buildFocusRegionPayload(input);
    case "inspect-motion":
      return buildInspectMotionPayload(input);
    case "enhance-visual":
    case "enhance-frame":
      return buildVisualPayload(input, "enhance");
    case "stabilize-segment":
      return buildVisualPayload(input, "stabilize");
    case "metadata-audit":
    case "detect-scenes":
      return buildAnalyzeSegmentPayload(input);
    default:
      return buildFallbackPayload(input);
  }
}

export function buildExecutionPayloadPreviewFromResolved(
  input: LabExecutionPayloadPreviewResolvedInput
): LabExecutionPayloadPreview | null {
  if (
    input.activeSelection === null ||
    input.executionPlan === null ||
    input.executionReadiness === null ||
    input.executionSimulation === null ||
    input.activeSelection.endMs <= input.activeSelection.startMs
  ) {
    return null;
  }
  return buildExecutionPayloadPreview({
    activeSelection: input.activeSelection,
    executionPlan: input.executionPlan,
    executionReadiness: input.executionReadiness,
    executionSimulation: input.executionSimulation,
    inspectionMode: input.inspectionMode,
    sourceKind: input.sourceKind,
  });
}
