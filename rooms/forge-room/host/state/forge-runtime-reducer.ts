import type { ForgeRuntimeAction } from "./forge-runtime-actions.js";
import type { ForgeRuntimeState } from "./forge-runtime-state.js";

export function reduceForgeRuntimeState(
  state: ForgeRuntimeState,
  action: ForgeRuntimeAction
): ForgeRuntimeState {
  // NOTE: A reducer keeps Phase 1 state changes explicit so later orchestration logic can grow
  // without hidden mutations across host commands, persistence, and UI notifications.
  switch (action.type) {
    case "runtime/hydrate":
      return action.state;
    case "session/activate":
      return {
        ...state,
        activeSessionId: action.sessionId,
      };
    case "goal/set":
      return {
        ...state,
        currentGoal: action.goal,
      };
    case "draft/set":
      return {
        ...state,
        draftTasks: action.draftTasks,
        draftSourceText: action.draftSourceText,
        validationMessages: action.validationMessages,
      };
    case "decision-trace/set":
      return {
        ...state,
        decisionTrace: action.decisionTrace,
      };
    case "approved/set":
      return {
        ...state,
        approvedTasks: action.approvedTasks,
      };
    case "assignments/set":
      return {
        ...state,
        assignments: action.assignments,
      };
    case "artifact-store/set":
      return {
        ...state,
        artifactStore: action.artifactStore,
      };
    case "responses/set":
      return {
        ...state,
        responses: action.responses,
      };
    case "exports/set":
      return {
        ...state,
        exports: action.exports,
      };
    case "conflicts/set":
      return {
        ...state,
        conflicts: action.conflicts,
      };
    case "syntheses/set":
      return {
        ...state,
        syntheses: action.syntheses,
        selectedSynthesisId: action.selectedSynthesisId,
      };
    case "coordinator/set":
      return {
        ...state,
        coordinatorState: action.coordinatorState,
      };
    case "operator-profile/set":
      return {
        ...state,
        operatorProfile: action.operatorProfile,
      };
    case "preflight/set":
      return {
        ...state,
        preflight: action.preflight,
      };
    case "session-context/set":
      return {
        ...state,
        sessionContextSelection: action.sessionContextSelection,
      };
    case "run-context/set":
      return {
        ...state,
        contextDigest: action.contextDigest,
        runId: action.runId,
        runOverride: action.runOverride,
        runSignature: action.runSignature,
        sessionRevision: action.sessionRevision,
      };
    default:
      return state;
  }
}
