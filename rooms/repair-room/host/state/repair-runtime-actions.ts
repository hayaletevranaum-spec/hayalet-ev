import type {
  RepairAiAdaptationHints,
  RepairAttentionBudgetState,
  RepairChatTurn,
  RepairEvent,
  RepairInstrumentKind,
  RepairInteractionSettingsState,
  RepairKnowledgePack,
  RepairLivePreviewState,
  RepairMultimeterMode,
  RepairMultimeterReading,
  RepairOperationalProfile,
  RepairOperatorProfile,
  RepairOverlayEntityRef,
  RepairOperatorProfileTabId,
  RepairOverlayLayerId,
  RepairOverlaySelectionState,
  RepairPanelId,
  RepairPanelSizePatch,
  RepairReplayMode,
  RepairSettingsOverlayTabId,
  RepairSession,
  RepairSessionListItem,
  RepairVoiceGuidanceState,
  RepairWizardState,
  RepairWizardDraft,
  RepairWorkbenchTool,
} from "../../shared/types/index.js";
import type {
  RepairAiDispatchState,
  RepairAiTargetSlot,
  RepairOperationsSnapshot,
  RepairStorageState,
  RepairTacticalFeedItem,
  RepairUiPhase,
} from "../../shared/ui/state.js";

export type RepairRuntimeAction =
  | { type: "phase/set"; phase: RepairUiPhase }
  | {
      type: "session/hydrate";
      activeSessionId: string | null;
      sessions: Record<string, RepairSession>;
      sessionList: RepairSessionListItem[];
    }
  | {
      type: "session/activate";
      sessionId: string | null;
    }
  | {
      type: "session/upsert";
      session: RepairSession;
    }
  | {
      type: "session/delete";
      sessionId: string;
    }
  | {
      type: "session-list/set";
      list: RepairSessionListItem[];
    }
  | {
      type: "workbench/set-tool";
      tool: RepairWorkbenchTool;
    }
  | {
      type: "workbench/set-frozen";
      isFrozen: boolean;
      frozenAt: string | null;
    }
  | {
      type: "workbench/set-cursor";
      xPx: number;
      yPx: number;
      gridX: number;
      gridY: number;
    }
  | {
      type: "workbench/set-viewport";
      zoom: number;
      panXPx: number;
      panYPx: number;
    }
  | {
      type: "workbench/set-timeline";
      playheadMs: number;
      zoom: number;
      rangeStartMs: number | null;
      rangeEndMs: number | null;
      autoFollowLive: boolean;
      replayMode?: RepairReplayMode;
      replaySpeed?: number;
      isPlaying?: boolean;
      liveEdgeMs?: number;
    }
  | {
      type: "workbench/toggle-layer";
      layerId: RepairOverlayLayerId;
      visible: boolean;
    }
  | {
      type: "workbench/set-focus-event";
      eventId: string | null;
    }
  | {
      type: "workbench/set-selection";
      selection: Partial<RepairOverlaySelectionState>;
      focusedEventId?: string | null;
    }
  | {
      type: "workbench/set-focus-mode";
      focusMode: boolean;
    }
  | {
      type: "workbench/set-investigation-mode";
      enabled: boolean;
    }
  | {
      type: "workbench/focus-entity";
      ref: RepairOverlayEntityRef | null;
      eventId?: string | null;
    }
  | {
      type: "events/append";
      sessionId: string;
      event: RepairEvent;
    }
  | {
      type: "tactical-feed/set";
      items: RepairTacticalFeedItem[];
    }
  | {
      type: "tactical-feed/append";
      item: RepairTacticalFeedItem;
    }
  | {
      type: "wizard/set";
      wizard: RepairWizardState;
    }
  | {
      type: "wizard/advance";
      step: RepairWizardState["currentStep"];
    }
  | {
      type: "wizard/patch-draft";
      patch: Partial<RepairWizardDraft>;
    }
  | {
      type: "knowledge-pack/set";
      pack: RepairKnowledgePack | null;
      attachedToSessionId: string | null;
    }
  | {
      type: "knowledge-pack/set-preview-tab";
      tabId: "schematic-preview" | "board-view" | "notes";
    }
  | {
      type: "knowledge-pack/set-spatial-focus";
      spatialRefId: string | null;
    }
  | {
      type: "measurement/set-instrument";
      instrumentKind: RepairInstrumentKind;
    }
  | {
      type: "operator-profile/set";
      adaptation: RepairAiAdaptationHints;
      profile: RepairOperatorProfile;
    }
  | {
      type: "measurement/append-reading";
      reading: RepairMultimeterReading;
    }
  | {
      type: "measurement/set-display";
      display: string;
      value: number | null;
      unit: string;
      range: string;
      mode: RepairMultimeterMode;
      label: string;
      hold: boolean;
    }
  | {
      type: "chat/append-turn";
      turn: RepairChatTurn;
    }
  | {
      type: "chat/set-turns";
      turns: RepairChatTurn[];
    }
  | {
      type: "chat/set-composer";
      draft: string;
    }
  | {
      type: "chat/set-pending";
      turnId: string | null;
    }
  | {
      type: "layout/collapse-panel";
      panelId: RepairPanelId;
      collapsed: boolean;
    }
  | {
      type: "layout/set-panel-sizes";
      panelSizes: RepairPanelSizePatch;
    }
  | {
      type: "layout/set-focus-mode";
      focusMode: boolean;
    }
  | {
      type: "layout/set-operator-profile-tab";
      tabId: RepairOperatorProfileTabId;
    }
  | {
      type: "layout/set-operational-profile";
      profile: RepairOperationalProfile;
    }
  | {
      type: "layout/set-voice-guidance";
      voiceGuidance: Partial<RepairVoiceGuidanceState>;
    }
  | {
      type: "layout/set-interaction-settings";
      interactionSettings: Partial<RepairInteractionSettingsState>;
    }
  | {
      type: "layout/set-settings-overlay";
      open?: boolean;
      tabId?: RepairSettingsOverlayTabId;
    }
  | {
      type: "layout/set-attention-budget";
      attentionBudget: Partial<RepairAttentionBudgetState>;
    }
  | {
      type: "operations/status-set";
      status: RepairOperationsSnapshot | null;
    }
  | {
      type: "operations/live-preview-set";
      preview: RepairLivePreviewState | null;
    }
  | {
      type: "storage/set";
      storage: RepairStorageState;
    }
  | {
      type: "ai-dispatch/set";
      state: RepairAiDispatchState;
    }
  | {
      type: "ai-dispatch/set-target-slot";
      targetSlot: RepairAiTargetSlot;
    }
  | {
      type: "ambient/tick";
      nowIso: string;
    };
