import { normalizeRepairPanelSizes } from "../../shared/types/index.js";
import type { RepairRuntimeAction } from "./repair-runtime-actions.js";
import type { RepairRuntimeState } from "./repair-runtime-state.js";

const RECENT_READINGS_LIMIT = 32;

function eventIdsToEntityRefs(eventIds: string[]): Array<{ kind: "event"; id: string }> {
  return eventIds.map((id) => ({ kind: "event", id }));
}

function entityRefsToEventIds(refs: Array<{ kind: string; id: string }>): string[] {
  return refs.filter((ref) => ref.kind === "event").map((ref) => ref.id);
}

export function reduceRepairRuntimeState(
  state: RepairRuntimeState,
  action: RepairRuntimeAction
): RepairRuntimeState {
  // NOTE: Repair Room reducer keeps state transitions explicit so host runtime and
  // real-data orchestration can both flow through a single audit-friendly path.
  switch (action.type) {
    case "phase/set":
      return { ...state, phase: action.phase };
    case "session/hydrate":
      return {
        ...state,
        sessions: action.sessions,
        sessionList: action.sessionList,
        activeSessionId: action.activeSessionId,
      };
    case "session/activate":
      return { ...state, activeSessionId: action.sessionId };
    case "session/upsert": {
      const next = {
        ...state.sessions,
        [action.session.id]: action.session,
      };
      return { ...state, sessions: next };
    }
    case "session/delete": {
      const { [action.sessionId]: _deleted, ...nextSessions } = state.sessions;
      return {
        ...state,
        activeSessionId: state.activeSessionId === action.sessionId ? null : state.activeSessionId,
        sessions: nextSessions,
      };
    }
    case "session-list/set":
      return { ...state, sessionList: action.list };
    case "workbench/set-tool":
      return {
        ...state,
        workbench: { ...state.workbench, activeTool: action.tool },
      };
    case "workbench/set-frozen":
      return {
        ...state,
        workbench: {
          ...state.workbench,
          isFrozen: action.isFrozen,
          frozenAt: action.frozenAt,
        },
      };
    case "operations/live-preview-set":
      return {
        ...state,
        livePreview: action.preview,
      };
    case "workbench/set-cursor":
      return {
        ...state,
        workbench: {
          ...state.workbench,
          cursor: {
            xPx: action.xPx,
            yPx: action.yPx,
            gridX: action.gridX,
            gridY: action.gridY,
          },
        },
      };
    case "workbench/set-viewport":
      return {
        ...state,
        workbench: {
          ...state.workbench,
          viewport: {
            zoom: action.zoom,
            panXPx: action.panXPx,
            panYPx: action.panYPx,
          },
        },
      };
    case "workbench/set-timeline":
      return {
        ...state,
        workbench: {
          ...state.workbench,
          timeline: {
            playheadMs: action.playheadMs,
            zoom: action.zoom,
            rangeStartMs: action.rangeStartMs,
            rangeEndMs: action.rangeEndMs,
            autoFollowLive: action.autoFollowLive,
            replayMode: action.replayMode ?? state.workbench.timeline.replayMode,
            replaySpeed: action.replaySpeed ?? state.workbench.timeline.replaySpeed,
            isPlaying: action.isPlaying ?? state.workbench.timeline.isPlaying,
            liveEdgeMs: action.liveEdgeMs ?? state.workbench.timeline.liveEdgeMs,
          },
        },
      };
    case "workbench/toggle-layer":
      return {
        ...state,
        workbench: {
          ...state.workbench,
          visibleLayers: {
            ...state.workbench.visibleLayers,
            [action.layerId]: action.visible,
          },
        },
      };
    case "workbench/set-focus-event":
      return {
        ...state,
        workbench: {
          ...state.workbench,
          focusedEventId: action.eventId,
          selection: {
            ...state.workbench.selection,
            selectedEventIds: action.eventId === null ? [] : [action.eventId],
            selectedEntityRefs:
              action.eventId === null ? [] : [{ kind: "event", id: action.eventId }],
            inspectorEventId: action.eventId,
            inspectorEntityRef:
              action.eventId === null ? null : { kind: "event", id: action.eventId },
            focusJumpEventId: action.eventId,
            focusJumpEntityRef:
              action.eventId === null ? null : { kind: "event", id: action.eventId },
          },
        },
      };
    case "workbench/set-selection": {
      const selectedEntityRefs =
        "selectedEntityRefs" in action.selection
          ? (action.selection.selectedEntityRefs ?? [])
          : "selectedEventIds" in action.selection
            ? eventIdsToEntityRefs(action.selection.selectedEventIds ?? [])
            : state.workbench.selection.selectedEntityRefs;
      const selectedEventIds =
        "selectedEventIds" in action.selection
          ? (action.selection.selectedEventIds ?? [])
          : "selectedEntityRefs" in action.selection
            ? entityRefsToEventIds(action.selection.selectedEntityRefs ?? [])
            : state.workbench.selection.selectedEventIds;
      const inspectorEntityRef =
        "inspectorEntityRef" in action.selection
          ? (action.selection.inspectorEntityRef ?? null)
          : "inspectorEventId" in action.selection
            ? action.selection.inspectorEventId === null
              ? null
              : { kind: "event" as const, id: action.selection.inspectorEventId }
            : state.workbench.selection.inspectorEntityRef;
      const focusJumpEntityRef =
        "focusJumpEntityRef" in action.selection
          ? (action.selection.focusJumpEntityRef ?? null)
          : "focusJumpEventId" in action.selection
            ? action.selection.focusJumpEventId === null
              ? null
              : { kind: "event" as const, id: action.selection.focusJumpEventId }
            : state.workbench.selection.focusJumpEntityRef;
      const hoveredEntityRef =
        "hoveredEntityRef" in action.selection
          ? (action.selection.hoveredEntityRef ?? null)
          : "hoveredEventId" in action.selection
            ? action.selection.hoveredEventId === null
              ? null
              : { kind: "event" as const, id: action.selection.hoveredEventId }
            : state.workbench.selection.hoveredEntityRef;

      return {
        ...state,
        workbench: {
          ...state.workbench,
          focusedEventId:
            "focusedEventId" in action
              ? (action.focusedEventId ?? null)
              : state.workbench.focusedEventId,
          hoveredEventId:
            "hoveredEventId" in action.selection
              ? (action.selection.hoveredEventId ?? null)
              : state.workbench.hoveredEventId,
          selection: {
            ...state.workbench.selection,
            ...action.selection,
            hoveredEntityRef,
            selectedEventIds,
            selectedEntityRefs,
            inspectorEntityRef,
            focusJumpEntityRef,
          },
        },
      };
    }
    case "workbench/set-focus-mode":
      return {
        ...state,
        workbench: { ...state.workbench, focusMode: action.focusMode },
      };
    case "workbench/set-investigation-mode":
      return {
        ...state,
        workbench: { ...state.workbench, investigationModeEnabled: action.enabled },
      };
    case "workbench/focus-entity":
      return {
        ...state,
        workbench: {
          ...state.workbench,
          focusedEventId: action.eventId ?? null,
          selection: {
            ...state.workbench.selection,
            inspectorEventId: action.eventId ?? null,
            inspectorEntityRef: action.ref,
            focusJumpEventId: action.eventId ?? null,
            focusJumpEntityRef: action.ref,
          },
        },
      };
    case "events/append": {
      const target = state.sessions[action.sessionId];
      if (target === undefined) {
        return state;
      }
      const nextSession = {
        ...target,
        events: [...target.events, action.event],
        updatedAt: action.event.occurredAt,
      };
      return {
        ...state,
        sessions: { ...state.sessions, [action.sessionId]: nextSession },
      };
    }
    case "tactical-feed/set":
      return { ...state, tacticalFeed: action.items };
    case "tactical-feed/append":
      return {
        ...state,
        tacticalFeed: [...state.tacticalFeed, action.item],
      };
    case "wizard/set":
      return { ...state, wizard: action.wizard };
    case "wizard/advance":
      return {
        ...state,
        wizard: { ...state.wizard, currentStep: action.step },
      };
    case "wizard/patch-draft":
      return {
        ...state,
        wizard: {
          ...state.wizard,
          draft: {
            ...state.wizard.draft,
            ...action.patch,
          },
        },
      };
    case "knowledge-pack/set":
      return {
        ...state,
        knowledgePack: {
          pack: action.pack,
          attachedToSessionId: action.attachedToSessionId,
          previewTabId: state.knowledgePack.previewTabId,
          focusedSpatialRefId: state.knowledgePack.focusedSpatialRefId,
        },
      };
    case "knowledge-pack/set-preview-tab":
      return {
        ...state,
        knowledgePack: { ...state.knowledgePack, previewTabId: action.tabId },
      };
    case "knowledge-pack/set-spatial-focus":
      return {
        ...state,
        knowledgePack: { ...state.knowledgePack, focusedSpatialRefId: action.spatialRefId },
      };
    case "operator-profile/set":
      return {
        ...state,
        operatorAdaptation: action.adaptation,
        operatorProfile: action.profile,
      };
    case "measurement/append-reading": {
      const next = [action.reading, ...state.measurement.recent].slice(0, RECENT_READINGS_LIMIT);
      return {
        ...state,
        measurement: { ...state.measurement, recent: next },
      };
    }
    case "measurement/set-display":
      return {
        ...state,
        measurement: {
          ...state.measurement,
          current: {
            ...state.measurement.current,
            display: action.display,
            value: action.value,
            unit: action.unit,
            range: action.range,
            mode: action.mode,
            label: action.label,
            hold: action.hold,
          },
        },
      };
    case "measurement/set-instrument":
      return {
        ...state,
        measurement: {
          ...state.measurement,
          activeInstrumentKind: action.instrumentKind,
        },
      };
    case "chat/append-turn":
      return {
        ...state,
        chat: { ...state.chat, turns: [...state.chat.turns, action.turn] },
      };
    case "chat/set-turns":
      return {
        ...state,
        chat: { ...state.chat, turns: action.turns, pendingReplyId: null },
      };
    case "chat/set-composer":
      return {
        ...state,
        chat: { ...state.chat, composerDraft: action.draft },
      };
    case "chat/set-pending":
      return {
        ...state,
        chat: { ...state.chat, pendingReplyId: action.turnId },
      };
    case "ai-dispatch/set":
      return {
        ...state,
        aiDispatch: action.state,
      };
    case "ai-dispatch/set-target-slot":
      return {
        ...state,
        aiDispatch: {
          ...state.aiDispatch,
          targetSlot: action.targetSlot,
        },
      };
    case "layout/collapse-panel":
      return {
        ...state,
        layout: {
          ...state.layout,
          collapsedPanels: {
            ...state.layout.collapsedPanels,
            [action.panelId]: action.collapsed,
          },
        },
      };
    case "layout/set-panel-sizes":
      return {
        ...state,
        layout: {
          ...state.layout,
          panelSizes: normalizeRepairPanelSizes({
            ...state.layout.panelSizes,
            ...action.panelSizes,
            mainColumns: {
              ...state.layout.panelSizes.mainColumns,
              ...action.panelSizes.mainColumns,
            },
          }),
        },
      };
    case "layout/set-focus-mode":
      return {
        ...state,
        layout: { ...state.layout, focusMode: action.focusMode },
      };
    case "layout/set-operator-profile-tab":
      return {
        ...state,
        layout: { ...state.layout, operatorProfileTabId: action.tabId },
      };
    case "layout/set-operational-profile":
      return {
        ...state,
        layout: { ...state.layout, operationalProfile: action.profile },
      };
    case "layout/set-voice-guidance":
      return {
        ...state,
        layout: {
          ...state.layout,
          voiceGuidance: {
            ...state.layout.voiceGuidance,
            ...action.voiceGuidance,
          },
        },
      };
    case "layout/set-interaction-settings":
      return {
        ...state,
        layout: {
          ...state.layout,
          interactionSettings: {
            ...state.layout.interactionSettings,
            ...action.interactionSettings,
          },
        },
      };
    case "layout/set-settings-overlay":
      return {
        ...state,
        layout: {
          ...state.layout,
          settingsOverlayOpen: action.open ?? state.layout.settingsOverlayOpen,
          settingsOverlayTabId: action.tabId ?? state.layout.settingsOverlayTabId,
        },
      };
    case "layout/set-attention-budget":
      return {
        ...state,
        layout: {
          ...state.layout,
          attentionBudget: {
            ...state.layout.attentionBudget,
            ...action.attentionBudget,
          },
        },
      };
    case "operations/status-set":
      return {
        ...state,
        operationsStatus: action.status,
      };
    case "storage/set":
      return {
        ...state,
        storage: action.storage,
      };
    case "ambient/tick":
      return {
        ...state,
        ambientNowIso: action.nowIso,
        layout: { ...state.layout, ambientClock: action.nowIso },
      };
    default:
      return state;
  }
}
