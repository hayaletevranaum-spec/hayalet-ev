import type {
  ForgeAgentResponse,
  ForgeArchitectSeatId,
  ForgeConflict,
  ForgeCoordinatorState,
  ForgeExportReadinessSummary,
  ForgeGoal,
  ForgeHandoffExportRecord,
  ForgeOperatorProfile,
  ForgePreflightState,
  ForgeRunOverride,
  ForgeRunSignature,
  ForgeSessionContextSelection,
  ForgeSynthesis,
  ForgeTask,
  ForgeTaskAssignment,
} from "../types/index.js";
import {
  createDefaultForgeOperatorProfile,
  createEmptyForgePreflightState,
  createEmptyForgeSessionContextSelection,
} from "../types/index.js";

export type ForgeWorkbenchUiFlowState =
  | "IDLE"
  | "GOAL_DEFINED"
  | "SESSION_CREATED"
  | "DRAFT_READY"
  | "APPROVED"
  | "DISPATCHED"
  | "RESPONSES_READY"
  | "CONFLICT"
  | "SYNTHESIS_READY"
  | "EXPORTED";

export type ForgeWorkbenchUiSurface = "goal" | "responses" | "synthesis";
export type ForgeWorkbenchStageId = "session" | "preflight" | "tracking" | "draft";

export interface ForgeUiArchitectSeatState {
  assigned: boolean;
  avatar: string | null;
  connected: boolean;
  nickname: string;
  seatId: ForgeArchitectSeatId;
}

export interface ForgeRoomSnapshot {
  activeSessionId: string | null;
  approvedTasks: ForgeTask[];
  assignments: ForgeTaskAssignment[];
  conflicts: ForgeConflict[];
  coordinatorState: ForgeCoordinatorState;
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
  sessionList: Array<{
    id: string;
    title: string;
    updatedAt: string;
  }>;
  syntheses: ForgeSynthesis[];
}

export interface ForgeUiContextState {
  assistantAssigned: boolean;
  assistantAvatar: string | null;
  assistantConnected: boolean;
  assistantNickname: string;
  draftArchitectSeats: Record<ForgeArchitectSeatId, ForgeUiArchitectSeatState>;
  featureId: string;
  locale: string;
  roomId: string;
  roomName: string;
  translations: Record<string, unknown>;
  userAvatar: string | null;
  userNickname: string;
}

export interface ForgeUiState {
  context: ForgeUiContextState;
  lastCommandResult: {
    command: string;
    message: string | null;
    success: boolean;
  } | null;
  pendingCommand: string | null;
  meta: {
    personaPresets: Record<string, unknown>;
    roleCatalog: Record<string, unknown>;
  };
  snapshot: ForgeRoomSnapshot;
}

export function createEmptyForgeRoomSnapshot(): ForgeRoomSnapshot {
  return {
    activeSessionId: null,
    contextDigest: null,
    currentGoal: null,
    draftTasks: [],
    draftSourceText: null,
    validationMessages: [],
    decisionTrace: [],
    approvedTasks: [],
    assignments: [],
    exports: [],
    exportSummary: {
      acceptanceCriteriaCount: 0,
      exportReady: false,
      missingRequirements: ["Select a synthesis"],
      openConflictCount: 0,
      reason: "Export blocked: no selected synthesis.",
      selectedSynthesisId: null,
      status: "blocked",
      targetRoomId: null,
    },
    responses: [],
    operatorProfile: createDefaultForgeOperatorProfile(),
    preflight: createEmptyForgePreflightState(),
    sessionContextSelection: createEmptyForgeSessionContextSelection(),
    runId: null,
    sessionRevision: 0,
    runOverride: null,
    runSignature: null,
    conflicts: [],
    syntheses: [],
    selectedSynthesisId: null,
    coordinatorState: {
      actorId: "coordinator",
      planStatus: "idle",
      assignmentQueueTotal: 0,
      pendingAssignmentCount: 0,
      completedResponseCount: 0,
      pendingConflictCount: 0,
      synthesisStatus: "idle",
      exportReady: false,
      lastExportPath: null,
      note: "Coordinator is idle.",
      lastUpdatedAt: "",
    },
    sessionList: [],
  };
}

export function createEmptyForgeUiContext(): ForgeUiContextState {
  return {
    assistantAssigned: false,
    assistantAvatar: null,
    assistantConnected: false,
    assistantNickname: "AI0",
    draftArchitectSeats: {
      ai1: {
        assigned: false,
        avatar: null,
        connected: false,
        nickname: "AI1",
        seatId: "ai1",
      },
      ai2: {
        assigned: false,
        avatar: null,
        connected: false,
        nickname: "AI2",
        seatId: "ai2",
      },
    },
    roomId: "forge-room",
    roomName: "Forge Room",
    featureId: "forge-workbench",
    locale: "en",
    translations: {},
    userAvatar: null,
    userNickname: "Operator",
  };
}

export function createInitialForgeUiState(): ForgeUiState {
  return {
    context: createEmptyForgeUiContext(),
    snapshot: createEmptyForgeRoomSnapshot(),
    lastCommandResult: null,
    pendingCommand: null,
    meta: {
      roleCatalog: {},
      personaPresets: {},
    },
  };
}
