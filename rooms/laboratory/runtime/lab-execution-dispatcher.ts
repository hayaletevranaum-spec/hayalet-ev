import type {
  LabExecutionArtifact,
  LabExecutionDispatchCandidate,
  LabExecutionResult,
  LabExecutionSelectionSnapshot,
  LabStoreEvent,
} from "../domain/lab-types.js";
import {
  getLabSelectionDurationMs,
  getLabSelectionRoiArea as getRoiArea,
} from "./lab-execution-metrics.js";

type TimerId = unknown;

export type LabExecutionDispatcherDeps = {
  clearTimeoutFn?: (timerId: TimerId) => void;
  emit: (event: LabStoreEvent) => void;
  setTimeoutFn?: (handler: () => void, delayMs: number) => TimerId;
};

const MOCK_PROGRESS_STEPS = [
  { delayMs: 375, progress: 25 },
  { delayMs: 750, progress: 50 },
  { delayMs: 1125, progress: 75 },
];
const MOCK_COMPLETION_DELAY_MS = 1500;

function getSelectionDurationMs(selection: LabExecutionSelectionSnapshot) {
  return getLabSelectionDurationMs(selection, 1);
}

function getSelectionVariant(selection: LabExecutionSelectionSnapshot) {
  return Math.abs(Math.round(selection.startMs)) % 12;
}

function getRoiGeometryVariant(selection: LabExecutionSelectionSnapshot) {
  if (selection.roi === undefined) {
    return 0;
  }
  const roi = selection.roi;
  return (
    (Math.round(roi.x * 1000) +
      Math.round(roi.y * 1000) +
      Math.round(roi.width * 1000) +
      Math.round(roi.height * 1000)) %
    12
  );
}

function getRoiZoneLabel(selection: LabExecutionSelectionSnapshot) {
  if (selection.roi === undefined) {
    return "Segment";
  }
  const centerX = selection.roi.x + selection.roi.width / 2;
  const centerY = selection.roi.y + selection.roi.height / 2;
  const horizontal = centerX < 0.33 ? "Left" : centerX > 0.66 ? "Right" : "Central";
  const vertical = centerY < 0.33 ? "upper" : centerY > 0.66 ? "lower" : "mid";
  return `${horizontal} ${vertical}`;
}

function getRoiCoverageLabel(selection: LabExecutionSelectionSnapshot) {
  const roiArea = getRoiArea(selection);
  if (roiArea < 0.08) {
    return "Tight ROI coverage";
  }
  if (roiArea > 0.2) {
    return "Broad ROI coverage";
  }
  return "Balanced ROI coverage";
}

function roundMetric(value: number) {
  return Number(value.toFixed(2));
}

function createMetric(base: number, step: number, bucket: number, max: number) {
  return roundMetric(Math.min(max, base + step * bucket));
}

function clampToSelection(selection: LabExecutionSelectionSnapshot, value: number) {
  return Math.max(selection.startMs, Math.min(selection.endMs, value));
}

function createTimeRange(
  selection: LabExecutionSelectionSnapshot,
  fraction: number,
  widthRatio = 0.08
) {
  const durationMs = getSelectionDurationMs(selection);
  const widthMs = Math.max(1, Math.round(durationMs * widthRatio));
  const centerMs = selection.startMs + Math.round(durationMs * fraction);
  let start = clampToSelection(selection, centerMs - Math.floor(widthMs / 2));
  let end = clampToSelection(selection, start + widthMs);
  if (end <= start) {
    start = selection.startMs;
    end = Math.max(selection.startMs, selection.endMs);
  }
  return { start, end };
}

function createFullSelectionRange(selection: LabExecutionSelectionSnapshot) {
  return {
    start: selection.startMs,
    end: Math.max(selection.startMs, selection.endMs),
  };
}

function getShiftedFraction(baseFraction: number, variant: number, index: number) {
  const shift = (((variant + index) % 3) - 1) * 0.03;
  return Math.max(0.08, Math.min(0.92, baseFraction + shift));
}

function createAnalyzeSegmentResult(
  candidate: LabExecutionDispatchCandidate,
  variant: number
): LabExecutionResult {
  const selection = candidate.selectionSnapshot;
  const markerLabels = [
    "Structural variation marker",
    "Mid-range anomaly marker",
    "Boundary variance marker",
  ];
  const markerCount = 2 + (variant % 2);
  const artifacts: LabExecutionArtifact[] = markerLabels
    .slice(0, markerCount)
    .map(function (label, index) {
      return {
        type: "marker",
        label,
        timeRange: createTimeRange(
          selection,
          getShiftedFraction([0.25, 0.5, 0.75][index] ?? 0.5, variant, index)
        ),
      };
    });

  return {
    summary: "Analyzed selected segment",
    insights: ["Detected structural variation", "Potential anomaly in mid-range"],
    artifacts,
    metrics: {
      coverage: createMetric(0.8, 0.05, variant % 5, 1),
      confidence: createMetric(0.6, 0.1, variant % 4, 0.9),
    },
  };
}

function createFocusRegionResult(
  candidate: LabExecutionDispatchCandidate,
  variant: number
): LabExecutionResult {
  const selection = candidate.selectionSnapshot;
  if (selection.roi === undefined) {
    return {
      summary: "Focused selected segment",
      insights: ["Focused segment remains region-neutral"],
      artifacts: [
        {
          type: "annotation",
          label: "Segment-scoped focus annotation",
          timeRange: createFullSelectionRange(selection),
        },
      ],
      metrics: {
        coverage: createMetric(0.7, 0.04, variant % 4, 0.82),
        confidence: createMetric(0.58, 0.06, variant % 4, 0.76),
      },
    };
  }
  const roiVariant = (variant + getRoiGeometryVariant(selection)) % 12;
  const roiZoneLabel = getRoiZoneLabel(selection);
  const roiCoverageLabel = getRoiCoverageLabel(selection);
  const roiArea = getRoiArea(selection);

  return {
    summary: "Focused selected region",
    insights: ["Focused region shows localized activity", roiCoverageLabel],
    artifacts: [
      {
        type: "annotation",
        label: `${roiZoneLabel} ROI annotation`,
        timeRange: createTimeRange(
          selection,
          getShiftedFraction(0.5, roiVariant, 0),
          Math.max(0.1, Math.min(0.24, 0.12 + roiArea * 0.4))
        ),
      },
    ],
    metrics: {
      coverage: roundMetric(Math.max(0.7, Math.min(0.94, 0.7 + roiArea * 0.8))),
      confidence: createMetric(0.62, 0.05, roiVariant % 5, 0.83),
    },
  };
}

function createInspectAudioResult(
  candidate: LabExecutionDispatchCandidate,
  variant: number
): LabExecutionResult {
  const selection = candidate.selectionSnapshot;
  const markerLabels = ["Frequency cluster marker", "Transient frequency marker"];
  const markerCount = 1 + (variant % 2);
  return {
    summary: "Inspected selected audio",
    insights: ["Frequency cluster detected"],
    artifacts: markerLabels.slice(0, markerCount).map(function (label, index) {
      return {
        type: "marker",
        label,
        timeRange: createTimeRange(
          selection,
          getShiftedFraction(index === 0 ? 0.42 : 0.68, variant, index),
          0.06
        ),
      };
    }),
    metrics: {
      coverage: createMetric(0.72, 0.05, variant % 4, 0.87),
      confidence: createMetric(0.61, 0.06, variant % 5, 0.85),
    },
  };
}

export function createMockExecutionResult(
  candidate: LabExecutionDispatchCandidate
): LabExecutionResult {
  const variant = getSelectionVariant(candidate.selectionSnapshot);
  switch (candidate.actionType) {
    case "analyze-segment":
      return createAnalyzeSegmentResult(candidate, variant);
    case "focus-region":
      return createFocusRegionResult(candidate, variant);
    case "inspect-audio":
      return createInspectAudioResult(candidate, variant);
    default:
      return {
        summary: "Execution completed for selected context",
        insights: ["Local mock execution completed without action-specific materialization."],
        artifacts: [],
        metrics: {},
      };
  }
}

export function createLabExecutionDispatcher(deps: LabExecutionDispatcherDeps) {
  const setTimeoutFn =
    deps.setTimeoutFn ??
    function (handler: () => void, delayMs: number) {
      return setTimeout(handler, delayMs);
    };
  const clearTimeoutFn =
    deps.clearTimeoutFn ??
    function (timerId: TimerId) {
      clearTimeout(timerId as ReturnType<typeof setTimeout>);
    };

  let activePlanId: string | null = null;
  let activeDispatchId: string | null = null;
  let disposed = false;
  const timers: TimerId[] = [];

  function clearTimers() {
    while (timers.length > 0) {
      const timerId = timers.pop();
      if (timerId !== undefined) {
        clearTimeoutFn(timerId);
      }
    }
  }

  function resetActive() {
    activePlanId = null;
    activeDispatchId = null;
  }

  function schedule(candidate: LabExecutionDispatchCandidate) {
    MOCK_PROGRESS_STEPS.forEach(function (step) {
      timers.push(
        setTimeoutFn(function () {
          if (disposed || activeDispatchId !== candidate.dispatchId) {
            return;
          }
          deps.emit({
            type: "workspace-execution-progress",
            planId: candidate.planId,
            dispatchId: candidate.dispatchId,
            progress: step.progress,
          });
        }, step.delayMs)
      );
    });

    timers.push(
      setTimeoutFn(function () {
        if (disposed || activeDispatchId !== candidate.dispatchId) {
          return;
        }
        deps.emit({
          type: "workspace-execution-completed",
          planId: candidate.planId,
          dispatchId: candidate.dispatchId,
          result: createMockExecutionResult(candidate),
        });
      }, MOCK_COMPLETION_DELAY_MS)
    );
  }

  function sync(candidate: LabExecutionDispatchCandidate | null) {
    if (disposed) {
      return;
    }
    if (candidate === null) {
      if (activeDispatchId !== null && activePlanId !== null) {
        const previousPlanId = activePlanId;
        const previousDispatchId = activeDispatchId;
        clearTimers();
        resetActive();
        deps.emit({
          type: "workspace-execution-runtime-reset",
          planId: previousPlanId,
          dispatchId: previousDispatchId,
        });
        return;
      }
      clearTimers();
      resetActive();
      return;
    }
    if (activeDispatchId === candidate.dispatchId) {
      return;
    }
    clearTimers();
    activePlanId = candidate.planId;
    activeDispatchId = candidate.dispatchId;
    deps.emit({
      type: "workspace-execution-dispatch",
      planId: candidate.planId,
      dispatchId: candidate.dispatchId,
    });
    schedule(candidate);
  }

  function dispose() {
    disposed = true;
    clearTimers();
    resetActive();
  }

  return {
    dispose,
    sync,
  };
}
