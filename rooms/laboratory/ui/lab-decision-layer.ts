import type {
  LabDecisionIntent,
  LabDecisionSignal,
  LabDecisionSnapshot,
  LabDecisionState,
  LabDrawerMode,
  LabStoreState,
} from "../domain/lab-types.js";
import {
  getActiveSelection,
  getMediaViewportState,
  hasReportPayload,
  isRunActive,
  resolveDrawerMode,
} from "../runtime/lab-selectors.js";

type LabDecisionSignalFacts = {
  hasSelection: boolean;
  hasSource: boolean;
  isRunning: boolean;
  hasResult: boolean;
};

const LAB_DECISION_MODES: readonly LabDrawerMode[] = ["setup", "running", "result", "explore"];

function isLabDecisionMode(value: unknown): value is LabDrawerMode {
  return typeof value === "string" && LAB_DECISION_MODES.includes(value as LabDrawerMode);
}

export function deriveLabDecisionSignals(facts: LabDecisionSignalFacts): LabDecisionSignal[] {
  const signals: LabDecisionSignal[] = [];
  if (facts.hasSelection) {
    signals.push("has-selection");
  }
  if (facts.hasSource) {
    signals.push("has-source");
  }
  if (facts.isRunning) {
    signals.push("is-running");
  }
  if (facts.hasResult) {
    signals.push("has-result");
  }
  return signals;
}

export function deriveLabDecisionSignalsFromState(state: LabStoreState): LabDecisionSignal[] {
  return deriveLabDecisionSignals({
    hasResult: hasReportPayload(state),
    hasSelection: getActiveSelection(state) !== null,
    hasSource: getMediaViewportState(state) === "active",
    isRunning: isRunActive(state),
  });
}

export function resolveLabDecisionIntent(
  mode: unknown,
  signals: readonly LabDecisionSignal[]
): LabDecisionIntent {
  if (isLabDecisionMode(mode) !== true) {
    return "idle";
  }
  if (mode === "running") {
    return "running-analysis";
  }
  if (mode === "result") {
    return "reviewing-results";
  }
  if (mode === "explore") {
    return "exploring-alternatives";
  }
  return signals.includes("has-selection") && signals.includes("has-source")
    ? "ready-to-run"
    : "preparing-analysis";
}

export function resolveLabDecisionState(intent: LabDecisionIntent): LabDecisionState {
  if (intent === "running-analysis") {
    return "running";
  }
  if (intent === "reviewing-results" || intent === "exploring-alternatives") {
    return "done";
  }
  if (intent === "ready-to-run") {
    return "ready";
  }
  return "idle";
}

export function readLabDecisionActiveBlocks(shell: ParentNode | null | undefined): string[] {
  if (!shell || typeof shell.querySelectorAll !== "function") {
    return [];
  }
  return Array.from(shell.querySelectorAll(".labx-pipeline-block"))
    .map(function (element) {
      return element.getAttribute("data-block-id")?.trim() ?? "";
    })
    .filter(function (blockId) {
      return blockId !== "";
    });
}

export function buildLabDecisionSnapshot(input: {
  mode?: LabDrawerMode;
  shell?: ParentNode | null;
  state: LabStoreState;
  timestamp?: number;
}): LabDecisionSnapshot {
  const mode = input.mode ?? resolveDrawerMode(input.state);
  const triggers = deriveLabDecisionSignalsFromState(input.state);
  const intent = resolveLabDecisionIntent(mode, triggers);
  return {
    activeBlocks: readLabDecisionActiveBlocks(input.shell ?? null),
    intent,
    mode,
    state: resolveLabDecisionState(intent),
    timestamp: input.timestamp ?? Date.now(),
    triggers,
  };
}

export function getLabDecisionStableKey(snapshot: LabDecisionSnapshot): string {
  return JSON.stringify({
    activeBlocks: snapshot.activeBlocks,
    intent: snapshot.intent,
    mode: snapshot.mode,
    state: snapshot.state,
    triggers: snapshot.triggers,
  });
}
