import { repairEventToTacticalFeedItem } from "../../shared/data/index.js";
import type { RepairEvent, RepairSession, RepairSessionStatus } from "../../shared/types/index.js";
import type { RepairRuntimeStore } from "../state/repair-runtime-store.js";
import type { RepairLiveController } from "./live-controller.js";
import { buildSessionList, getActiveSession, getSessionTimelineMs } from "./session-helpers.js";
import type { RepairStorageController } from "./storage-controller.js";

// NOTE: Session state machine — legal transitions enforced to prevent inconsistent state.
// draft → research → ready → in-progress → paused → archived (any state can archive)
const REPAIR_LEGAL_SESSION_TRANSITIONS: Record<RepairSessionStatus, RepairSessionStatus[]> = {
  draft: ["research", "ready", "in-progress", "archived"],
  research: ["ready", "in-progress", "archived"],
  ready: ["in-progress", "archived"],
  "in-progress": ["paused", "archived"],
  paused: ["in-progress", "archived"],
  archived: [],
};

export function isLegalSessionTransition(
  from: RepairSessionStatus,
  to: RepairSessionStatus
): boolean {
  if (from === to) return true;
  return REPAIR_LEGAL_SESSION_TRANSITIONS[from].includes(to);
}

export interface RepairSessionController {
  appendEventToActiveSession: (event: RepairEvent) => boolean;
  appendEventsToSession: (sessionId: string, events: RepairEvent[]) => boolean;
  deleteSessionAndList: (sessionId: string) => void;
  setSessionAndList: (
    session: RepairSession,
    options?: { persist?: boolean; skipTransitionCheck?: boolean }
  ) => boolean;
}

export function createRepairSessionController(params: {
  liveController: RepairLiveController;
  log: (level: string, message: string) => void;
  storageController: RepairStorageController;
  store: RepairRuntimeStore;
}): RepairSessionController {
  const { liveController, log, storageController, store } = params;

  function setSessionAndList(
    session: RepairSession,
    options: { persist?: boolean; skipTransitionCheck?: boolean } = {}
  ): boolean {
    const existing = store.getState().sessions[session.id];
    if (existing !== undefined && options.skipTransitionCheck !== true) {
      if (!isLegalSessionTransition(existing.status, session.status)) {
        log(
          "warn",
          `[repair-room] blocked illegal session transition: ${existing.status} → ${session.status} (session=${session.id})`
        );
        return false;
      }
    }
    const nextSessions = {
      ...store.getState().sessions,
      [session.id]: session,
    };
    store.dispatchMany([
      { type: "session/upsert", session },
      { type: "session-list/set", list: buildSessionList(nextSessions) },
    ]);
    if (options.persist !== false) {
      storageController.queuePersistSession(session);
    }
    return true;
  }

  function deleteSessionAndList(sessionId: string): void {
    const { [sessionId]: _deleted, ...nextSessions } = store.getState().sessions;
    store.dispatchMany([
      { type: "session/delete", sessionId },
      { type: "session-list/set", list: buildSessionList(nextSessions) },
    ]);
  }

  function appendEventToActiveSession(event: RepairEvent): boolean {
    const state = store.getState();
    const session = getActiveSession(state);
    if (session === null) return false;

    const nextSession = {
      ...session,
      events: [...session.events, event],
      updatedAt: event.occurredAt,
    };
    const feedItem = repairEventToTacticalFeedItem(event, session.startedAt);
    const timeline = store.getState().workbench.timeline;
    const saved = setSessionAndList(nextSession, { skipTransitionCheck: true });
    if (!saved) return false;
    store.batch(() => {
      if (feedItem !== null) {
        store.dispatch({ type: "tactical-feed/append", item: feedItem });
      }
      if (timeline.autoFollowLive) {
        store.dispatch({
          type: "workbench/set-timeline",
          playheadMs: getSessionTimelineMs(nextSession),
          zoom: timeline.zoom,
          rangeStartMs: timeline.rangeStartMs,
          rangeEndMs: timeline.rangeEndMs,
          autoFollowLive: true,
          replayMode: "live",
          isPlaying: true,
          liveEdgeMs: getSessionTimelineMs(nextSession),
        });
      }
    });
    liveController.resetTimelineAnchor(nextSession);
    return true;
  }

  function appendEventsToSession(sessionId: string, events: RepairEvent[]): boolean {
    if (events.length === 0) return true;
    const state = store.getState();
    const session = state.sessions[sessionId];
    if (session === undefined) return false;

    const nextSession: RepairSession = {
      ...session,
      events: [...session.events, ...events],
      updatedAt: events.at(-1)?.occurredAt ?? session.updatedAt,
    };
    const active = state.activeSessionId === sessionId;
    const feedItems = active
      ? events.flatMap((event) => {
          const item = repairEventToTacticalFeedItem(event, session.startedAt);
          return item === null ? [] : [item];
        })
      : [];
    const timeline = state.workbench.timeline;

    const saved = setSessionAndList(nextSession, { skipTransitionCheck: true });
    if (!saved) return false;
    store.batch(() => {
      feedItems.forEach((item) => {
        store.dispatch({ type: "tactical-feed/append", item });
      });
      if (active && timeline.autoFollowLive) {
        const liveEdgeMs = getSessionTimelineMs(nextSession);
        store.dispatch({
          type: "workbench/set-timeline",
          playheadMs: liveEdgeMs,
          zoom: timeline.zoom,
          rangeStartMs: timeline.rangeStartMs,
          rangeEndMs: timeline.rangeEndMs,
          autoFollowLive: true,
          replayMode: "live",
          isPlaying: true,
          liveEdgeMs,
        });
      }
    });
    if (active) {
      liveController.resetTimelineAnchor(nextSession);
    }
    return true;
  }

  return {
    appendEventToActiveSession,
    appendEventsToSession,
    deleteSessionAndList,
    setSessionAndList,
  };
}
