import {
  REPAIR_AMBIENT_CLOCK_INTERVAL_MS,
  REPAIR_FEED_EVENT_MAX_DELAY_MS,
  REPAIR_FEED_EVENT_MIN_DELAY_MS,
} from "../../shared/repair-constants.js";
import { buildTacticalFeedItems } from "../../shared/data/index.js";
import type { RepairSession } from "../../shared/types/index.js";
import type { RepairRuntimeStore } from "../state/repair-runtime-store.js";
import { getActiveSession, getSessionTimelineMs } from "./session-helpers.js";

function unrefTimer(timer: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>): void {
  if (typeof timer === "object" && typeof timer.unref === "function") {
    timer.unref();
  }
}

export interface RepairLiveController {
  clearFeedStream: () => void;
  createLiveSessionIso: (session: RepairSession) => string;
  dispose: () => void;
  getLiveTimelinePlayheadMs: (session: RepairSession, nowMs?: number) => number;
  resetTimelineAnchor: (session: RepairSession | null) => void;
  scheduleFeedStream: () => void;
  startLiveLoops: () => void;
}

export function createRepairLiveController(params: {
  store: RepairRuntimeStore;
}): RepairLiveController {
  const { store } = params;
  const feedTimeouts = new Set<ReturnType<typeof setTimeout>>();
  let clockInterval: ReturnType<typeof setInterval> | null = null;
  let liveTimelineSessionId = store.getState().activeSessionId;

  function resetTimelineAnchor(session: RepairSession | null): void {
    liveTimelineSessionId = session?.id ?? null;
  }

  function getLiveTimelinePlayheadMs(session: RepairSession, _nowMs = Date.now()): number {
    if (liveTimelineSessionId !== session.id) {
      resetTimelineAnchor(session);
    }
    return getSessionTimelineMs(session);
  }

  function createLiveSessionIso(_session: RepairSession): string {
    return new Date().toISOString();
  }

  function clearFeedStream(): void {
    feedTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    feedTimeouts.clear();
  }

  function scheduleFeedStream(): void {
    clearFeedStream();
    const state = store.getState();
    const session = getActiveSession(state);
    if (session === null || session.status !== "in-progress") return;

    const visibleIds = new Set(state.tacticalFeed.map((item) => item.eventId));
    const pending = buildTacticalFeedItems(session.events, session.startedAt).filter(
      (item) => !visibleIds.has(item.eventId)
    );

    let elapsedMs = 0;
    pending.forEach((item, index) => {
      const delay =
        index % 2 === 0 ? REPAIR_FEED_EVENT_MIN_DELAY_MS : REPAIR_FEED_EVENT_MAX_DELAY_MS;
      elapsedMs += delay;
      const timeoutId = setTimeout(() => {
        const current = store.getState();
        const currentSession = getActiveSession(current);
        const alreadyVisible = current.tacticalFeed.some(
          (feedItem) => feedItem.eventId === item.eventId
        );
        if (currentSession?.id === session.id && alreadyVisible === false) {
          store.dispatch({ type: "tactical-feed/append", item });
        }
        feedTimeouts.delete(timeoutId);
      }, elapsedMs);
      unrefTimer(timeoutId);
      feedTimeouts.add(timeoutId);
    });
  }

  function startLiveLoops(): void {
    if (clockInterval === null) {
      clockInterval = setInterval(() => {
        const iso = new Date().toISOString();
        store.dispatch({ type: "ambient/tick", nowIso: iso });
      }, REPAIR_AMBIENT_CLOCK_INTERVAL_MS);
      unrefTimer(clockInterval);
    }

    scheduleFeedStream();
  }

  function dispose(): void {
    clearFeedStream();
    if (clockInterval !== null) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
  }

  return {
    clearFeedStream,
    createLiveSessionIso,
    dispose,
    getLiveTimelinePlayheadMs,
    resetTimelineAnchor,
    scheduleFeedStream,
    startLiveLoops,
  };
}
