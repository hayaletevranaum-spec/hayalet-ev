import { REPAIR_UI_COMMANDS } from "../repair-constants.js";
import type { RepairAiTargetSlot } from "./state.js";
import type {
  RepairAmbientListeningState,
  RepairCameraFeedPreference,
  RepairDictationRoute,
  RepairDictationSubmitMode,
  RepairImageRect,
  RepairOverlayEntityRef,
  RepairSettingsOverlayTabId,
  RepairSpokenGuidanceMode,
  RepairTtsRoute,
} from "../types/index.js";

type RepairRoomApi = NonNullable<typeof window.roomAPI>;

function getRoomApi(): RepairRoomApi | null {
  return window.roomAPI ?? null;
}

function sendCommand(command: string, payload: Record<string, unknown> = {}): boolean {
  const roomApi = getRoomApi();
  if (roomApi === null || typeof roomApi.sendCommand !== "function") {
    return false;
  }
  return roomApi.sendCommand(command, payload);
}

export function createRepairUiRequestRuntime() {
  return {
    notifyUiReady() {
      return sendCommand(REPAIR_UI_COMMANDS.uiReady);
    },
    activateSession(payload: { sessionId: string }) {
      return sendCommand(REPAIR_UI_COMMANDS.activateSession, payload);
    },
    createSession(payload: Record<string, unknown> = {}) {
      return sendCommand(REPAIR_UI_COMMANDS.createSession, payload);
    },
    updateSession(payload: Record<string, unknown>) {
      return sendCommand(REPAIR_UI_COMMANDS.updateSession, payload);
    },
    archiveSession(payload: { sessionId: string }) {
      return sendCommand(REPAIR_UI_COMMANDS.archiveSession, payload);
    },
    deleteSession(payload: { sessionId: string }) {
      return sendCommand(REPAIR_UI_COMMANDS.deleteSession, payload);
    },
    advanceWizard(payload: { step?: string } = {}) {
      return sendCommand(REPAIR_UI_COMMANDS.advanceWizard, payload);
    },
    startKnowledgeResearch(payload: { targetSlot?: RepairAiTargetSlot } = {}) {
      return sendCommand(REPAIR_UI_COMMANDS.startKnowledgeResearch, payload);
    },
    skipKnowledgeResearch() {
      return sendCommand(REPAIR_UI_COMMANDS.skipKnowledgeResearch);
    },
    updateEvidenceSelection(payload: {
      selectedEvidenceResourceIds?: string[];
      selectedFailureIds?: string[];
      selectedTestPointIds?: string[];
    }) {
      return sendCommand(REPAIR_UI_COMMANDS.updateEvidenceSelection, payload);
    },
    addKnowledgeResource(payload: { kind?: string; label: string; url: string }) {
      return sendCommand(REPAIR_UI_COMMANDS.addKnowledgeResource, payload);
    },
    addKnowledgeFailure(payload: Record<string, unknown>) {
      return sendCommand(REPAIR_UI_COMMANDS.addKnowledgeFailure, payload);
    },
    addKnowledgeTestPoint(payload: Record<string, unknown>) {
      return sendCommand(REPAIR_UI_COMMANDS.addKnowledgeTestPoint, payload);
    },
    addKnowledgeNote(payload: Record<string, unknown>) {
      return sendCommand(REPAIR_UI_COMMANDS.addKnowledgeNote, payload);
    },
    removeKnowledgeEvidence(payload: { kind: string; id: string }) {
      return sendCommand(REPAIR_UI_COMMANDS.removeKnowledgeEvidence, payload);
    },
    attachKnowledgePack(payload: { packId: string }) {
      return sendCommand(REPAIR_UI_COMMANDS.attachKnowledgePack, payload);
    },
    setActiveTool(payload: { tool: string }) {
      return sendCommand(REPAIR_UI_COMMANDS.setActiveTool, payload);
    },
    toggleFreezeFrame() {
      return sendCommand(REPAIR_UI_COMMANDS.toggleFreezeFrame);
    },
    toggleOverlayLayer(payload: { layerId: string; visible: boolean }) {
      return sendCommand(REPAIR_UI_COMMANDS.toggleOverlayLayer, payload);
    },
    addTimelineEvent(payload: Record<string, unknown>) {
      return sendCommand(REPAIR_UI_COMMANDS.addTimelineEvent, payload);
    },
    jumpToEvent(payload: { eventId: string }) {
      return sendCommand(REPAIR_UI_COMMANDS.jumpToEvent, payload);
    },
    scrubTimeline(payload: { positionMs: number }) {
      return sendCommand(REPAIR_UI_COMMANDS.scrubTimeline, payload);
    },
    addMeasurement(payload: Record<string, unknown>) {
      return sendCommand(REPAIR_UI_COMMANDS.addMeasurement, payload);
    },
    dismissAiMark(payload: { eventId: string; state?: string; reason?: string }) {
      return sendCommand(REPAIR_UI_COMMANDS.dismissAiMark, payload);
    },
    setAiTargetSlot(payload: { targetSlot: RepairAiTargetSlot }) {
      return sendCommand(REPAIR_UI_COMMANDS.setAiTargetSlot, payload);
    },
    sendChatTurn(payload: { text: string }) {
      return sendCommand(REPAIR_UI_COMMANDS.sendChatTurn, payload);
    },
    setChatComposer(payload: { draft: string }) {
      return sendCommand(REPAIR_UI_COMMANDS.setChatComposer, payload);
    },
    updateOperatorProfile(payload: Record<string, unknown>) {
      return sendCommand(REPAIR_UI_COMMANDS.updateOperatorProfile, payload);
    },
    updateViewport(payload: Record<string, unknown>) {
      return sendCommand(REPAIR_UI_COMMANDS.updateViewport, payload);
    },
    updateTimeline(payload: Record<string, unknown>) {
      return sendCommand(REPAIR_UI_COMMANDS.updateTimeline, payload);
    },
    updatePanelLayout(payload: Record<string, unknown>) {
      return sendCommand(REPAIR_UI_COMMANDS.updatePanelLayout, payload);
    },
    updatePanelTab(payload: Record<string, unknown>) {
      return sendCommand(REPAIR_UI_COMMANDS.updatePanelTab, payload);
    },
    updateFocus(payload: Record<string, unknown>) {
      return sendCommand(REPAIR_UI_COMMANDS.updateFocus, payload);
    },
    setOperationalProfile(payload: { profile: "novice" | "advanced" }) {
      return sendCommand(REPAIR_UI_COMMANDS.setOperationalProfile, payload);
    },
    setVoiceGuidance(payload: {
      ambientListeningState?: RepairAmbientListeningState;
      spokenGuidanceMode?: RepairSpokenGuidanceMode;
      handsBusyMode?: boolean;
    }) {
      return sendCommand(REPAIR_UI_COMMANDS.setVoiceGuidance, payload);
    },
    setInteractionSettings(payload: {
      androidCompanionEnabled?: boolean;
      dictationRoute?: RepairDictationRoute;
      ttsRoute?: RepairTtsRoute;
      cameraFeedPreference?: RepairCameraFeedPreference;
      dictationSubmitMode?: RepairDictationSubmitMode;
      autoReadAiReplies?: boolean;
    }) {
      return sendCommand(REPAIR_UI_COMMANDS.setInteractionSettings, payload);
    },
    setSettingsOverlay(payload: { open?: boolean; tabId?: RepairSettingsOverlayTabId }) {
      return sendCommand(REPAIR_UI_COMMANDS.setSettingsOverlay, payload);
    },
    startDictation() {
      return sendCommand(REPAIR_UI_COMMANDS.startDictation);
    },
    stopDictation() {
      return sendCommand(REPAIR_UI_COMMANDS.stopDictation);
    },
    startAmbientListener() {
      return sendCommand(REPAIR_UI_COMMANDS.startAmbientListener);
    },
    stopAmbientListener() {
      return sendCommand(REPAIR_UI_COMMANDS.stopAmbientListener);
    },
    startCameraFeed() {
      return sendCommand(REPAIR_UI_COMMANDS.startCameraFeed);
    },
    stopCameraFeed() {
      return sendCommand(REPAIR_UI_COMMANDS.stopCameraFeed);
    },
    capturePhoto() {
      return sendCommand(REPAIR_UI_COMMANDS.capturePhoto);
    },
    setCameraTorch(payload: { enabled: boolean }) {
      return sendCommand(REPAIR_UI_COMMANDS.setCameraTorch, payload);
    },
    speakGuidance(payload: { text?: string } = {}) {
      return sendCommand(REPAIR_UI_COMMANDS.speakGuidance, payload);
    },
    stopSpeech() {
      return sendCommand(REPAIR_UI_COMMANDS.stopSpeech);
    },
    setAttentionBudget(payload: { windowMs?: number; maxAiInterruptions?: number }) {
      return sendCommand(REPAIR_UI_COMMANDS.setAttentionBudget, payload);
    },
    toggleInvestigationMode(payload: { enabled?: boolean } = {}) {
      return sendCommand(REPAIR_UI_COMMANDS.toggleInvestigationMode, payload);
    },
    selectOverlayEntities(payload: {
      refs: RepairOverlayEntityRef[];
      mode?: "replace" | "add" | "toggle";
      inspectorRef?: RepairOverlayEntityRef | null;
      focusJump?: boolean;
    }) {
      return sendCommand(REPAIR_UI_COMMANDS.selectOverlayEntities, payload);
    },
    focusOverlayEntity(payload: { ref: RepairOverlayEntityRef; focusJump?: boolean }) {
      return sendCommand(REPAIR_UI_COMMANDS.focusOverlayEntity, payload);
    },
    focusInvestigationRegion(payload: { regionId: string }) {
      return sendCommand(REPAIR_UI_COMMANDS.focusInvestigationRegion, payload);
    },
    focusKnowledgeSpatialRef(payload: { spatialRefId: string }) {
      return sendCommand(REPAIR_UI_COMMANDS.focusKnowledgeSpatialRef, payload);
    },
    promoteKnowledgeRegion(payload: {
      spatialRefId: string;
      label?: string;
      region?: RepairImageRect;
    }) {
      return sendCommand(REPAIR_UI_COMMANDS.promoteKnowledgeRegion, payload);
    },
    focusLiveEdge() {
      return sendCommand(REPAIR_UI_COMMANDS.focusLiveEdge);
    },
  };
}
