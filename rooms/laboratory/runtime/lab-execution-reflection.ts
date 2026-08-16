import type {
  LabExecutionPayloadPreview,
  LabExecutionPlan,
  LabExecutionReadiness,
  LabExecutionReflection,
  LabExecutionSimulation,
  LabInspectionMode,
  LabSelection,
} from "../domain/lab-types.js";
import { formatLabI18n, resolveLabI18n, type LabI18nKey, type LabI18nLocale } from "./lab-i18n.js";

type LabExecutionReflectionInput = {
  activeSelection: LabSelection;
  executionPayloadPreview: LabExecutionPayloadPreview;
  executionPlan: LabExecutionPlan;
  executionReadiness: LabExecutionReadiness;
  executionSimulation: LabExecutionSimulation;
  inspectionMode: LabInspectionMode;
  locale?: LabI18nLocale;
  sourceKind: string;
};

export type LabExecutionReflectionResolvedInput = {
  activeSelection: LabSelection | null;
  executionPayloadPreview: LabExecutionPayloadPreview | null;
  executionPlan: LabExecutionPlan | null;
  executionReadiness: LabExecutionReadiness | null;
  executionSimulation: LabExecutionSimulation | null;
  inspectionMode: LabInspectionMode;
  locale?: LabI18nLocale;
  sourceKind: string;
};
import {
  clampLabConfidence as clampConfidence,
  getLabSelectionDurationMs as getSelectionDurationMs,
  getLabSelectionRoiArea as getRoiArea,
  getLabSelectionRoiAspectRatio as getRoiAspectRatio,
  pushUniqueString as pushUnique,
} from "./lab-execution-metrics.js";

function createReflectionId(input: LabExecutionReflectionInput) {
  return `reflection:${input.executionPlan.id}`;
}

function getSimulationRisk(input: LabExecutionReflectionInput) {
  return input.executionSimulation.metrics?.risk ?? "low";
}

function getBaseConfidence(input: LabExecutionReflectionInput) {
  return (
    input.executionReadiness.confidence ??
    input.executionSimulation.metrics?.confidence ??
    input.executionPlan.confidence ??
    0.66
  );
}

function decide(input: LabExecutionReflectionInput): LabExecutionReflection["decision"] {
  const durationMs = getSelectionDurationMs(input.activeSelection);
  const roiArea = getRoiArea(input.activeSelection);
  const readinessBlockers = input.executionReadiness.blockers ?? [];
  const simulationRisk = getSimulationRisk(input);

  if (
    input.executionReadiness.status === "blocked" ||
    simulationRisk === "high" ||
    readinessBlockers.length > 0 ||
    (durationMs > 0 && durationMs < 200) ||
    (roiArea > 0 && roiArea < 0.01)
  ) {
    return "avoid";
  }

  if (
    input.executionReadiness.status === "needs-review" ||
    input.executionPayloadPreview.readinessPassesPreview === false ||
    input.executionPayloadPreview.readinessStatus === "needs-review" ||
    (input.executionSimulation.warnings?.length ?? 0) > 0 ||
    getBaseConfidence(input) < 0.68 ||
    (durationMs > 0 && durationMs < 500) ||
    (roiArea >= 0.01 && roiArea < 0.03) ||
    roiArea > 0.6
  ) {
    return "review";
  }

  return "proceed";
}

function formatRuntimeStatus(
  namespace: "readiness" | "simulationRisk",
  value: string,
  locale: LabI18nLocale
) {
  return resolveLabI18n(`status.${namespace}.${value}` as LabI18nKey, locale);
}

function buildSummary(decision: LabExecutionReflection["decision"], locale: LabI18nLocale) {
  if (decision === "proceed") {
    return resolveLabI18n("reflection.summary.proceed", locale);
  }
  if (decision === "review") {
    return resolveLabI18n("reflection.summary.review", locale);
  }
  return resolveLabI18n("reflection.summary.avoid", locale);
}

function buildReasoning(
  input: LabExecutionReflectionInput,
  decision: LabExecutionReflection["decision"],
  locale: LabI18nLocale
) {
  const reasoning: string[] = [];
  const durationMs = getSelectionDurationMs(input.activeSelection);
  const roiArea = getRoiArea(input.activeSelection);
  const roiAspectRatio = getRoiAspectRatio(input.activeSelection);
  const simulationRisk = getSimulationRisk(input);

  if (decision === "proceed") {
    pushUnique(reasoning, resolveLabI18n("reflection.reasoning.proceed", locale));
  }

  pushUnique(
    reasoning,
    input.executionPayloadPreview.readinessPassesPreview
      ? resolveLabI18n("reflection.reasoning.payloadPassing", locale)
      : resolveLabI18n("reflection.reasoning.payloadReview", locale)
  );

  if (input.executionReadiness.status !== "ready") {
    pushUnique(
      reasoning,
      formatLabI18n("reflection.reasoning.readinessStatus", locale, {
        status: formatRuntimeStatus("readiness", input.executionReadiness.status, locale),
      })
    );
  }

  for (const blocker of input.executionReadiness.blockers ?? []) {
    pushUnique(
      reasoning,
      formatLabI18n("reflection.reasoning.readinessBlocker", locale, { blocker })
    );
  }

  for (const note of input.executionReadiness.notes ?? []) {
    pushUnique(reasoning, formatLabI18n("reflection.reasoning.reviewNote", locale, { note }));
  }

  for (const warning of input.executionSimulation.warnings ?? []) {
    pushUnique(
      reasoning,
      formatLabI18n("reflection.reasoning.simulationWarning", locale, { warning })
    );
  }

  if (simulationRisk !== "low") {
    pushUnique(
      reasoning,
      formatLabI18n("reflection.reasoning.simulationRisk", locale, {
        risk: formatRuntimeStatus("simulationRisk", simulationRisk, locale),
      })
    );
  }

  if (durationMs > 0 && durationMs < 500) {
    pushUnique(reasoning, resolveLabI18n("reflection.reasoning.selectionTooNarrow", locale));
  } else if (durationMs > 10000) {
    pushUnique(reasoning, resolveLabI18n("reflection.reasoning.selectionBroad", locale));
  }

  if (roiArea > 0 && roiArea < 0.03) {
    pushUnique(reasoning, resolveLabI18n("reflection.reasoning.roiTight", locale));
  } else if (roiArea >= 0.03 && roiArea <= 0.6) {
    pushUnique(reasoning, resolveLabI18n("reflection.reasoning.roiSufficient", locale));
  } else if (roiArea > 0.6) {
    pushUnique(reasoning, resolveLabI18n("reflection.reasoning.roiBroad", locale));
  }

  if (roiAspectRatio !== null && Number.isFinite(roiAspectRatio) && roiAspectRatio > 3.5) {
    pushUnique(reasoning, resolveLabI18n("reflection.reasoning.roiExtreme", locale));
  }

  if (reasoning.length === 0) {
    pushUnique(reasoning, resolveLabI18n("reflection.reasoning.default", locale));
  }

  return reasoning;
}

function buildTradeoffs(
  input: LabExecutionReflectionInput,
  decision: LabExecutionReflection["decision"],
  locale: LabI18nLocale
) {
  const tradeoffs: string[] = [];
  const durationMs = getSelectionDurationMs(input.activeSelection);
  const roiArea = getRoiArea(input.activeSelection);
  const actionType = input.executionPlan.actionType;

  if (actionType === "inspect-audio") {
    pushUnique(tradeoffs, resolveLabI18n("reflection.tradeoff.inspect-audio", locale));
  } else if (actionType === "focus-region") {
    pushUnique(tradeoffs, resolveLabI18n("reflection.tradeoff.focus-region", locale));
  } else if (actionType === "inspect-motion") {
    pushUnique(tradeoffs, resolveLabI18n("reflection.tradeoff.inspect-motion", locale));
  } else if (actionType === "analyze-segment") {
    pushUnique(tradeoffs, resolveLabI18n("reflection.tradeoff.analyze-segment", locale));
  }

  if (durationMs > 10000) {
    pushUnique(tradeoffs, resolveLabI18n("reflection.tradeoff.wideSelection", locale));
  }

  if (roiArea > 0 && roiArea < 0.05) {
    pushUnique(tradeoffs, resolveLabI18n("reflection.tradeoff.smallRoi", locale));
  }

  if (decision === "proceed" && tradeoffs.length === 0) {
    pushUnique(tradeoffs, resolveLabI18n("reflection.tradeoff.stableAdvisory", locale));
  }

  return tradeoffs.length > 0 ? tradeoffs : undefined;
}

function buildAlternatives(
  input: LabExecutionReflectionInput,
  decision: LabExecutionReflection["decision"],
  locale: LabI18nLocale
) {
  if (decision === "proceed") {
    return undefined;
  }

  const alternatives: string[] = [];
  const durationMs = getSelectionDurationMs(input.activeSelection);
  const roiArea = getRoiArea(input.activeSelection);
  const textSignals = [
    ...(input.executionReadiness.notes ?? []),
    ...(input.executionReadiness.blockers ?? []),
    ...(input.executionSimulation.warnings ?? []),
  ].join(" ");

  if (durationMs > 0 && durationMs < 500) {
    pushUnique(alternatives, resolveLabI18n("reflection.alternative.expandSelection", locale));
  }
  if (durationMs > 10000) {
    pushUnique(alternatives, resolveLabI18n("reflection.alternative.narrowSelection", locale));
  }
  if (roiArea > 0 && (roiArea < 0.03 || roiArea > 0.6)) {
    pushUnique(alternatives, resolveLabI18n("reflection.alternative.refineRoi", locale));
  }
  if (/playback|motion/i.test(textSignals)) {
    pushUnique(alternatives, resolveLabI18n("reflection.alternative.reducePlayback", locale));
  }
  if (/gain|distort/i.test(textSignals)) {
    pushUnique(alternatives, resolveLabI18n("reflection.alternative.lowerGain", locale));
  }

  if (alternatives.length === 0) {
    pushUnique(alternatives, resolveLabI18n("reflection.alternative.reviewNotes", locale));
  }

  return alternatives;
}

function buildConfidence(
  input: LabExecutionReflectionInput,
  decision: LabExecutionReflection["decision"],
  reasoningCount: number
) {
  let confidence = getBaseConfidence(input);
  if (decision === "proceed") {
    confidence += 0.04;
  } else if (decision === "review") {
    confidence -= 0.05;
  } else {
    confidence -= 0.12;
  }
  confidence -= Math.min(0.08, Math.max(0, reasoningCount - 3) * 0.01);
  return clampConfidence(confidence);
}

export function buildExecutionReflection(
  input: LabExecutionReflectionInput
): LabExecutionReflection {
  const locale = input.locale ?? "en";
  const decision = decide(input);
  const reasoning = buildReasoning(input, decision, locale);
  const tradeoffs = buildTradeoffs(input, decision, locale);
  const alternatives = buildAlternatives(input, decision, locale);
  return {
    id: createReflectionId(input),
    planId: input.executionPlan.id,
    summary: buildSummary(decision, locale),
    decision,
    reasoning,
    ...(tradeoffs ? { tradeoffs } : {}),
    ...(alternatives ? { alternatives } : {}),
    confidence: buildConfidence(input, decision, reasoning.length),
  };
}

export function buildExecutionReflectionFromResolved(
  input: LabExecutionReflectionResolvedInput
): LabExecutionReflection | null {
  if (
    input.activeSelection === null ||
    input.executionPayloadPreview === null ||
    input.executionPlan === null ||
    input.executionReadiness === null ||
    input.executionSimulation === null ||
    input.activeSelection.endMs <= input.activeSelection.startMs
  ) {
    return null;
  }
  return buildExecutionReflection({
    activeSelection: input.activeSelection,
    executionPayloadPreview: input.executionPayloadPreview,
    executionPlan: input.executionPlan,
    executionReadiness: input.executionReadiness,
    executionSimulation: input.executionSimulation,
    inspectionMode: input.inspectionMode,
    locale: input.locale ?? "en",
    sourceKind: input.sourceKind,
  });
}
