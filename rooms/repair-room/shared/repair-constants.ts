export const REPAIR_ROOM_ID = "repair-room";
export const REPAIR_WORKBENCH_FEATURE_ID = "repair-workbench";
export const REPAIR_SESSION_SCHEMA_VERSION = 2;
export const REPAIR_KNOWLEDGE_PACK_SCHEMA_VERSION = 1;
export const REPAIR_OPERATOR_PROFILE_SCHEMA_VERSION = 1;
export const REPAIR_LOCAL_OWNER_SCOPE_ID = "repair-room:local-owner";

// NOTE: Tactical-feed cadence is intentionally calibrated to feel like a live observation stream
// rather than a synchronous batch.
export const REPAIR_FEED_EVENT_MIN_DELAY_MS = 1200;
export const REPAIR_FEED_EVENT_MAX_DELAY_MS = 3000;
export const REPAIR_MEASUREMENT_DRIFT_INTERVAL_MS = 1100;
export const REPAIR_AMBIENT_CLOCK_INTERVAL_MS = 1000;

export const REPAIR_AI_RETRY_MAX_ATTEMPTS = 3;
export const REPAIR_AI_RETRY_BASE_DELAY_MS = 1000;
export const REPAIR_AI_RETRY_MAX_DELAY_MS = 8000;
export const REPAIR_AI_MIN_RESOURCE_CONFIDENCE = 0.5;
export const REPAIR_AI_RESOURCE_CONFIDENCE_REVIEW = 0.7;

export const REPAIR_UI_COLORS = {
  amber: "rgb(232, 168, 87)",
  cyan: "rgb(86, 200, 222)",
  risk: "rgb(217, 122, 122)",
} as const;

export const REPAIR_UI_COMMANDS = {
  uiReady: "RepairRoomUiReady",
  activateSession: "RepairRoomActivateSession",
  createSession: "RepairRoomCreateSession",
  updateSession: "RepairRoomUpdateSession",
  archiveSession: "RepairRoomArchiveSession",
  deleteSession: "RepairRoomDeleteSession",
  advanceWizard: "RepairRoomAdvanceWizard",
  startKnowledgeResearch: "RepairRoomStartKnowledgeResearch",
  skipKnowledgeResearch: "RepairRoomSkipKnowledgeResearch",
  updateEvidenceSelection: "RepairRoomUpdateEvidenceSelection",
  addKnowledgeResource: "RepairRoomAddKnowledgeResource",
  addKnowledgeFailure: "RepairRoomAddKnowledgeFailure",
  addKnowledgeTestPoint: "RepairRoomAddKnowledgeTestPoint",
  addKnowledgeNote: "RepairRoomAddKnowledgeNote",
  removeKnowledgeEvidence: "RepairRoomRemoveKnowledgeEvidence",
  attachKnowledgePack: "RepairRoomAttachKnowledgePack",
  setActiveTool: "RepairRoomSetActiveTool",
  toggleFreezeFrame: "RepairRoomToggleFreezeFrame",
  toggleOverlayLayer: "RepairRoomToggleOverlayLayer",
  addTimelineEvent: "RepairRoomAddTimelineEvent",
  jumpToEvent: "RepairRoomJumpToEvent",
  scrubTimeline: "RepairRoomScrubTimeline",
  addMeasurement: "RepairRoomAddMeasurement",
  dismissAiMark: "RepairRoomDismissAiMark",
  setAiTargetSlot: "RepairRoomSetAiTargetSlot",
  sendChatTurn: "RepairRoomSendChatTurn",
  setChatComposer: "RepairRoomSetChatComposer",
  updateOperatorProfile: "RepairRoomUpdateOperatorProfile",
  updateViewport: "RepairRoomUpdateViewport",
  updateTimeline: "RepairRoomUpdateTimeline",
  updatePanelLayout: "RepairRoomUpdatePanelLayout",
  updatePanelTab: "RepairRoomUpdatePanelTab",
  updateFocus: "RepairRoomUpdateFocus",
  setOperationalProfile: "RepairRoomSetOperationalProfile",
  setVoiceGuidance: "RepairRoomSetVoiceGuidance",
  setInteractionSettings: "RepairRoomSetInteractionSettings",
  setSettingsOverlay: "RepairRoomSetSettingsOverlay",
  startDictation: "RepairRoomStartDictation",
  stopDictation: "RepairRoomStopDictation",
  startAmbientListener: "RepairRoomStartAmbientListener",
  stopAmbientListener: "RepairRoomStopAmbientListener",
  startCameraFeed: "RepairRoomStartCameraFeed",
  stopCameraFeed: "RepairRoomStopCameraFeed",
  capturePhoto: "RepairRoomCapturePhoto",
  setCameraTorch: "RepairRoomSetCameraTorch",
  speakGuidance: "RepairRoomSpeakGuidance",
  stopSpeech: "RepairRoomStopSpeech",
  setAttentionBudget: "RepairRoomSetAttentionBudget",
  toggleInvestigationMode: "RepairRoomToggleInvestigationMode",
  selectOverlayEntities: "RepairRoomSelectOverlayEntities",
  focusOverlayEntity: "RepairRoomFocusOverlayEntity",
  focusInvestigationRegion: "RepairRoomFocusInvestigationRegion",
  focusKnowledgeSpatialRef: "RepairRoomFocusKnowledgeSpatialRef",
  promoteKnowledgeRegion: "RepairRoomPromoteKnowledgeRegion",
  focusLiveEdge: "RepairRoomFocusLiveEdge",
} as const;

export type RepairUiCommandName = (typeof REPAIR_UI_COMMANDS)[keyof typeof REPAIR_UI_COMMANDS];

export const REPAIR_PROTOCOL_KEYS = {
  assistantChat: "repair-room-assistant-chat",
  assistantEvidence: "repair-room-assistant-evidence",
  assistantObservation: "repair-room-assistant-observation",
  assistantRiskScan: "repair-room-assistant-risk-scan",
} as const;

export const REPAIR_PROTOCOL_SCENARIOS = {
  assistantChat: "repair-workbench-assistant-chat",
  assistantEvidence: "repair-workbench-assistant-evidence",
  assistantObservation: "repair-workbench-assistant-observation",
  assistantRiskScan: "repair-workbench-assistant-risk-scan",
} as const;

export const REPAIR_HOST_MESSAGES = {
  state: "repair-state",
  feedEvent: "repair-feed-event",
  measurementReading: "repair-measurement-reading",
  chatReply: "repair-chat-reply",
  researchProgress: "repair-research-progress",
} as const;

export type RepairHostMessageType =
  (typeof REPAIR_HOST_MESSAGES)[keyof typeof REPAIR_HOST_MESSAGES];
