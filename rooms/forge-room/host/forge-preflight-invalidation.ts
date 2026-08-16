import type {
  ForgeGoal,
  ForgeOperatorProfile,
  ForgePreflightState,
  ForgeRunOverride,
  ForgeSessionContextSelection,
} from "../shared/types/index.js";
import { buildContextDigest } from "./forge-context-digest.js";
import { buildForgeSelectedOperatorProfile } from "./forge-preflight-metadata.js";
type ForgePreflightStage =
  | "before-draft"
  | "draft-review"
  | "approved-pending-dispatch"
  | "dispatch-started"
  | "synthesis-selected";

export function readForgePreflightInvalidationReason(params: {
  goal: ForgeGoal;
  operatorProfile: ForgeOperatorProfile;
  preflight: ForgePreflightState;
  runOverride: ForgeRunOverride | null;
  sessionContextSelection: ForgeSessionContextSelection;
}): string | null {
  const { goal, operatorProfile, preflight, runOverride, sessionContextSelection } = params;
  if (preflight.bundle === null) {
    return preflight.status === "idle"
      ? "Preflight has not been run for this session yet."
      : (preflight.staleReason ?? "Preflight data is unavailable.");
  }

  const selectedOperatorProfile = buildForgeSelectedOperatorProfile({
    operatorProfile,
    sessionContextSelection,
  });
  const expectedContextDigest = buildContextDigest({
    goal,
    preflightInputFields: {
      enableRovoPreAnalysis: runOverride?.enableRovoPreAnalysis === true,
    },
    runOverride,
    selectedOperatorProfile,
    sessionContextSelection,
  });
  const activeDigest =
    preflight.expectedContextDigest ?? preflight.contextDigest ?? preflight.bundle.contextDigest;
  if (activeDigest !== expectedContextDigest) {
    return "Forge run context changed after the last preflight run.";
  }

  if (preflight.status === "stale" && preflight.staleReason) {
    return preflight.staleReason;
  }

  return null;
}

export function readForgePreflightStage(params: {
  hasDispatchStarted: boolean;
  hasSelectedSynthesis: boolean;
  hasTopLevelApprovedTasks: boolean;
  hasTopLevelDraftTasks: boolean;
}): ForgePreflightStage {
  if (params.hasSelectedSynthesis) {
    return "synthesis-selected";
  }
  if (params.hasDispatchStarted) {
    return "dispatch-started";
  }
  if (params.hasTopLevelApprovedTasks) {
    return "approved-pending-dispatch";
  }
  if (params.hasTopLevelDraftTasks) {
    return "draft-review";
  }
  return "before-draft";
}

export function describeForgePreflightStageImpact(
  stage: ForgePreflightStage,
  reason: string
): string {
  switch (stage) {
    case "draft-review":
      return `${reason} Existing draft tasks were kept; review them before approval and the next AI call will refresh preflight automatically.`;
    case "approved-pending-dispatch":
      return `${reason} Approved tasks were kept; dispatch will refresh preflight before any new AI response is requested.`;
    case "dispatch-started":
      return `${reason} In-flight assignments and captured responses were left untouched; the new context only applies to future AI work.`;
    case "synthesis-selected":
      return `${reason} Existing syntheses and exports were preserved; rerun preflight only if you start another AI step.`;
    case "before-draft":
    default:
      return `${reason} The next AI step will refresh preflight automatically.`;
  }
}
