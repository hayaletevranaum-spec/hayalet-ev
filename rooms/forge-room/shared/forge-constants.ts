export const FORGE_ROOM_ID = "forge-room";
export const FORGE_WORKBENCH_FEATURE_ID = "forge-workbench";
export const FORGE_SESSION_SCHEMA_VERSION = 10;
export const FORGE_HANDOFF_SCHEMA_VERSION = 2;
export const FORGE_LOCAL_OWNER_SCOPE_ID = "forge-room:local-owner";
export const FORGE_BREAKDOWN_MIN_TASKS = 3;
export const FORGE_BREAKDOWN_MAX_TASKS = 7;
export const FORGE_BREAKDOWN_MAX_REGENERATIONS = 1;
export const FORGE_PREFLIGHT_SCHEMA_VERSION = "v3";
export const FORGE_OPERATOR_PROFILE_SCHEMA_VERSION = 2;
export const FORGE_MAX_DECISION_TRACE_LINES = 3;
export const FORGE_MAX_CAPABILITY_ITEMS = 4;
export const FORGE_CAPABILITY_SUMMARY_BUDGET = 720;
export const FORGE_TASK_PROMPT_CONTEXT_BUDGET = 1800;

export const FORGE_UI_COMMANDS = {
  applyDraftText: "ForgeRoomApplyDraftText",
  approveDraft: "ForgeRoomApproveDraft",
  clearPreflight: "ForgeRoomClearPreflight",
  createSession: "ForgeRoomCreateSession",
  dispatchAssignments: "ForgeRoomDispatchAssignments",
  deleteSession: "ForgeRoomDeleteSession",
  exportHandoff: "ForgeRoomExportHandoff",
  exportHandoffCheck: "ForgeRoomExportHandoffCheck",
  generateDraft: "ForgeRoomGenerateDraft",
  generateSynthesis: "ForgeRoomGenerateSynthesis",
  loadSession: "ForgeRoomLoadSession",
  loadLatestSession: "ForgeRoomLoadLatestSession",
  removeDraftTask: "ForgeRoomRemoveDraftTask",
  resolveConflict: "ForgeRoomResolveConflict",
  runPreflight: "ForgeRoomRunPreflight",
  saveSession: "ForgeRoomSaveSession",
  selectSynthesis: "ForgeRoomSelectSynthesis",
  uiReady: "ForgeRoomUiReady",
  updateContextCapsule: "ForgeRoomUpdateContextCapsule",
  updateApprovedTask: "ForgeRoomUpdateApprovedTask",
  upsertDraftTask: "ForgeRoomUpsertDraftTask",
  updateGoal: "ForgeRoomUpdateGoal",
  updateOperatorProfile: "ForgeRoomUpdateOperatorProfile",
  updateSessionContext: "ForgeRoomUpdateSessionContext",
  updateRunOverride: "ForgeRoomUpdateRunOverride",
} as const;

export const FORGE_PROTOCOL_KEYS = {
  breakdownArchitect: "forge-room-breakdown-architect",
  preflightPreAnalysis: "forge-room-preflight-pre-analysis",
  synthesis: "forge-room-synthesis",
  taskResponse: "forge-room-task-response",
} as const;

export const FORGE_PROTOCOL_SCENARIOS = {
  breakdownArchitect: "forge-workbench-breakdown-architect",
  preflightPreAnalysis: "forge-workbench-preflight-pre-analysis",
  synthesis: "forge-workbench-synthesis",
  taskResponse: "forge-workbench-task-response",
} as const;
