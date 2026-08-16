import type {
  LabActiveExecutionResult,
  LabExecutionAlternative,
  LabExecutionAlternatives,
  LabExecutionDecisionPressure,
  LabExecutionGoalEvaluation,
  LabExecutionPlan,
  LabExecutionReadiness,
  LabExecutionReflection,
  LabExecutionSimulation,
  LabInspectionMode,
  LabSelection,
} from "../domain/lab-types.js";
import {
  buildAdaptiveDecisionSignal,
  buildCounterfactualProjection,
  buildDecisionPosture,
  buildGuidedAlternativeSignal,
  prependDecisionPostureLabel,
  type LabDecisionPostureSignal,
  type LabGuidedAlternativeSignal,
} from "./lab-adaptive-decision.js";
import {
  buildExecutionDescriptor,
  formatExecutionDescriptorAdvisory,
} from "./lab-execution-descriptor.js";
import { buildExecutionBridge, formatExecutionBridgeAdvisory } from "./lab-execution-bridge.js";
import {
  buildDecisionCoherence,
  formatDecisionCoherenceAdvisory,
} from "./lab-decision-coherence.js";
import {
  buildExecutionReadinessSignal,
  formatExecutionReadinessSignalAdvisory,
} from "./lab-execution-readiness-signal.js";
import { formatLabI18n, resolveLabI18n, type LabI18nLocale } from "./lab-i18n.js";
import {
  clampLabConfidence as clampConfidence,
  getLabSelectionDurationMs as getSelectionDurationMs,
} from "./lab-execution-metrics.js";

export type LabExecutionAlternativesResultInterpretation = {
  coverageLevel: "low" | "medium" | "high";
  anomalyLevel: "none" | "moderate" | "high";
  alignment: "matches-simulation" | "partial" | "deviates";
};

type LabExecutionAlternativesInput = {
  activeSelection: LabSelection;
  executionPlan: LabExecutionPlan;
  executionReadiness: LabExecutionReadiness;
  executionReflection: LabExecutionReflection;
  executionResult?: LabActiveExecutionResult | null;
  executionGoalEvaluation?: LabExecutionGoalEvaluation | null;
  executionResultInterpretation?: LabExecutionAlternativesResultInterpretation | null;
  executionSimulation: LabExecutionSimulation;
  inspectionMode: LabInspectionMode;
  locale?: LabI18nLocale;
  sourceKind: string;
};

export type LabExecutionAlternativesResolvedInput = {
  activeSelection: LabSelection | null;
  executionPlan: LabExecutionPlan | null;
  executionReadiness: LabExecutionReadiness | null;
  executionReflection: LabExecutionReflection | null;
  executionResult?: LabActiveExecutionResult | null;
  executionGoalEvaluation?: LabExecutionGoalEvaluation | null;
  executionResultInterpretation?: LabExecutionAlternativesResultInterpretation | null;
  executionSimulation: LabExecutionSimulation | null;
  inspectionMode: LabInspectionMode;
  locale?: LabI18nLocale;
  sourceKind: string;
};

function createAlternativesId(input: LabExecutionAlternativesInput) {
  return `alternatives:${input.executionPlan.id}`;
}

function isAudioOriented(input: LabExecutionAlternativesInput) {
  return (
    input.sourceKind === "audio" ||
    input.inspectionMode === "audio" ||
    input.executionPlan.actionType === "inspect-audio"
  );
}

function isVideoOriented(input: LabExecutionAlternativesInput) {
  return (
    input.sourceKind === "video" ||
    input.inspectionMode === "motion" ||
    input.executionPlan.actionType === "inspect-motion"
  );
}

function isVisualOriented(input: LabExecutionAlternativesInput) {
  return (
    input.sourceKind === "image" ||
    input.sourceKind === "video" ||
    input.inspectionMode === "visual" ||
    input.executionPlan.actionType === "focus-region" ||
    input.executionPlan.actionType === "enhance-visual"
  );
}

function pushAlternative(target: LabExecutionAlternative[], alternative: LabExecutionAlternative) {
  if (
    target.some(function (entry) {
      return entry.actionType === alternative.actionType && entry.label === alternative.label;
    })
  ) {
    return;
  }
  target.push(alternative);
}

function capAlternatives(alternatives: LabExecutionAlternative[]) {
  return alternatives.slice(0, 3);
}

function broadSegmentAlternative(locale: LabI18nLocale): LabExecutionAlternative {
  return {
    actionType: "analyze-segment",
    label: resolveLabI18n("alternatives.item.broadSegment.label", locale),
    summary: resolveLabI18n("alternatives.item.broadSegment.summary", locale),
    tradeoff: resolveLabI18n("alternatives.item.broadSegment.tradeoff", locale),
    relativeAdvantage: "higher-coverage",
  };
}

function focusedRegionAlternative(hasRoi: boolean, locale: LabI18nLocale): LabExecutionAlternative {
  return {
    actionType: "focus-region",
    label: hasRoi
      ? resolveLabI18n("alternatives.item.focusedRegion.label.withRoi", locale)
      : resolveLabI18n("alternatives.item.focusedRegion.label.withoutRoi", locale),
    summary: hasRoi
      ? resolveLabI18n("alternatives.item.focusedRegion.summary.withRoi", locale)
      : resolveLabI18n("alternatives.item.focusedRegion.summary.withoutRoi", locale),
    tradeoff: resolveLabI18n("alternatives.item.focusedRegion.tradeoff", locale),
    relativeAdvantage: "higher-precision",
  };
}

function audioInspectionAlternative(locale: LabI18nLocale): LabExecutionAlternative {
  return {
    actionType: "inspect-audio",
    label: resolveLabI18n("alternatives.item.audioInspection.label", locale),
    summary: resolveLabI18n("alternatives.item.audioInspection.summary", locale),
    tradeoff: resolveLabI18n("alternatives.item.audioInspection.tradeoff", locale),
    relativeAdvantage: "higher-precision",
  };
}

function narrowedInspectionAlternative(locale: LabI18nLocale): LabExecutionAlternative {
  return {
    actionType: "narrowed-inspection",
    label: resolveLabI18n("alternatives.item.narrowedInspection.label", locale),
    summary: resolveLabI18n("alternatives.item.narrowedInspection.summary", locale),
    tradeoff: resolveLabI18n("alternatives.item.narrowedInspection.tradeoff", locale),
    relativeAdvantage: "higher-precision",
  };
}

function slowerPlaybackAlternative(locale: LabI18nLocale): LabExecutionAlternative {
  return {
    actionType: "slow-playback-inspection",
    label: resolveLabI18n("alternatives.item.slowerPlayback.label", locale),
    summary: resolveLabI18n("alternatives.item.slowerPlayback.summary", locale),
    tradeoff: resolveLabI18n("alternatives.item.slowerPlayback.tradeoff", locale),
    relativeAdvantage: "more-stable",
  };
}

function motionInspectionAlternative(locale: LabI18nLocale): LabExecutionAlternative {
  return {
    actionType: "inspect-motion",
    label: resolveLabI18n("alternatives.item.motionInspection.label", locale),
    summary: resolveLabI18n("alternatives.item.motionInspection.summary", locale),
    tradeoff: resolveLabI18n("alternatives.item.motionInspection.tradeoff", locale),
    relativeAdvantage: "more-stable",
  };
}

function visualClarityAlternative(locale: LabI18nLocale): LabExecutionAlternative {
  return {
    actionType: "enhance-visual",
    label: resolveLabI18n("alternatives.item.visualClarity.label", locale),
    summary: resolveLabI18n("alternatives.item.visualClarity.summary", locale),
    tradeoff: resolveLabI18n("alternatives.item.visualClarity.tradeoff", locale),
    relativeAdvantage: "higher-precision",
  };
}

function stabilizationAlternative(locale: LabI18nLocale): LabExecutionAlternative {
  return {
    actionType: "stabilize-segment",
    label: resolveLabI18n("alternatives.item.stabilization.label", locale),
    summary: resolveLabI18n("alternatives.item.stabilization.summary", locale),
    tradeoff: resolveLabI18n("alternatives.item.stabilization.tradeoff", locale),
    relativeAdvantage: "more-stable",
  };
}

function semanticReviewAlternative(locale: LabI18nLocale): LabExecutionAlternative {
  return {
    actionType: "analyze-segment",
    label: resolveLabI18n("alternatives.item.semanticReview.label", locale),
    summary: resolveLabI18n("alternatives.item.semanticReview.summary", locale),
    tradeoff: resolveLabI18n("alternatives.item.semanticReview.tradeoff", locale),
    relativeAdvantage: "lower-risk",
  };
}

function genericNarrowAlternative(locale: LabI18nLocale): LabExecutionAlternative {
  return {
    actionType: "generic-narrowed-inspection",
    label: resolveLabI18n("alternatives.item.genericNarrow.label", locale),
    summary: resolveLabI18n("alternatives.item.genericNarrow.summary", locale),
    tradeoff: resolveLabI18n("alternatives.item.genericNarrow.tradeoff", locale),
    relativeAdvantage: "higher-precision",
  };
}

function buildAnalyzeSegmentAlternatives(
  input: LabExecutionAlternativesInput,
  locale: LabI18nLocale
) {
  const alternatives: LabExecutionAlternative[] = [];
  const durationMs = getSelectionDurationMs(input.activeSelection);
  const hasRoi = input.activeSelection.roi !== undefined;

  if (hasRoi) {
    pushAlternative(alternatives, focusedRegionAlternative(true, locale));
  }
  if (isAudioOriented(input)) {
    pushAlternative(alternatives, audioInspectionAlternative(locale));
  }
  if (durationMs > 10000 || alternatives.length === 0) {
    pushAlternative(alternatives, narrowedInspectionAlternative(locale));
  }

  return capAlternatives(alternatives);
}

function buildFocusRegionAlternatives(input: LabExecutionAlternativesInput, locale: LabI18nLocale) {
  const alternatives: LabExecutionAlternative[] = [];

  pushAlternative(alternatives, broadSegmentAlternative(locale));
  if (isVideoOriented(input)) {
    pushAlternative(alternatives, motionInspectionAlternative(locale));
  }
  if (isVisualOriented(input)) {
    pushAlternative(alternatives, visualClarityAlternative(locale));
  }

  return capAlternatives(alternatives);
}

function buildInspectAudioAlternatives(
  input: LabExecutionAlternativesInput,
  locale: LabI18nLocale
) {
  const alternatives: LabExecutionAlternative[] = [];

  pushAlternative(alternatives, broadSegmentAlternative(locale));
  pushAlternative(alternatives, slowerPlaybackAlternative(locale));
  if (input.activeSelection.roi !== undefined && isVideoOriented(input)) {
    pushAlternative(alternatives, focusedRegionAlternative(true, locale));
  }

  return capAlternatives(alternatives);
}

function buildExtractClipAlternatives(input: LabExecutionAlternativesInput, locale: LabI18nLocale) {
  const alternatives: LabExecutionAlternative[] = [];

  pushAlternative(alternatives, semanticReviewAlternative(locale));
  if (isAudioOriented(input)) {
    pushAlternative(alternatives, audioInspectionAlternative(locale));
  }
  if (input.activeSelection.roi !== undefined || isVisualOriented(input)) {
    pushAlternative(
      alternatives,
      focusedRegionAlternative(input.activeSelection.roi !== undefined, locale)
    );
  }

  return capAlternatives(alternatives);
}

function buildInspectMotionAlternatives(
  input: LabExecutionAlternativesInput,
  locale: LabI18nLocale
) {
  const alternatives: LabExecutionAlternative[] = [];

  if (input.activeSelection.roi !== undefined || isVideoOriented(input)) {
    pushAlternative(
      alternatives,
      focusedRegionAlternative(input.activeSelection.roi !== undefined, locale)
    );
  }
  pushAlternative(alternatives, slowerPlaybackAlternative(locale));
  pushAlternative(alternatives, broadSegmentAlternative(locale));

  return capAlternatives(alternatives);
}

function buildVisualAlternatives(input: LabExecutionAlternativesInput, locale: LabI18nLocale) {
  const alternatives: LabExecutionAlternative[] = [];

  pushAlternative(
    alternatives,
    focusedRegionAlternative(input.activeSelection.roi !== undefined, locale)
  );
  pushAlternative(alternatives, broadSegmentAlternative(locale));
  if (isVideoOriented(input)) {
    pushAlternative(alternatives, stabilizationAlternative(locale));
  }

  return capAlternatives(alternatives);
}

function buildStabilizeAlternatives(input: LabExecutionAlternativesInput, locale: LabI18nLocale) {
  const alternatives: LabExecutionAlternative[] = [];

  pushAlternative(alternatives, motionInspectionAlternative(locale));
  if (input.activeSelection.roi !== undefined || isVisualOriented(input)) {
    pushAlternative(
      alternatives,
      focusedRegionAlternative(input.activeSelection.roi !== undefined, locale)
    );
  }
  pushAlternative(alternatives, visualClarityAlternative(locale));

  return capAlternatives(alternatives);
}

function buildFallbackAlternatives(locale: LabI18nLocale) {
  return [broadSegmentAlternative(locale), genericNarrowAlternative(locale)];
}

function buildAlternatives(input: LabExecutionAlternativesInput, locale: LabI18nLocale) {
  switch (input.executionPlan.actionType) {
    case "analyze-segment":
      return buildAnalyzeSegmentAlternatives(input, locale);
    case "extract-clip":
      return buildExtractClipAlternatives(input, locale);
    case "focus-region":
      return buildFocusRegionAlternatives(input, locale);
    case "inspect-audio":
      return buildInspectAudioAlternatives(input, locale);
    case "inspect-motion":
      return buildInspectMotionAlternatives(input, locale);
    case "enhance-visual":
      return buildVisualAlternatives(input, locale);
    case "stabilize-segment":
      return buildStabilizeAlternatives(input, locale);
    default:
      return buildFallbackAlternatives(locale);
  }
}

function buildBaseSummary(input: LabExecutionAlternativesInput, locale: LabI18nLocale) {
  const goalEvaluation = input.executionGoalEvaluation;
  const patternStrength = goalEvaluation?.patternSignal?.strength;
  const interpretation = input.executionResultInterpretation;
  const adaptiveDecision = buildAdaptiveDecisionSignal({
    executionGoalEvaluation: goalEvaluation ?? null,
    executionResultInterpretation: interpretation ?? null,
    locale,
  });
  if (adaptiveDecision.decisionPressure === "high") {
    return resolveLabI18n("alternatives.summary.adaptiveHigh", locale);
  }
  if (goalEvaluation !== undefined && goalEvaluation !== null) {
    if (patternStrength === "weak") {
      return resolveLabI18n("alternatives.summary.historicalWeak", locale);
    }
    if (goalEvaluation.outcome === "failed") {
      return resolveLabI18n("alternatives.summary.goalFailed", locale);
    }
    if (goalEvaluation.outcome === "successful") {
      if (patternStrength === "strong" && interpretation?.alignment !== "deviates") {
        return resolveLabI18n("alternatives.summary.goalSuccessfulStrong", locale);
      }
      if (interpretation?.alignment === "deviates") {
        return resolveLabI18n("alternatives.summary.goalSuccessfulDeviates", locale);
      }
      return resolveLabI18n("alternatives.summary.goalSuccessful", locale);
    }
  }
  if (interpretation !== undefined && interpretation !== null) {
    if (interpretation.coverageLevel === "low" || interpretation.alignment === "deviates") {
      return resolveLabI18n("alternatives.summary.feedbackWeak", locale);
    }
    if (
      interpretation.coverageLevel === "high" &&
      interpretation.alignment === "matches-simulation"
    ) {
      return resolveLabI18n("alternatives.summary.feedbackStable", locale);
    }
    return resolveLabI18n("alternatives.summary.feedbackMixed", locale);
  }
  if (input.executionReflection.decision === "proceed") {
    return resolveLabI18n("alternatives.summary.reflectionProceed", locale);
  }
  if (input.executionReflection.decision === "review") {
    return resolveLabI18n("alternatives.summary.reflectionReview", locale);
  }
  return resolveLabI18n("alternatives.summary.reflectionAvoid", locale);
}

function buildSummary(
  input: LabExecutionAlternativesInput,
  guidedAlternative: LabGuidedAlternativeSignal,
  counterfactualSummary: string,
  descriptorAdvisory: string,
  readinessSignalAdvisory: string,
  bridgeAdvisory: string,
  coherenceAdvisory: string,
  decisionPosture: LabDecisionPostureSignal | null,
  locale: LabI18nLocale
) {
  const baseSummary = buildBaseSummary(input, locale);
  const leadingSummary = joinSummaryParts([
    baseSummary,
    guidedAlternative.guidanceText,
    counterfactualSummary,
  ]);
  const advisorySummary = joinSummaryParts([
    descriptorAdvisory,
    readinessSignalAdvisory,
    bridgeAdvisory,
    coherenceAdvisory,
  ]);
  const summary = joinSummaryParts([leadingSummary, advisorySummary]);
  return decisionPosture === null
    ? summary
    : prependDecisionPostureLabel(summary, decisionPosture, locale);
}

function buildReadinessSignal(
  input: LabExecutionAlternativesInput,
  decisionPressure: LabExecutionDecisionPressure,
  alternativesConfidence: number,
  projection: ReturnType<typeof buildCounterfactualProjection> | null
) {
  return buildExecutionReadinessSignal({
    decisionPressure,
    goalEvaluation: input.executionGoalEvaluation ?? null,
    alignment: input.executionResultInterpretation?.alignment ?? null,
    alternativesConfidence,
    projection,
  });
}

function buildReadinessSignalAdvisory(
  signal: ReturnType<typeof buildExecutionReadinessSignal>,
  locale: LabI18nLocale
) {
  return formatExecutionReadinessSignalAdvisory(signal, locale);
}

function buildDecisionCoherenceSignal(context: {
  decisionPosture: LabDecisionPostureSignal;
  readinessSignal: ReturnType<typeof buildExecutionReadinessSignal>;
  projection: ReturnType<typeof buildCounterfactualProjection> | null;
}) {
  return buildDecisionCoherence({
    posture: context.decisionPosture.posture,
    readiness: context.readinessSignal,
    ...(context.projection === null ? {} : { projection: context.projection }),
  });
}

function buildAlternativeDescriptorAdvisory(
  alternative: LabExecutionAlternative | null,
  locale: LabI18nLocale
) {
  if (alternative === null) {
    return "";
  }
  const descriptor = buildExecutionDescriptor({
    actionType: alternative.actionType,
  });
  return formatExecutionDescriptorAdvisory({
    actionType: alternative.actionType,
    descriptor,
    locale,
  });
}

function buildAlternativeBridgeAdvisory(
  alternative: LabExecutionAlternative | null,
  locale: LabI18nLocale
) {
  if (alternative === null) {
    return "";
  }
  return formatExecutionBridgeAdvisory(
    buildExecutionBridge(
      buildExecutionDescriptor({
        actionType: alternative.actionType,
      })
    ),
    locale
  );
}

function joinSummaryParts(parts: string[]) {
  return parts
    .map(function (part) {
      return part.trim();
    })
    .filter(function (part) {
      return part !== "";
    })
    .join(" ");
}

function buildBaseComparisonNote(input: LabExecutionAlternativesInput, locale: LabI18nLocale) {
  const goalEvaluation = input.executionGoalEvaluation;
  const patternStrength = goalEvaluation?.patternSignal?.strength;
  const interpretation = input.executionResultInterpretation;
  const adaptiveDecision = buildAdaptiveDecisionSignal({
    executionGoalEvaluation: goalEvaluation ?? null,
    executionResultInterpretation: interpretation ?? null,
    locale,
  });
  if (adaptiveDecision.decisionPressure === "high") {
    return resolveLabI18n("alternatives.comparison.adaptiveHigh", locale);
  }
  if (goalEvaluation !== undefined && goalEvaluation !== null) {
    if (patternStrength === "weak") {
      return resolveLabI18n("alternatives.comparison.historicalWeak", locale);
    }
    if (goalEvaluation.outcome === "failed") {
      return resolveLabI18n("alternatives.comparison.goalFailed", locale);
    }
    if (goalEvaluation.outcome === "successful") {
      if (patternStrength === "strong" && interpretation?.alignment !== "deviates") {
        return resolveLabI18n("alternatives.comparison.goalSuccessfulStrong", locale);
      }
      if (interpretation?.alignment === "deviates") {
        return resolveLabI18n("alternatives.comparison.goalSuccessfulDeviates", locale);
      }
      return resolveLabI18n("alternatives.comparison.goalSuccessful", locale);
    }
  }
  if (interpretation !== undefined && interpretation !== null) {
    if (interpretation.coverageLevel === "low" || interpretation.alignment === "deviates") {
      return resolveLabI18n("alternatives.comparison.feedbackWeak", locale);
    }
    if (
      interpretation.coverageLevel === "high" &&
      interpretation.alignment === "matches-simulation"
    ) {
      return resolveLabI18n("alternatives.comparison.feedbackStable", locale);
    }
    return resolveLabI18n("alternatives.comparison.feedbackMixed", locale);
  }
  if (input.executionReflection.decision === "proceed") {
    return resolveLabI18n("alternatives.comparison.reflectionProceed", locale);
  }
  if (input.executionReflection.decision === "review") {
    return resolveLabI18n("alternatives.comparison.reflectionReview", locale);
  }
  return resolveLabI18n("alternatives.comparison.reflectionAvoid", locale);
}

function buildComparisonNote(
  input: LabExecutionAlternativesInput,
  guidedAlternative: LabGuidedAlternativeSignal,
  locale: LabI18nLocale
) {
  const baseComparisonNote = buildBaseComparisonNote(input, locale);
  if (
    guidedAlternative.preferredAlternativeLabel === null ||
    baseComparisonNote.includes(guidedAlternative.preferredAlternativeLabel)
  ) {
    return baseComparisonNote;
  }
  return formatLabI18n("alternatives.comparison.preferred", locale, {
    base: baseComparisonNote,
    label: guidedAlternative.preferredAlternativeLabel,
  });
}

function buildConfidence(input: LabExecutionAlternativesInput, alternativeCount: number) {
  let confidence =
    input.executionReflection.confidence ??
    input.executionReadiness.confidence ??
    input.executionSimulation.metrics?.confidence ??
    input.executionPlan.confidence ??
    0.66;

  if (input.executionReflection.decision === "proceed") {
    confidence += 0.02;
  } else if (input.executionReflection.decision === "review") {
    confidence -= 0.04;
  } else {
    confidence -= 0.1;
  }

  if (input.executionReadiness.status === "blocked") {
    confidence -= 0.06;
  } else if (input.executionReadiness.status === "needs-review") {
    confidence -= 0.03;
  }

  if (input.executionSimulation.metrics?.risk === "high") {
    confidence -= 0.06;
  } else if (input.executionSimulation.metrics?.risk === "medium") {
    confidence -= 0.03;
  }

  if (alternativeCount < 2) {
    confidence -= 0.03;
  }

  return clampConfidence(confidence);
}

export function buildExecutionAlternatives(
  input: LabExecutionAlternativesInput
): LabExecutionAlternatives {
  const locale = input.locale ?? "en";
  const alternatives = buildAlternatives(input, locale);
  const confidence = buildConfidence(input, alternatives.length);
  const adaptiveDecision = buildAdaptiveDecisionSignal({
    executionGoalEvaluation: input.executionGoalEvaluation ?? null,
    executionResultInterpretation: input.executionResultInterpretation ?? null,
    locale,
  });
  const decisionPosture = buildDecisionPosture({
    decisionPressure: adaptiveDecision.decisionPressure,
    executionGoalEvaluation: input.executionGoalEvaluation ?? null,
    executionResultInterpretation: input.executionResultInterpretation ?? null,
  });
  const guidedAlternative = buildGuidedAlternativeSignal({
    alternatives,
    alternativesConfidence: confidence,
    decisionPressure: adaptiveDecision.decisionPressure,
    executionGoalEvaluation: input.executionGoalEvaluation ?? null,
    executionResultInterpretation: input.executionResultInterpretation ?? null,
    locale,
  });
  const preferredAlternative =
    guidedAlternative.preferredAlternativeIndex === null
      ? null
      : (alternatives[guidedAlternative.preferredAlternativeIndex] ?? null);
  const counterfactualProjection =
    preferredAlternative === null ||
    input.executionResult === undefined ||
    input.executionResult === null
      ? null
      : buildCounterfactualProjection(preferredAlternative, {
          decisionPressure: adaptiveDecision.decisionPressure,
          executionGoalEvaluation: input.executionGoalEvaluation ?? null,
          executionResult: input.executionResult,
          executionResultInterpretation: input.executionResultInterpretation ?? null,
          locale,
        });
  const descriptorAlternative = preferredAlternative ?? alternatives[0] ?? null;
  const descriptorAdvisory = buildAlternativeDescriptorAdvisory(descriptorAlternative, locale);
  const bridgeAdvisory = buildAlternativeBridgeAdvisory(descriptorAlternative, locale);
  const readinessSignal = buildReadinessSignal(
    input,
    adaptiveDecision.decisionPressure,
    confidence,
    counterfactualProjection
  );
  const readinessSignalAdvisory = buildReadinessSignalAdvisory(readinessSignal, locale);
  const decisionCoherence = buildDecisionCoherenceSignal({
    decisionPosture,
    readinessSignal,
    projection: counterfactualProjection,
  });
  const hasExecutionFeedbackContext =
    (input.executionGoalEvaluation !== undefined && input.executionGoalEvaluation !== null) ||
    (input.executionResultInterpretation !== undefined &&
      input.executionResultInterpretation !== null);
  const alternativesDecisionPosture = hasExecutionFeedbackContext ? decisionPosture : null;
  return {
    id: createAlternativesId(input),
    planId: input.executionPlan.id,
    summary: buildSummary(
      input,
      guidedAlternative,
      counterfactualProjection?.summary ?? "",
      descriptorAdvisory,
      readinessSignalAdvisory,
      bridgeAdvisory,
      formatDecisionCoherenceAdvisory(decisionCoherence, locale),
      alternativesDecisionPosture,
      locale
    ),
    alternatives,
    comparisonNote: buildComparisonNote(input, guidedAlternative, locale),
    confidence,
  };
}

export function buildExecutionAlternativesFromResolved(
  input: LabExecutionAlternativesResolvedInput
): LabExecutionAlternatives | null {
  if (
    input.activeSelection === null ||
    input.executionPlan === null ||
    input.executionReadiness === null ||
    input.executionReflection === null ||
    input.executionSimulation === null ||
    input.activeSelection.endMs <= input.activeSelection.startMs
  ) {
    return null;
  }
  return buildExecutionAlternatives({
    activeSelection: input.activeSelection,
    executionPlan: input.executionPlan,
    executionReadiness: input.executionReadiness,
    executionReflection: input.executionReflection,
    executionResult: input.executionResult ?? null,
    executionGoalEvaluation: input.executionGoalEvaluation ?? null,
    executionResultInterpretation: input.executionResultInterpretation ?? null,
    executionSimulation: input.executionSimulation,
    inspectionMode: input.inspectionMode,
    locale: input.locale ?? "en",
    sourceKind: input.sourceKind,
  });
}
