import type {
  LabExecutionDispatchCandidate,
  LabExecutionGoalEvaluation,
  LabExecutionPayloadPreview,
  LabExecutionReflection,
  LabExecutionResult,
  LabExecutionSelectionSnapshot,
  LabExecutionStaging,
} from "../../domain/lab-types.js";

export type LabExecutionResultInterpretation = {
  coverageLevel: "low" | "medium" | "high";
  anomalyLevel: "none" | "moderate" | "high";
  alignment: "matches-simulation" | "partial" | "deviates";
};

export type LabExecutionResultInterpretationInput = LabExecutionResult & {
  actionType: string;
  selectionSnapshot?: LabExecutionSelectionSnapshot;
};

export type LabExecutionGoalEvaluationInput = LabExecutionResult & {
  selectionSnapshot?: LabExecutionSelectionSnapshot;
};

export type ActiveExecutionRuntimeContext = {
  dispatchCandidate: LabExecutionDispatchCandidate;
  result: LabExecutionResult;
};

type ExecutionPatternStats = {
  executionCount: number;
  coverageTotal: number;
  successCount: number;
  failureCount: number;
};

const executionPatternRegistry = new Map<string, ExecutionPatternStats>();
const recordedExecutionPatternSamples = new Set<string>();
const activeExecutionGoalEvaluationCache = new Map<string, LabExecutionGoalEvaluation>();

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter(function (key) {
      return record[key] !== undefined;
    })
    .map(function (key) {
      return `${JSON.stringify(key)}:${stableStringify(record[key])}`;
    })
    .join(",")}}`;
}

export function buildExecutionDispatchId(input: {
  payloadPreview: LabExecutionPayloadPreview;
  planId: string;
  selectionSnapshot: LabExecutionSelectionSnapshot;
  staging: LabExecutionStaging;
}): string {
  return `dispatch:${stableStringify({
    actionType: input.payloadPreview.actionType,
    candidateStatus: input.staging.candidateStatus,
    commitmentStatus: input.staging.commitmentStatus,
    planId: input.planId,
    readinessPassesPreview: input.payloadPreview.readinessPassesPreview,
    readinessStatus: input.staging.readinessStatus,
    selectionSnapshot: input.selectionSnapshot,
    stagingStatus: input.staging.status,
  })}`;
}

function getExpectedExecutionArtifactCount(actionType: string) {
  if (actionType === "analyze-segment") {
    return 2;
  }
  if (actionType === "focus-region" || actionType === "inspect-audio") {
    return 1;
  }
  return 1;
}

function getExecutionSelectionDurationMs(selection?: LabExecutionSelectionSnapshot) {
  if (selection === undefined) {
    return 0;
  }
  return Math.max(0, selection.endMs - selection.startMs);
}

function getExecutionDurationBucket(selection?: LabExecutionSelectionSnapshot) {
  const durationMs = getExecutionSelectionDurationMs(selection);
  if (durationMs < 1000) {
    return "short";
  }
  if (durationMs < 5000) {
    return "medium";
  }
  if (durationMs < 15000) {
    return "long";
  }
  return "extended";
}

function buildExecutionPatternKey(input: {
  actionType: string;
  selectionSnapshot?: LabExecutionSelectionSnapshot;
}) {
  return [
    input.actionType,
    getExecutionDurationBucket(input.selectionSnapshot),
    input.selectionSnapshot?.roi === undefined ? "no-roi" : "roi",
  ].join(":");
}

function buildExecutionResultSignature(result: LabExecutionResult) {
  return stableStringify({
    artifacts: result.artifacts,
    insights: result.insights,
    metrics: result.metrics,
    summary: result.summary,
  });
}

function buildExecutionPatternSampleId(context: ActiveExecutionRuntimeContext) {
  return `${context.dispatchCandidate.dispatchId}:${buildExecutionResultSignature(context.result)}`;
}

function getExecutionCoverageScore(result: LabExecutionResultInterpretationInput) {
  const expectedArtifactCount = getExpectedExecutionArtifactCount(result.actionType);
  const metricCoverage = result.metrics.coverage;
  let coverageScore =
    typeof metricCoverage === "number" && Number.isFinite(metricCoverage)
      ? metricCoverage
      : result.artifacts.length / expectedArtifactCount;
  const durationMs = getExecutionSelectionDurationMs(result.selectionSnapshot);

  if (durationMs > 10000 && result.artifacts.length <= expectedArtifactCount) {
    coverageScore -= 0.1;
  }
  if (durationMs > 0 && durationMs < 500) {
    coverageScore -= 0.05;
  }

  return Math.max(0, Math.min(1, coverageScore));
}

export function buildExecutionResultInterpretation(
  result: LabExecutionResultInterpretationInput
): LabExecutionResultInterpretation {
  const coverageScore = getExecutionCoverageScore(result);
  const coverageLevel = coverageScore >= 0.8 ? "high" : coverageScore >= 0.55 ? "medium" : "low";
  const expectedArtifactCount = getExpectedExecutionArtifactCount(result.actionType);
  const artifactCount = result.artifacts.length;
  const anomalyLevel =
    artifactCount === 0
      ? "none"
      : result.actionType === "analyze-segment" && artifactCount >= 3
        ? "high"
        : artifactCount > expectedArtifactCount + 1
          ? "high"
          : "moderate";
  const alignment =
    coverageLevel === "low" || anomalyLevel === "high"
      ? "deviates"
      : coverageLevel === "high"
        ? "matches-simulation"
        : "partial";

  return {
    alignment,
    anomalyLevel,
    coverageLevel,
  };
}

function clampGoalAlignment(value: number) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function createGoalEvaluation(
  outcome: LabExecutionGoalEvaluation["outcome"],
  goalAlignment: number,
  summary: string
): LabExecutionGoalEvaluation {
  return {
    outcome,
    goalAlignment: clampGoalAlignment(goalAlignment),
    summary,
  };
}

export function getExecutionGoalEvaluation(
  result: LabExecutionGoalEvaluationInput,
  actionType: string
): LabExecutionGoalEvaluation {
  const interpretation = buildExecutionResultInterpretation({
    ...result,
    actionType,
  });
  const confidence =
    typeof result.metrics.confidence === "number" && Number.isFinite(result.metrics.confidence)
      ? Math.max(0, Math.min(1, result.metrics.confidence))
      : undefined;
  const hasRoi = result.selectionSnapshot?.roi !== undefined;
  const artifactCount = result.artifacts.length;

  switch (actionType) {
    case "analyze-segment":
      if (interpretation.coverageLevel === "high" && interpretation.anomalyLevel !== "none") {
        return createGoalEvaluation(
          "successful",
          interpretation.anomalyLevel === "high" ? 0.95 : 0.88,
          "Segment goal achieved through high-coverage anomaly detection"
        );
      }
      if (interpretation.coverageLevel === "low") {
        return createGoalEvaluation(
          "failed",
          0.25,
          "Segment goal remains unmet because coverage is too limited"
        );
      }
      return createGoalEvaluation(
        "neutral",
        0.55,
        "Segment goal remains inconclusive under the current evidence"
      );
    case "focus-region":
      if (hasRoi !== true) {
        return createGoalEvaluation(
          "neutral",
          0.5,
          "Region goal remains neutral without an ROI snapshot"
        );
      }
      if (interpretation.coverageLevel === "high") {
        return createGoalEvaluation(
          "successful",
          0.9,
          "Region goal achieved with high ROI coverage"
        );
      }
      if (interpretation.coverageLevel === "low") {
        return createGoalEvaluation(
          "failed",
          0.25,
          "Region goal remains unmet because ROI coverage is limited"
        );
      }
      return createGoalEvaluation(
        "neutral",
        0.58,
        "Region goal remains inconclusive under the current ROI coverage"
      );
    case "inspect-audio":
      if (artifactCount >= 2 && confidence !== undefined && confidence >= 0.6) {
        return createGoalEvaluation(
          "successful",
          confidence >= 0.75 ? 0.88 : 0.8,
          "Audio goal achieved through repeated frequency evidence"
        );
      }
      if (confidence !== undefined && confidence < 0.6) {
        return createGoalEvaluation(
          "failed",
          0.25,
          "Audio goal remains unmet because confidence is too low"
        );
      }
      return createGoalEvaluation(
        "neutral",
        0.55,
        "Audio goal remains inconclusive for the current result"
      );
    default:
      return createGoalEvaluation(
        "neutral",
        0.5,
        "Goal evaluation remains neutral for this action"
      );
  }
}

function roundExecutionPatternMetric(value: number) {
  return Number(value.toFixed(2));
}

function getExecutionPatternSignal(
  patternKey: string
): LabExecutionGoalEvaluation["patternSignal"] {
  const stats = executionPatternRegistry.get(patternKey);
  if (stats === undefined || stats.executionCount === 0) {
    return undefined;
  }

  const averageCoverage = roundExecutionPatternMetric(stats.coverageTotal / stats.executionCount);
  const decisiveCount = stats.successCount + stats.failureCount;
  const successRatio =
    decisiveCount > 0 ? roundExecutionPatternMetric(stats.successCount / decisiveCount) : 0;
  const failureRatio =
    decisiveCount > 0 ? roundExecutionPatternMetric(stats.failureCount / decisiveCount) : 0;
  const weak = averageCoverage < 0.55 || failureRatio >= 0.6;
  const strong = averageCoverage >= 0.8 && successRatio >= 0.6;
  const strength = weak ? "weak" : strong ? "strong" : "neutral";

  return {
    averageCoverage,
    executionCount: stats.executionCount,
    failureRatio,
    strength,
    successRatio,
    ...(strength === "weak"
      ? { note: "Historically similar evaluations show low coverage" }
      : strength === "strong"
        ? { note: "Historically similar evaluations usually complete successfully" }
        : {}),
  };
}

function recordExecutionPatternSample(
  context: ActiveExecutionRuntimeContext,
  goalEvaluation: LabExecutionGoalEvaluation
) {
  const sampleId = buildExecutionPatternSampleId(context);
  if (recordedExecutionPatternSamples.has(sampleId)) {
    return;
  }

  const patternKey = buildExecutionPatternKey({
    actionType: context.dispatchCandidate.actionType,
    selectionSnapshot: context.dispatchCandidate.selectionSnapshot,
  });
  const stats = executionPatternRegistry.get(patternKey) ?? {
    coverageTotal: 0,
    executionCount: 0,
    failureCount: 0,
    successCount: 0,
  };
  const coverage = getExecutionCoverageScore({
    ...context.result,
    actionType: context.dispatchCandidate.actionType,
    selectionSnapshot: context.dispatchCandidate.selectionSnapshot,
  });

  stats.executionCount += 1;
  stats.coverageTotal += coverage;
  if (goalEvaluation.outcome === "successful") {
    stats.successCount += 1;
  } else if (goalEvaluation.outcome === "failed") {
    stats.failureCount += 1;
  }

  executionPatternRegistry.set(patternKey, stats);
  recordedExecutionPatternSamples.add(sampleId);
}

function appendExecutionPatternSignal(
  goalEvaluation: LabExecutionGoalEvaluation,
  patternSignal: LabExecutionGoalEvaluation["patternSignal"]
): LabExecutionGoalEvaluation {
  if (patternSignal === undefined) {
    return goalEvaluation;
  }

  const note = patternSignal.note;
  return {
    ...goalEvaluation,
    patternSignal,
    ...(note !== undefined && !goalEvaluation.summary.includes(note)
      ? { summary: `${goalEvaluation.summary} ${note}` }
      : {}),
  };
}

export function getCachedExecutionGoalEvaluation(
  context: ActiveExecutionRuntimeContext
): LabExecutionGoalEvaluation {
  const sampleId = buildExecutionPatternSampleId(context);
  const cachedEvaluation = activeExecutionGoalEvaluationCache.get(sampleId);
  if (cachedEvaluation !== undefined) {
    return cachedEvaluation;
  }

  const goalEvaluation = getExecutionGoalEvaluation(
    {
      ...context.result,
      selectionSnapshot: context.dispatchCandidate.selectionSnapshot,
    },
    context.dispatchCandidate.actionType
  );
  const patternKey = buildExecutionPatternKey({
    actionType: context.dispatchCandidate.actionType,
    selectionSnapshot: context.dispatchCandidate.selectionSnapshot,
  });
  const augmentedEvaluation = appendExecutionPatternSignal(
    goalEvaluation,
    getExecutionPatternSignal(patternKey)
  );

  activeExecutionGoalEvaluationCache.set(sampleId, augmentedEvaluation);
  recordExecutionPatternSample(context, goalEvaluation);
  return augmentedEvaluation;
}

export function __testOnlyResetExecutionPatternRegistry() {
  executionPatternRegistry.clear();
  recordedExecutionPatternSamples.clear();
  activeExecutionGoalEvaluationCache.clear();
}

export function __testOnlyBuildExecutionPatternKey(input: {
  actionType: string;
  selectionSnapshot?: LabExecutionSelectionSnapshot;
}) {
  return buildExecutionPatternKey(input);
}

function getReflectionFeedbackLine(interpretation: LabExecutionResultInterpretation) {
  if (interpretation.coverageLevel === "low") {
    return "Result shows limited coverage";
  }
  if (interpretation.alignment === "deviates") {
    return "Detected structure differs from initial simulation";
  }
  if (interpretation.alignment === "matches-simulation") {
    return "Output aligns with simulated expectations";
  }
  return "Result partially aligns with simulated expectations";
}

export function appendReflectionFeedback(
  reflection: LabExecutionReflection,
  interpretation: LabExecutionResultInterpretation | null,
  goalEvaluation: LabExecutionGoalEvaluation | null
): LabExecutionReflection {
  const feedbackLines: string[] = [];

  if (interpretation !== null) {
    const feedbackLine = getReflectionFeedbackLine(interpretation);
    if (!reflection.summary.includes(feedbackLine)) {
      feedbackLines.push(feedbackLine);
    }
  }

  if (goalEvaluation !== null && !reflection.summary.includes(goalEvaluation.summary)) {
    feedbackLines.push(goalEvaluation.summary);
  }

  if (feedbackLines.length === 0) {
    return reflection;
  }
  return {
    ...reflection,
    summary: `${reflection.summary} ${feedbackLines.join(" ")}`,
  };
}
