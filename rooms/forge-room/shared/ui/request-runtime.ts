import { FORGE_UI_COMMANDS } from "../forge-constants.js";

type ForgeRoomApi = NonNullable<typeof window.roomAPI>;

function getRoomApi(): ForgeRoomApi | null {
  return window.roomAPI ?? null;
}

function sendCommand(command: string, payload: Record<string, unknown> = {}): boolean {
  const roomApi = getRoomApi();
  if (roomApi === null || typeof roomApi.sendCommand !== "function") {
    return false;
  }
  return roomApi.sendCommand(command, payload);
}

export function createForgeUiRequestRuntime() {
  return {
    applyDraftText(payload: { draftText: string }) {
      return sendCommand(FORGE_UI_COMMANDS.applyDraftText, payload);
    },
    approveDraft() {
      return sendCommand(FORGE_UI_COMMANDS.approveDraft);
    },
    clearPreflight() {
      return sendCommand(FORGE_UI_COMMANDS.clearPreflight);
    },
    createSession(payload: { persist?: boolean } = {}) {
      return sendCommand(FORGE_UI_COMMANDS.createSession, payload);
    },
    dispatchAssignments() {
      return sendCommand(FORGE_UI_COMMANDS.dispatchAssignments);
    },
    deleteSession(payload: { sessionId?: string }) {
      return sendCommand(FORGE_UI_COMMANDS.deleteSession, payload);
    },
    exportHandoff() {
      return sendCommand(FORGE_UI_COMMANDS.exportHandoff);
    },
    exportHandoffCheck() {
      return sendCommand(FORGE_UI_COMMANDS.exportHandoffCheck);
    },
    generateDraft(payload: {
      architectSeatId: "ai1" | "ai2";
      brief: string;
      constraints: string[];
      summary: string;
      targetRoomId: string;
    }) {
      return sendCommand(FORGE_UI_COMMANDS.generateDraft, payload);
    },
    generateSynthesis() {
      return sendCommand(FORGE_UI_COMMANDS.generateSynthesis);
    },
    loadSession(payload: { sessionId: string }) {
      return sendCommand(FORGE_UI_COMMANDS.loadSession, payload);
    },
    loadLatestSession() {
      return sendCommand(FORGE_UI_COMMANDS.loadLatestSession);
    },
    notifyUiReady() {
      return sendCommand(FORGE_UI_COMMANDS.uiReady);
    },
    runPreflight() {
      return sendCommand(FORGE_UI_COMMANDS.runPreflight);
    },
    resolveConflict(payload: {
      conflictId: string;
      preferredResponseId?: string | null;
      resolutionNote?: string | null;
      status: "open" | "resolved";
    }) {
      return sendCommand(FORGE_UI_COMMANDS.resolveConflict, payload);
    },
    removeDraftTask(payload: { taskId: string }) {
      return sendCommand(FORGE_UI_COMMANDS.removeDraftTask, payload);
    },
    saveSession() {
      return sendCommand(FORGE_UI_COMMANDS.saveSession);
    },
    selectSynthesis(payload: { synthesisId: string }) {
      return sendCommand(FORGE_UI_COMMANDS.selectSynthesis, payload);
    },
    updateContextCapsule(payload: {
      constraints: string[];
      relevantModules: string[];
      summary: string;
      taskId: string;
    }) {
      return sendCommand(FORGE_UI_COMMANDS.updateContextCapsule, payload);
    },
    updateApprovedTask(payload: {
      compareSeatIds: string[];
      dispatchMode: string;
      personaPresetId: string | null;
      roleId: string;
      seatId: string;
      taskId: string;
    }) {
      return sendCommand(FORGE_UI_COMMANDS.updateApprovedTask, payload);
    },
    upsertDraftTask(payload: {
      checklist: string[];
      compareSeatIds: string[];
      dispatchMode: string;
      personaPresetId: string | null;
      roleId: string;
      seatId: string;
      summary: string;
      taskId?: string;
      title: string;
    }) {
      return sendCommand(FORGE_UI_COMMANDS.upsertDraftTask, payload);
    },
    updateGoal(payload: {
      brief: string;
      constraints: string[];
      summary: string;
      targetRoomId: string;
    }) {
      return sendCommand(FORGE_UI_COMMANDS.updateGoal, payload);
    },
    updateOperatorProfile(payload: {
      equipment: Array<{
        brandModel?: string;
        equipmentKey: string;
        label: string;
        notes?: string;
        status: string;
      }>;
      preferences?: {
        mode?: string;
        riskTolerance?: string;
      };
      skills: Array<{
        label: string;
        level: string;
        notes?: string;
        skillKey: string;
      }>;
    }) {
      return sendCommand(FORGE_UI_COMMANDS.updateOperatorProfile, payload);
    },
    updateSessionContext(payload: {
      equipmentKeys?: string[];
      preferenceKeys?: string[];
      skillKeys?: string[];
    }) {
      return sendCommand(FORGE_UI_COMMANDS.updateSessionContext, payload);
    },
    updateRunOverride(payload: {
      architectSeatId: "ai1" | "ai2";
      enableRovoPreAnalysis: boolean;
      mode?: string;
      notes: string;
      riskTolerance?: string;
      temporaryConditions: string[];
    }) {
      return sendCommand(FORGE_UI_COMMANDS.updateRunOverride, payload);
    },
  };
}
