import type {
  ForgeGoal,
  ForgeTask,
  ForgeTaskAssignment,
  ForgeAgentResponse,
  ForgeConflict,
  ForgeSynthesis,
  ForgeHandoffExportRecord,
  ForgeExportReadinessSummary,
  ForgeOperatorProfile,
  ForgePreflightState,
  ForgeRunOverride,
  ForgeRunSignature,
  ForgeSessionContextSelection,
} from "../../shared/types/index.js";
import type { ForgeRuntimeState, ForgeSessionListItem } from "./forge-runtime-state.js";

export interface ForgeRuntimeSnapshot {
  activeSessionId: string | null;
  approvedTasks: ForgeTask[];
  assignments: ForgeTaskAssignment[];
  conflicts: ForgeConflict[];
  coordinatorState: ForgeRuntimeState["coordinatorState"];
  contextDigest: string | null;
  currentGoal: ForgeGoal | null;
  draftTasks: ForgeTask[];
  draftSourceText: string | null;
  validationMessages: string[];
  decisionTrace: string[];
  exports: ForgeHandoffExportRecord[];
  exportSummary: ForgeExportReadinessSummary;
  operatorProfile: ForgeOperatorProfile;
  preflight: ForgePreflightState;
  responses: ForgeAgentResponse[];
  runId: string | null;
  sessionContextSelection: ForgeSessionContextSelection;
  sessionRevision: number;
  runOverride: ForgeRunOverride | null;
  runSignature: ForgeRunSignature | null;
  selectedSynthesisId: string | null;
  sessionList: ForgeSessionListItem[];
  syntheses: ForgeSynthesis[];
}

export function createForgeRuntimeSnapshot(
  state: ForgeRuntimeState,
  sessionList: ForgeSessionListItem[],
  exportSummary: ForgeExportReadinessSummary
): ForgeRuntimeSnapshot {
  return {
    activeSessionId: state.activeSessionId,
    currentGoal: state.currentGoal,
    draftTasks: state.draftTasks,
    draftSourceText: state.draftSourceText,
    validationMessages: state.validationMessages,
    decisionTrace: state.decisionTrace,
    approvedTasks: state.approvedTasks,
    assignments: state.assignments,
    contextDigest: state.contextDigest,
    exports: state.exports,
    exportSummary,
    operatorProfile: state.operatorProfile,
    preflight: state.preflight,
    responses: state.responses,
    runId: state.runId,
    sessionContextSelection: state.sessionContextSelection,
    sessionRevision: state.sessionRevision,
    runOverride: state.runOverride,
    runSignature: state.runSignature,
    conflicts: state.conflicts,
    syntheses: state.syntheses,
    selectedSynthesisId: state.selectedSynthesisId,
    coordinatorState: state.coordinatorState,
    sessionList,
  };
}
