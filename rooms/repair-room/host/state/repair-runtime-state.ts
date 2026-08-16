import { REPAIR_ROOM_ID } from "../../shared/repair-constants.js";
import {
  buildRepairAiAdaptation,
  buildTacticalFeedItems,
  createDefaultMeasurementState,
  createDefaultOperatorProfile,
  createDefaultWizardState,
} from "../../shared/data/index.js";
import {
  createRepairDefaultPanelSizes,
  type RepairAiAdaptationHints,
  type RepairChatState,
  type RepairChatTurn,
  type RepairLayoutState,
  type RepairMeasurementState,
  type RepairOperatorProfile,
  type RepairOverlayLayerId,
  type RepairPanelId,
  type RepairLivePreviewState,
  type RepairSession,
  type RepairSessionListItem,
  type RepairWizardState,
  type RepairWorkbenchState,
} from "../../shared/types/index.js";
import type {
  RepairAiDispatchState,
  RepairKnowledgePackPanelState,
  RepairOperationsSnapshot,
  RepairStorageState,
  RepairTacticalFeedItem,
  RepairUiPhase,
} from "../../shared/ui/state.js";
import {
  createRepairDefaultAiDispatchState,
  createRepairDefaultStorageState,
} from "../../shared/ui/state.js";

export interface RepairRuntimeSeedData {
  activeSessionId: string | null;
  chatTurns?: RepairChatTurn[];
  sessionList: RepairSessionListItem[];
  sessions: Record<string, RepairSession>;
}

export interface RepairRuntimeState {
  roomId: string;
  phase: RepairUiPhase;
  activeSessionId: string | null;
  sessionList: RepairSessionListItem[];
  sessions: Record<string, RepairSession>;
  workbench: RepairWorkbenchState;
  tacticalFeed: RepairTacticalFeedItem[];
  wizard: RepairWizardState;
  knowledgePack: RepairKnowledgePackPanelState;
  operatorProfile: RepairOperatorProfile;
  operatorAdaptation: RepairAiAdaptationHints;
  measurement: RepairMeasurementState;
  chat: RepairChatState;
  layout: RepairLayoutState;
  operationsStatus: RepairOperationsSnapshot | null;
  livePreview: RepairLivePreviewState | null;
  aiDispatch: RepairAiDispatchState;
  storage: RepairStorageState;
  ambientNowIso: string;
}

function createCollapsedPanelMap(): Record<RepairPanelId, boolean> {
  return {
    "session-rail": false,
    "workbench-stage": false,
    "tactical-feed": false,
    "session-wizard": false,
    "knowledge-pack": false,
    "visual-timeline": false,
    "operator-profile": false,
  };
}

function createVisibleLayersMap(): Record<RepairOverlayLayerId, boolean> {
  return {
    grid: true,
    "ai-marks": true,
    annotations: true,
    "measurement-pins": true,
    focus: true,
    "operator-annotations": true,
    "ai-annotations": true,
    measurements: true,
    risks: true,
    notes: true,
    knowledge: true,
  };
}

export function createInitialRepairRuntimeState(
  nowIso: string,
  seed: RepairRuntimeSeedData = {
    activeSessionId: null,
    sessionList: [],
    sessions: {},
  }
): RepairRuntimeState {
  const activeSession =
    seed.activeSessionId === null ? null : (seed.sessions[seed.activeSessionId] ?? null);
  const activeSessionDurationMs =
    activeSession === null
      ? 0
      : Math.max(0, Date.parse(activeSession.updatedAt) - Date.parse(activeSession.startedAt));
  const tacticalFeed =
    activeSession === null
      ? []
      : buildTacticalFeedItems(activeSession.events, activeSession.startedAt).slice(0, 3);

  const defaultProfile = createDefaultOperatorProfile();

  return {
    roomId: REPAIR_ROOM_ID,
    phase: activeSession === null ? "idle" : "session-active",
    activeSessionId: activeSession?.id ?? null,
    sessionList: seed.sessionList,
    sessions: seed.sessions,
    workbench: {
      activeTool: "select",
      isFrozen: false,
      frozenAt: null,
      viewport: { zoom: 1, panXPx: 0, panYPx: 0 },
      timeline: {
        playheadMs: activeSessionDurationMs,
        zoom: 1,
        rangeStartMs: null,
        rangeEndMs: null,
        autoFollowLive: true,
        replayMode: "live",
        replaySpeed: 1,
        isPlaying: true,
        liveEdgeMs: activeSessionDurationMs,
      },
      cursor: { xPx: 1280, yPx: 720, gridX: 16, gridY: 16 },
      liveSource: { available: true, connected: false, sourceType: "image" },
      visibleLayers: createVisibleLayersMap(),
      hoveredEventId: null,
      focusedEventId: null,
      selection: {
        hoveredEventId: null,
        hoveredEntityRef: null,
        selectedEventIds: [],
        selectedEntityRefs: [],
        inspectorEventId: null,
        inspectorEntityRef: null,
        focusJumpEventId: null,
        focusJumpEntityRef: null,
      },
      contextualCursor: "inspect",
      operationalMode: "live",
      aiMarks: [],
      measurementEvidence: [],
      focusMode: false,
      investigationModeEnabled: false,
    },
    tacticalFeed,
    wizard: createDefaultWizardState(),
    knowledgePack: {
      pack: activeSession?.knowledgePack ?? null,
      attachedToSessionId: activeSession?.id ?? null,
      previewTabId: "schematic-preview",
      focusedSpatialRefId: null,
    },
    operatorProfile: defaultProfile,
    operatorAdaptation: buildRepairAiAdaptation(defaultProfile),
    measurement: createDefaultMeasurementState(),
    chat: {
      turns: activeSession === null ? [] : (seed.chatTurns ?? []),
      composerDraft: "",
      pendingReplyId: null,
    },
    layout: {
      collapsedPanels: createCollapsedPanelMap(),
      panelSizes: createRepairDefaultPanelSizes(),
      operationalProfile: "novice",
      voiceGuidance: {
        ambientListeningState: "idle",
        spokenGuidanceMode: "brief",
        handsBusyMode: false,
      },
      interactionSettings: {
        androidCompanionEnabled: true,
        dictationRoute: "local",
        ttsRoute: "local",
        cameraFeedPreference: "manual",
        dictationSubmitMode: "composer",
        autoReadAiReplies: true,
      },
      attentionBudget: {
        windowMs: 180000,
        maxAiInterruptions: 2,
      },
      operatorProfileTabId: "tools",
      settingsOverlayOpen: false,
      settingsOverlayTabId: "repair-controls",
      focusMode: false,
      ambientClock: nowIso,
    },
    operationsStatus: null,
    livePreview: null,
    aiDispatch: createRepairDefaultAiDispatchState("ai2"),
    storage: createRepairDefaultStorageState(seed.sessionList.length),
    ambientNowIso: nowIso,
  };
}
