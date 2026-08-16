import { repairEventToTacticalFeedItem } from "../../shared/data/index.js";
import type { RepairSession } from "../../shared/types/index.js";
import type { RepairTacticalFeedItem } from "../../shared/ui/state.js";
import type { RepairUiSnapshotMeta, RepairUiState } from "../../shared/ui/state.js";
import {
  createRepairReplayProjection,
  projectRepairTacticalFeedItems,
  projectRepairMeasurementState,
} from "./repair-replay-projection.js";
import type { RepairRuntimeState } from "./repair-runtime-state.js";

export function selectActiveSession(state: RepairRuntimeState): RepairSession | null {
  if (state.activeSessionId === null) {
    return null;
  }
  return state.sessions[state.activeSessionId] ?? null;
}

function selectTacticalFeedProjection(
  state: RepairRuntimeState,
  replay: ReturnType<typeof createRepairReplayProjection>
): RepairTacticalFeedItem[] {
  const activeSession = selectActiveSession(state);
  if (activeSession === null) return [];
  if (state.workbench.timeline.autoFollowLive === false) {
    return replay.tacticalFeed;
  }
  const visibleEventIds = new Set(state.tacticalFeed.map((item) => item.eventId));
  const feed = activeSession.events
    .filter((event) => visibleEventIds.has(event.id))
    .map((event) => repairEventToTacticalFeedItem(event, activeSession.startedAt))
    .filter((item): item is RepairTacticalFeedItem => item !== null);
  return projectRepairTacticalFeedItems(feed, replay.guidance);
}

export function createRepairUiSnapshot(state: RepairRuntimeState): RepairUiState {
  const activeSession = selectActiveSession(state);
  const replay = createRepairReplayProjection(state, activeSession);
  const measurement = projectRepairMeasurementState(state.measurement, replay.visibleEvents);
  const replayLocked = replay.replayMode !== "live" && state.workbench.timeline.isPlaying;
  return {
    phase: state.phase,
    sessions: {
      activeId: state.activeSessionId,
      list: state.sessionList,
      detail: activeSession,
    },
    workbench: {
      ...state.workbench,
      contextualCursor: replayLocked
        ? "replay-scrub-lock"
        : state.workbench.activeTool === "pan"
          ? "pan"
          : state.workbench.activeTool === "measurement-pin"
            ? "measurement"
            : state.workbench.activeTool === "select"
              ? "inspect"
              : "annotate",
      liveSource: replay.liveSource,
      operationalMode: replay.operationalMode,
      measurementEvidence: replay.measurementEvidence,
    },
    tacticalFeed: selectTacticalFeedProjection(state, replay),
    wizard: state.wizard,
    knowledgePack: state.knowledgePack,
    operatorProfile: {
      profile: state.operatorProfile,
      adaptation: state.operatorAdaptation,
      isDirty: false,
    },
    measurement,
    chat: state.chat,
    layout: state.layout,
    guidance: replay.guidance,
    operationsAvailable: replay.operationsAvailable,
    operations: replay.operations,
    voiceReadiness: replay.voiceReadiness,
    continuity: replay.continuity,
    aiDispatch: state.aiDispatch,
    storage: state.storage,
    ambient: {
      nowIso: state.ambientNowIso,
      sessionDurationMs:
        activeSession === null ? 0 : Math.max(0, state.workbench.timeline.playheadMs),
    },
  };
}

export function createRepairUiSnapshotMeta(state: RepairRuntimeState): RepairUiSnapshotMeta {
  const activeSession = selectActiveSession(state);
  const replay = createRepairReplayProjection(state, activeSession);
  return {
    schemaVersion: 1,
    generatedAt: state.ambientNowIso,
    events: activeSession?.events ?? [],
    replay,
  };
}
